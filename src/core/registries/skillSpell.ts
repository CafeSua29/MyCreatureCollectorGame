// Phần spell Siralim của skill (mục "Spell Siralim" ở battle.md): kiểm tra dữ liệu và tra cứu
// cho công thức sát thương / dùng skill. Hiệu ứng, bộ đếm, điều kiện dùng chung "ngôn ngữ" trait
// (traitDsl.ts); chạy hiệu ứng ở battle/executeSkill.ts.

import { asObject, checkNumber } from '../shared'
import type { GameData, Skill } from '../model'
import {
  AMOUNT_STATS,
  checkConditions,
  checkCounter,
  checkTraitEffects,
  type CounterSpec,
  type DslCondition,
  type TraitEffect
} from './traitDsl'
import { checkAllConditions, counterValue, type DslView } from './traitConditions'
import type { StatBlend } from './passiveTraitHooks'

/** Một mục cộng % sức mạnh của spell. */
export interface SpellPowerBonus {
  percent: number
  per?: CounterSpec
  when?: DslCondition[]
}

const SPELL_FIELDS = [
  'requires',
  'onTarget',
  'after',
  'powerBonus',
  'powerTimes',
  'attackStat',
  'ignoreDefensePercent'
]

function checkPowerBonus(value: unknown, field: string, data: GameData): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${field} phải là danh sách không rỗng`]
  return value.flatMap((entry, i) => {
    const where = `${field}[${i}]`
    const obj = asObject(entry)
    if (!obj) return [`${where} phải là object`]
    return [
      ...checkNumber(obj.percent, `${where}.percent`),
      ...(obj.per === undefined ? [] : checkCounter(obj.per, `${where}.per`, data)),
      ...checkConditions(obj.when, `${where}.when`, data)
    ]
  })
}

/** Kiểm tra phần spell của skill (trường lạ, hiệu ứng, bộ đếm, điều kiện, chỉ số). */
export function checkSkillSpell(value: unknown, data: GameData): string[] {
  const obj = asObject(value)
  if (!obj) return ['spell phải là object']
  const issues = Object.keys(obj)
    .filter((key) => !SPELL_FIELDS.includes(key))
    .map((key) => `spell: trường lạ "${key}"`)
  if (Object.keys(obj).length === 0) issues.push('spell không được rỗng')
  if (obj.requires !== undefined) {
    issues.push(...checkConditions(obj.requires, 'spell.requires', data))
    if (Array.isArray(obj.requires) && obj.requires.length === 0) {
      issues.push('spell.requires phải là danh sách không rỗng')
    }
  }
  if (obj.onTarget !== undefined)
    issues.push(...checkTraitEffects(obj.onTarget, 'spell.onTarget', data))
  if (obj.after !== undefined) issues.push(...checkTraitEffects(obj.after, 'spell.after', data))
  if (obj.powerBonus !== undefined) {
    issues.push(...checkPowerBonus(obj.powerBonus, 'spell.powerBonus', data))
  }
  if (obj.powerTimes !== undefined) {
    issues.push(...checkCounter(obj.powerTimes, 'spell.powerTimes', data))
  }
  if (obj.attackStat !== undefined) {
    const blend = asObject(obj.attackStat)
    if (!blend) issues.push('spell.attackStat phải là object')
    else {
      if (
        !(AMOUNT_STATS as readonly unknown[]).includes(blend.stat) &&
        blend.stat !== 'currentHp'
      ) {
        issues.push('spell.attackStat.stat không hợp lệ')
      }
      issues.push(...checkNumber(blend.weight, 'spell.attackStat.weight', 0, 100))
    }
  }
  if (obj.ignoreDefensePercent !== undefined) {
    issues.push(...checkNumber(obj.ignoreDefensePercent, 'spell.ignoreDefensePercent', 0, 100))
  }
  return issues
}

// Các hàm đọc dưới đây ép kiểu vì phần spell đã qua checkSkillSpell lúc nạp dữ liệu.

/**
 * Skill đủ điều kiện dùng lên mục tiêu không (`requires`, góc nhìn: self = quái dùng, target =
 * other = mục tiêu); không có `requires` thì luôn đủ.
 */
export function meetsSpellRequirements(
  skill: Skill,
  view: DslView,
  { ignoreTurnState = false }: { ignoreTurnState?: boolean } = {}
): boolean {
  const requires = skill.spell?.requires as DslCondition[] | undefined
  if (requires === undefined) return true
  // AI chọn lệnh trước khi lượt chạy: điều kiện theo việc trong lượt chưa biết nên coi như thỏa.
  const known = ignoreTurnState
    ? requires.filter((condition) => !TURN_STATE_CONDITIONS.includes(condition.if))
    : requires
  return checkAllConditions(view, known)
}

/** Điều kiện theo việc xảy ra trong lượt đang xử lý (chưa biết lúc chọn lệnh). */
const TURN_STATE_CONDITIONS: readonly DslCondition['if'][] = [
  'pendingSkill',
  'actedThisTurn',
  'hitThisTurn',
  'statsChangedThisTurn',
  'previousSkillThisTurn'
]

/** Hiệu ứng lên từng mục tiêu trúng của spell (rỗng nếu không có). */
export const spellTargetEffects = (skill: Skill): readonly TraitEffect[] =>
  (skill.spell?.onTarget ?? []) as TraitEffect[]

/** Hiệu ứng một lần sau cả chiêu của spell (rỗng nếu không có). */
export const spellAfterEffects = (skill: Skill): readonly TraitEffect[] =>
  (skill.spell?.after ?? []) as TraitEffect[]

/** Chỉ số công thay thế của spell (undefined nếu không có). */
export const spellAttackBlend = (skill: Skill): StatBlend | undefined =>
  skill.spell?.attackStat as StatBlend | undefined

/** % thủ mục tiêu bị bỏ qua của spell. */
export const spellDefenseIgnored = (skill: Skill): number => skill.spell?.ignoreDefensePercent ?? 0

/**
 * Hệ số sức mạnh của spell theo góc nhìn (self = quái dùng, target = mục tiêu): tích các mục
 * (1 + % × bộ đếm) và bộ đếm `powerTimes`, không âm.
 */
export function spellPowerMultiplier(skill: Skill, view: DslView): number {
  const bonuses = (skill.spell?.powerBonus ?? []) as SpellPowerBonus[]
  const times = skill.spell?.powerTimes as CounterSpec | undefined
  let multiplier = times ? Math.max(0, counterValue(view, times)) : 1
  for (const bonus of bonuses) {
    if (!checkAllConditions(view, bonus.when)) continue
    const count = bonus.per ? counterValue(view, bonus.per) : 1
    multiplier *= Math.max(0, 1 + (bonus.percent * count) / 100)
  }
  return multiplier
}
