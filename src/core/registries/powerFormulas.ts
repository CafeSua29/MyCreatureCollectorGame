// Power theo công thức của skill (docs/rules/pokemon-moves.md mục "Power theo công thức"), như chiêu
// Pokémon có power thay đổi: theo % máu (Eruption, Crush Grip, Flail), tỉ lệ tốc độ (Gyro Ball,
// Electro Ball), cân nặng (Grass Knot, Heavy Slam), tổng bậc tăng (Stored Power, Punishment), bộ đếm
// trận (Last Respects, Rage Fist), thân mật (Return, Frustration). Hai dạng: tuyến tính và bảng mốc;
// giá trị đầu vào đọc từ quái dùng (`self`) hoặc mục tiêu (`target`). Số nằm trong dữ liệu skill.

import { asObject, assertNever, checkNumber, type Decimal } from '../shared'
import { NON_HP_STATS, type GameData, type Monster, type NonHpStat } from '../model'
import { checkCounter, type CounterSpec } from './traitDsl'
import { counterValue, resolveWho, type DslView } from './traitConditions'
import { monsterWeightKg } from './weight'
import { forEachTraitHook } from './traitHooks'

/** Quái đọc giá trị: quái dùng skill hoặc mục tiêu. */
export type PowerWho = 'self' | 'target'

/** Giá trị đầu vào của công thức. */
export type PowerValue =
  | { of: 'hpPercent'; who: PowerWho }
  | { of: 'stat'; stat: NonHpStat; who: PowerWho }
  | { of: 'weight'; who: PowerWho }
  | { of: 'positiveStages'; who: PowerWho }
  | { of: 'affinityPercent'; who: PowerWho }
  | { of: 'counter'; counter: CounterSpec }
  /** Số của món đang cầm đầu tiên có số đó (Fling: flingPower; Natural Gift: power của berry). */
  | { of: 'heldItem'; field: 'flingPower' | 'naturalGiftPower'; who: PowerWho }
  | { of: 'ratio'; numerator: PowerValue; denominator: PowerValue }

/** Một mốc của bảng: giá trị ≥ atLeast và / hoặc < below thì power này (mốc đầu tiên thỏa). */
export interface PowerStep {
  atLeast?: number
  below?: number
  power: number
}

export type PowerFormula =
  | { type: 'linear'; value: PowerValue; times: number; plus?: number; min?: number; max?: number }
  | { type: 'steps'; value: PowerValue; steps: PowerStep[]; otherwise: number }

/** Môi trường tính power: góc nhìn DSL (self = quái dùng, target = mục tiêu) và chỉ số trong trận. */
export interface PowerFormulaEnv {
  view: DslView
  /** Chỉ số cuối trong trận của quái (đã tính bậc, môi trường). */
  readStat(monster: Monster, stat: NonHpStat): Decimal
  /** Tỉ lệ máu hiện tại / max HP (0–1). */
  hpRatio(monster: Monster): number
}

/** Power tối thiểu như Pokémon (công thức ra 0 vẫn đánh power 1). */
const MIN_POWER = 1

function readValue(value: PowerValue, env: PowerFormulaEnv): number {
  const { view } = env
  const found =
    value.of === 'counter' || value.of === 'ratio' ? undefined : resolveWho(view, value.who)
  switch (value.of) {
    case 'hpPercent':
      return found ? env.hpRatio(found.monster) * 100 : 0
    case 'stat':
      return found ? env.readStat(found.monster, value.stat).toNumber() : 0
    case 'weight': {
      if (!found) return 0
      // Heavy Metal / Light Metal: hệ số cân nặng trong trận.
      let multiplier = 1
      forEachTraitHook(
        view.data,
        found.monster,
        (handler, params) => {
          multiplier *= handler.weightMultiplier?.(params) ?? 1
        },
        found.ctx
      )
      return monsterWeightKg(view.data, found.monster) * multiplier
    }
    case 'positiveStages':
      return Object.values(found?.ctx?.stages ?? {}).reduce(
        (sum, stage) => sum + Math.max(0, stage ?? 0),
        0
      )
    case 'affinityPercent':
      return found ? (found.monster.affinity / view.data.config.affinity.max) * 100 : 0
    case 'counter':
      return counterValue(view, value.counter)
    case 'heldItem':
      return found ? heldItemNumber(view.data, found.monster, value.field) : 0
    case 'ratio': {
      const denominator = readValue(value.denominator, env)
      return denominator > 0 ? readValue(value.numerator, env) / denominator : Infinity
    }
    default:
      return assertNever(value, 'giá trị power')
  }
}

/** Số của món đang lắp đầu tiên có số đó (0 = không có). */
export function heldItemNumber(
  data: GameData,
  monster: Monster,
  field: 'flingPower' | 'naturalGiftPower'
): number {
  for (const entry of monster.equipment) {
    if (entry.storage !== 'stack') continue
    const item = data.items[entry.itemId]
    if (item?.category !== 'held') continue
    const value = field === 'flingPower' ? item.flingPower : item.naturalGift?.power
    if (value !== undefined) return value
  }
  return 0
}

const matchesStep = (step: PowerStep, amount: number): boolean =>
  (step.atLeast === undefined || amount >= step.atLeast) &&
  (step.below === undefined || amount < step.below)

/** Power theo công thức (làm tròn xuống, tối thiểu 1). */
export function formulaPower(formula: PowerFormula, env: PowerFormulaEnv): number {
  const amount = readValue(formula.value, env)
  switch (formula.type) {
    case 'linear': {
      const raw = Number.isFinite(amount) ? amount * formula.times + (formula.plus ?? 0) : Infinity
      const capped = Math.min(formula.max ?? Infinity, Math.max(formula.min ?? MIN_POWER, raw))
      return Math.max(MIN_POWER, Math.floor(Number.isFinite(capped) ? capped : MIN_POWER))
    }
    case 'steps':
      return formula.steps.find((step) => matchesStep(step, amount))?.power ?? formula.otherwise
    default:
      return assertNever(formula, 'công thức power')
  }
}

// ---------- Kiểm tra dữ liệu ----------

const VALUE_KINDS = [
  'hpPercent',
  'stat',
  'weight',
  'positiveStages',
  'affinityPercent',
  'counter',
  'ratio',
  'heldItem'
]

function checkValue(value: unknown, field: string, data: GameData): string[] {
  const obj = asObject(value)
  if (!obj) return [`${field} phải là object`]
  if (!VALUE_KINDS.includes(obj.of as string))
    return [`${field}.of phải là ${VALUE_KINDS.join(' / ')}`]
  const whoIssues =
    obj.who === 'self' || obj.who === 'target' ? [] : [`${field}.who phải là self / target`]
  switch (obj.of) {
    case 'stat':
      return [
        ...whoIssues,
        ...((NON_HP_STATS as readonly unknown[]).includes(obj.stat)
          ? []
          : [`${field}.stat phải là chỉ số khác hp`])
      ]
    case 'counter':
      return checkCounter(obj.counter, `${field}.counter`, data)
    case 'heldItem':
      return [
        ...whoIssues,
        ...(obj.field === 'flingPower' || obj.field === 'naturalGiftPower'
          ? []
          : [`${field}.field phải là flingPower / naturalGiftPower`])
      ]
    case 'ratio':
      return [
        ...checkValue(obj.numerator, `${field}.numerator`, data),
        ...checkValue(obj.denominator, `${field}.denominator`, data)
      ]
    default:
      return whoIssues
  }
}

function checkSteps(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${field} phải là danh sách không rỗng`]
  return value.flatMap((entry, i) => {
    const step = asObject(entry)
    const where = `${field}[${i}]`
    if (!step) return [`${where} phải là object`]
    const issues = checkNumber(step.power, `${where}.power`, 1)
    if (step.atLeast === undefined && step.below === undefined) {
      issues.push(`${where} cần atLeast hoặc below`)
    }
    if (step.atLeast !== undefined) issues.push(...checkNumber(step.atLeast, `${where}.atLeast`))
    if (step.below !== undefined) issues.push(...checkNumber(step.below, `${where}.below`))
    return issues
  })
}

/** Kiểm tra `powerFormula` của skill. */
export function checkPowerFormula(value: unknown, data: GameData): string[] {
  const obj = asObject(value)
  if (!obj) return ['powerFormula phải là object']
  const issues = checkValue(obj.value, 'powerFormula.value', data)
  switch (obj.type) {
    case 'linear':
      issues.push(...checkNumber(obj.times, 'powerFormula.times'))
      for (const key of ['plus', 'min', 'max'] as const) {
        if (obj[key] !== undefined) issues.push(...checkNumber(obj[key], `powerFormula.${key}`))
      }
      return issues
    case 'steps':
      return [
        ...issues,
        ...checkSteps(obj.steps, 'powerFormula.steps'),
        ...checkNumber(obj.otherwise, 'powerFormula.otherwise', 1)
      ]
    default:
      return [...issues, 'powerFormula.type phải là linear / steps']
  }
}
