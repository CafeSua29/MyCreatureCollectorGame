// Hook trait thụ động dùng chung cho trait Siralim, buff / debuff và minion (mục "Trait Siralim" ở
// battle.md): sát thương / chỉ số theo điều kiện và bộ đếm, chí mạng / né độc lập, bỏ qua sát
// thương, chặn đòn, thứ tự lượt, trạng thái, minion. Điều kiện (`when`) và bộ đếm (`per`) theo
// "ngôn ngữ" trait (traitDsl.ts), tính ở traitConditions.ts. Quy ước cấp: chỉ nhân % và tỉ lệ
// (kẹp 100 khi là xác suất); ngưỡng, số lượt, id, bật / tắt giữ nguyên.

import { asObject, checkInteger, checkNumber } from '../shared'
import {
  NON_HP_STATS,
  SKILL_CATEGORIES,
  STATUS_KINDS,
  type GameData,
  type NonHpStat,
  type PartialStats,
  type SkillCategory,
  type StatusKind
} from '../model'
import type { TraitHookHandler } from './traitHooks'
import { checkIdList, isStageStat } from './paramChecks'
import {
  AMOUNT_STATS,
  checkAmount,
  checkConditions,
  checkCounter,
  type AmountSpec,
  type AmountStat,
  type CounterSpec,
  type DslCondition
} from './traitDsl'
import { checkAllConditions, counterValue, type DslView } from './traitConditions'
import { scaleStats, validatePartialStats, validateEmptyParams } from './traitHookUtils'

// ---------- Pha mới của handler ----------

export interface ExtraHits {
  count: number
  /** % sát thương mỗi đòn (cả đòn gốc). */
  damagePercent: number
}

export interface RepeatSkill {
  extra: number
  /** % sát thương / hiệu quả mỗi lần dùng (cả lần gốc). */
  damagePercent: number
}

/** Chỉ số thay thế công khi đánh (một phần `weight`% sát thương tính bằng chỉ số này). */
export interface StatBlend {
  stat: AmountStat | 'currentHp'
  weight: number
}

export type EffectivenessMode = 'alwaysStrong' | 'reverse' | 'neverWeak'

/** Đổi trạng thái sắp dính sang loại khác / sang quái khác. */
export interface StatusConversion {
  from: StatusKind
  /** Loại trạng thái ngẫu nhiên thay thế; bỏ trống = giữ trạng thái gốc. */
  to?: StatusKind
  chance: number
  /** Dính lên ai thì đổi: quái mang trait (self), địch của nó (foe), đồng đội (ally). */
  onto: 'self' | 'foe' | 'ally'
  /** Chuyển trạng thái sang: quái mang trait (steal) / một địch ngẫu nhiên (reflect). */
  redirect?: 'steal' | 'reflect'
}

/** Thời hạn trạng thái bị trait ghi đè. */
export interface StatusDurationRule {
  kind?: StatusKind
  statusIds?: string[]
  /** null = kéo dài mãi. */
  turns: number | null
  /** inflicted: trạng thái quái mang trait gây ra; received: trạng thái nó dính. */
  on: 'inflicted' | 'received'
}

export interface PassiveTraitPhases {
  /** % sát thương gây ra cộng thêm theo bối cảnh (view: attacker = quái mang, target = bên nhận). */
  damageDealtPercent?(params: unknown, scale: number, view: DslView): number
  /** % sát thương nhận vào cộng thêm theo bối cảnh (view: self = bên nhận, attacker = bên đánh). */
  damageTakenPercent?(params: unknown, scale: number, view: DslView): number
  /** % chỉ số (không gồm hp) theo bối cảnh trận (bước trait của computeStats). */
  contextStatPercent?(params: unknown, scale: number, view: DslView): PartialStats
  guaranteesCritical?(params: unknown, view: DslView): boolean
  preventsOwnCritical?(params: unknown, view: DslView): boolean
  preventsDodge?(params: unknown, view: DslView): boolean
  /** Đòn của quái mang trait không bị né (view: self = bên đánh). */
  ignoresDodge?(params: unknown, view: DslView): boolean
  /** % chí mạng tung độc lập thêm (kiểu Savage). */
  bonusCritChance?(params: unknown, scale: number, view: DslView): number
  /** % sát thương chí mạng cộng thêm theo bối cảnh. */
  contextCritDamagePercent?(params: unknown, scale: number, view: DslView): number
  /** % thủ mục tiêu bỏ qua theo bối cảnh. */
  contextDefenseIgnoredPercent?(params: unknown, scale: number, view: DslView): number
  /** % né độc lập (tung sau accuracy). */
  dodgeChance?(params: unknown, scale: number, view: DslView): number
  /** % bỏ qua hoàn toàn sát thương (view: self = bên nhận). */
  negateDamageChance?(params: unknown, scale: number, view: DslView): number
  /** Một lần mất máu tối đa % max HP. */
  damageCapPercent?(params: unknown, scale: number): number
  extraHits?(params: unknown, scale: number, category: SkillCategory): ExtraHits | null
  damageVariance?(params: unknown): { min: number; max: number }
  healingReceivedPercent?(params: unknown, scale: number): number
  healingDealtPercent?(params: unknown, scale: number): number
  attackStatBlend?(params: unknown, category: SkillCategory): StatBlend | null
  /** Sát thương cộng thêm vào đòn (lượng theo traitDsl). */
  bonusDamage?(params: unknown, scale: number, view: DslView): AmountSpec | null
  effectivenessMode?(params: unknown): EffectivenessMode
  immuneToDebuffs?(params: unknown, view: DslView): boolean
  debuffResistChance?(params: unknown, scale: number, view: DslView, statusId: string): number
  turnOrderStat?(params: unknown): NonHpStat
  startPosition?(params: unknown, scale: number): { position: 'top' | 'bottom'; chance: number }
  /** % chặn đòn đơn mục tiêu nhắm đồng đội (view: subject = đồng đội bị nhắm, other = kẻ đánh). */
  interceptChance?(params: unknown, scale: number, view: DslView): number
  /** % sát thương đồng đội nhận được quái mang trait gánh thay. */
  damageSharePercent?(params: unknown, scale: number): number
  repeatSkill?(params: unknown, scale: number, category: SkillCategory): RepeatSkill | null
  /** Loại skill quái mang trait không tự chọn dùng được (trait vẫn dùng được). */
  blockedCategories?(params: unknown): readonly SkillCategory[]
  /** Hệ số nhân số bậc trận được tăng / bị giảm (làm tròn, tối thiểu 1 khi > 0). */
  stageChangeMultiplier?(params: unknown, scale: number): { gain: number; loss: number }
  blocksStatGain?(params: unknown, view?: DslView): boolean
  /** % sát thương gián tiếp nhận vào cộng thêm (âm = giảm). */
  indirectDamagePercent?(params: unknown, scale: number): number
  /** Máu không xuống dưới % max HP (trừ khi đòn lớn hơn max HP). */
  hpFloorPercent?(params: unknown, scale: number, view: DslView): number
  statusConversion?(params: unknown, scale: number): StatusConversion
  /** % hành động của quái mang trait bị ngắt (thường phát qua hào quang lên địch). */
  interruptChance?(params: unknown, scale: number, view: DslView): number
  /** Quái mang trait nhắm được địch đang tàng hình (Invisible). */
  seesInvisible?(params: unknown): boolean
  /** % đòn đơn mục tiêu của quái mang trait đổi sang mục tiêu ngẫu nhiên. */
  randomTargetChance?(params: unknown, scale: number): number
  statusDurationRule?(params: unknown): StatusDurationRule
  /** Số lượt cộng thêm cho trạng thái quái mang gây ra (kiểu gậy kéo dài); 0 = không áp. */
  statusDurationBonusTurns?(params: unknown, statusId: string, kind: StatusKind): number
  /** % potency cộng thêm cho trạng thái quái mang trait gây ra. */
  inflictedPotencyPercent?(params: unknown, scale: number, statusId: string): number
  /** % sát thương trạng thái quái mang trait nhận vào cộng thêm. */
  statusDamagePercent?(params: unknown, scale: number, statusId: string): number
  /** Trạng thái này hồi máu thay vì gây sát thương, theo % hiệu quả; 0 = không. */
  statusHealPercent?(params: unknown, statusId: string): number
  blocksStatusGain?(params: unknown, kind: StatusKind, view: DslView): boolean
  minionModifier?(
    params: unknown,
    scale: number,
    minionId: string
  ): { leaveChancePercent: number; extraMaxStacks: number }
}

// ---------- Helper ----------

const checkCategories = (value: unknown, field: string): string[] => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length === 0) return [`${field} phải là danh sách không rỗng`]
  return value.flatMap((c) =>
    (SKILL_CATEGORIES as readonly unknown[]).includes(c)
      ? []
      : [`${field}: loại skill lạ "${String(c)}"`]
  )
}

const matchesCategory = (
  categories: readonly SkillCategory[] | undefined,
  view: DslView
): boolean =>
  categories === undefined || (view.skill !== undefined && categories.includes(view.skill.category))

/** Params có `when` (điều kiện) và `categories` (loại skill) tùy chọn. */
interface Conditional {
  when?: DslCondition[]
  categories?: SkillCategory[]
}

const conditionalOk = (params: Conditional, view: DslView): boolean =>
  matchesCategory(params.categories, view) && checkAllConditions(view, params.when)

function checkConditional(obj: Record<string, unknown>, data: GameData): string[] {
  return [
    ...checkConditions(obj.when, 'when', data),
    ...checkCategories(obj.categories, 'categories')
  ]
}

const clampChance = (value: number): number => Math.min(100, Math.max(0, value))

function withObject(params: unknown, check: (obj: Record<string, unknown>) => string[]): string[] {
  const obj = asObject(params)
  return obj ? check(obj) : ['params phải là object']
}

// ---------- damageDealtModifier / damageTakenWhen ----------

interface PercentConditional extends Conditional {
  percent: number
  /** Nhân với giá trị bộ đếm (kiểu "25% cho mỗi buff của địch"). */
  per?: CounterSpec
}

/** Hệ số bộ đếm của params có `per` (không có = 1). */
const perOf = (params: { per?: CounterSpec }, view: DslView): number =>
  params.per ? Math.max(0, counterValue(view, params.per)) : 1

const checkPer = (obj: Record<string, unknown>, data: GameData): string[] =>
  obj.per === undefined ? [] : checkCounter(obj.per, 'per', data)

const damageDealtModifier: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...checkNumber(obj.percent, 'percent'),
      ...checkConditional(obj, data)
    ]),
  damageDealtPercent(params, scale, view) {
    const p = params as PercentConditional
    return conditionalOk(p, view) ? p.percent * scale : 0
  }
}

const damageTakenWhen: TraitHookHandler = {
  validateParams: damageDealtModifier.validateParams,
  damageTakenPercent(params, scale, view) {
    const p = params as PercentConditional
    return conditionalOk(p, view) ? p.percent * scale : 0
  }
}

// ---------- scaling: hiệu ứng tăng theo bộ đếm ----------

interface ScalingEffect {
  stats?: PartialStats
  damageDealt?: number
  damageTaken?: number
  dodge?: number
  critChance?: number
  critDamage?: number
  defenseIgnored?: number
}

interface ScalingParams extends Conditional {
  per: CounterSpec
  /** Mỗi `step` đơn vị bộ đếm tính một lần (mặc định 1). */
  step?: number
  effect: ScalingEffect
  /** Giới hạn trị tuyệt đối tổng % của mỗi phần hiệu ứng. */
  cap?: number
}

const SCALING_NUMBERS = [
  'damageDealt',
  'damageTaken',
  'dodge',
  'critChance',
  'critDamage',
  'defenseIgnored'
] as const

/** Số lần áp hiệu ứng theo bộ đếm (đã chia step, làm tròn xuống, không âm). */
function scalingUnits(p: ScalingParams, view: DslView): number {
  if (!conditionalOk(p, view)) return 0
  return Math.max(0, Math.floor(counterValue(view, p.per) / (p.step ?? 1)))
}

const capped = (value: number, cap: number | undefined): number =>
  cap === undefined ? value : Math.sign(value) * Math.min(Math.abs(value), cap)

function scalingNumber(
  params: unknown,
  scale: number,
  view: DslView,
  key: (typeof SCALING_NUMBERS)[number]
): number {
  const p = params as ScalingParams
  const amount = p.effect[key]
  if (amount === undefined) return 0
  return capped(amount * scale * scalingUnits(p, view), p.cap)
}

const scaling: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues = [...checkCounter(obj.per, 'per', data), ...checkConditional(obj, data)]
      if (obj.step !== undefined) issues.push(...checkNumber(obj.step, 'step', Number.MIN_VALUE))
      if (obj.cap !== undefined) issues.push(...checkNumber(obj.cap, 'cap', 0))
      const effect = asObject(obj.effect)
      if (!effect) return [...issues, 'effect phải là object']
      issues.push(...validatePartialStats(effect.stats, 'effect.stats'))
      if (asObject(effect.stats)?.hp !== undefined) issues.push('effect.stats không được đổi hp')
      for (const key of SCALING_NUMBERS) {
        if (effect[key] !== undefined) issues.push(...checkNumber(effect[key], `effect.${key}`))
      }
      if (Object.keys(effect).length === 0) issues.push('effect cần ít nhất một phần')
      return issues
    }),
  contextStatPercent(params, scale, view) {
    const p = params as ScalingParams
    if (!p.effect.stats) return {}
    const units = scalingUnits(p, view)
    const result: PartialStats = {}
    for (const [stat, amount] of Object.entries(scaleStats(p.effect.stats, scale * units))) {
      result[stat as keyof PartialStats] = capped(amount ?? 0, p.cap)
    }
    return result
  },
  damageDealtPercent: (params, scale, view) => scalingNumber(params, scale, view, 'damageDealt'),
  damageTakenPercent: (params, scale, view) => scalingNumber(params, scale, view, 'damageTaken'),
  dodgeChance: (params, scale, view) => scalingNumber(params, scale, view, 'dodge'),
  bonusCritChance: (params, scale, view) => scalingNumber(params, scale, view, 'critChance'),
  contextCritDamagePercent: (params, scale, view) =>
    scalingNumber(params, scale, view, 'critDamage'),
  contextDefenseIgnoredPercent: (params, scale, view) =>
    scalingNumber(params, scale, view, 'defenseIgnored')
}

// ---------- statWhen: % chỉ số khi thỏa điều kiện ----------

interface StatWhenParams extends Conditional {
  percent: PartialStats
}

const statWhen: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues = [
        ...validatePartialStats(obj.percent, 'percent'),
        ...checkConditional(obj, data)
      ]
      if (obj.percent === undefined) issues.push('percent là bắt buộc')
      if (asObject(obj.percent)?.hp !== undefined) issues.push('percent không được đổi hp')
      return issues
    }),
  contextStatPercent(params, scale, view) {
    const p = params as StatWhenParams
    return checkAllConditions(view, p.when) ? scaleStats(p.percent, scale) : {}
  }
}

// ---------- highestStatBoost: chỉ số gốc cao nhất của loài + % (Protosynthesis, Quark Drive) ----------

interface HighestStatBoostParams extends Conditional {
  percent: number
  /** % khi chỉ số cao nhất là tốc độ (Pokémon: 50 thay vì 30). */
  speedPercent: number
}

const highestStatBoost: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...checkNumber(obj.percent, 'percent', 0),
      ...checkNumber(obj.speedPercent, 'speedPercent', 0),
      ...checkConditional(obj, data)
    ]),
  contextStatPercent(params, scale, view) {
    const p = params as HighestStatBoostParams
    if (!checkAllConditions(view, p.when)) return {}
    const species = view.data.species[view.self.speciesId]
    if (species?.kind !== 'normal') return {}
    const base = species.baseStats
    const highest = NON_HP_STATS.reduce((best, stat) => (base[stat] > base[best] ? stat : best))
    return { [highest]: (highest === 'speed' ? p.speedPercent : p.percent) * scale }
  }
}

// ---------- Chí mạng, né ----------

const guaranteedCritical: TraitHookHandler = {
  validateParams: (params, data) => withObject(params, (obj) => checkConditional(obj, data)),
  guaranteesCritical: (params, view) => conditionalOk(params as Conditional, view)
}

const cannotCrit: TraitHookHandler = {
  validateParams: (params, data) => withObject(params, (obj) => checkConditional(obj, data)),
  preventsOwnCritical: (params, view) => conditionalOk(params as Conditional, view)
}

const cannotDodge: TraitHookHandler = {
  validateParams: (params, data) => withObject(params, (obj) => checkConditional(obj, data)),
  preventsDodge: (params, view) => conditionalOk(params as Conditional, view)
}

const undodgeable: TraitHookHandler = {
  validateParams: (params, data) => withObject(params, (obj) => checkConditional(obj, data)),
  ignoresDodge: (params, view) => conditionalOk(params as Conditional, view)
}

const critChance: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...checkNumber(obj.percent, 'percent', 0, 100),
      ...checkConditional(obj, data),
      ...checkPer(obj, data)
    ]),
  bonusCritChance(params, scale, view) {
    const p = params as PercentConditional
    return conditionalOk(p, view) ? clampChance(p.percent * scale * perOf(p, view)) : 0
  }
}

const dodge: TraitHookHandler = {
  validateParams: critChance.validateParams,
  dodgeChance(params, scale, view) {
    const p = params as PercentConditional
    return conditionalOk(p, view) ? clampChance(p.percent * scale * perOf(p, view)) : 0
  }
}

// ---------- Bỏ qua sát thương, giới hạn sát thương ----------

/** attack / spell: sát thương skill physical / special; indirect: trạng thái, trait, môi trường. */
type DamageSourceFilter = 'attack' | 'spell' | 'skill' | 'indirect' | 'any'

interface NegateParams extends Conditional {
  chance: number
  source?: DamageSourceFilter
  per?: CounterSpec
}

const DAMAGE_SOURCES: readonly DamageSourceFilter[] = [
  'attack',
  'spell',
  'skill',
  'indirect',
  'any'
]

/** Nguồn sát thương của view có khớp bộ lọc không (không có skill = sát thương gián tiếp). */
export function matchesDamageSource(
  source: DamageSourceFilter | undefined,
  view: DslView
): boolean {
  const category = view.skill?.category
  switch (source ?? 'any') {
    case 'any':
      return true
    case 'skill':
      return category !== undefined
    case 'attack':
      return category === 'physical'
    case 'spell':
      return category === 'special' || category === 'status'
    case 'indirect':
      return category === undefined
  }
}

const negateDamage: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...checkNumber(obj.chance, 'chance', 0, 100),
      ...(obj.source === undefined || DAMAGE_SOURCES.includes(obj.source as DamageSourceFilter)
        ? []
        : [`source phải là một trong ${DAMAGE_SOURCES.join(' / ')}`]),
      ...checkConditions(obj.when, 'when', data),
      ...checkPer(obj, data)
    ]),
  negateDamageChance(params, scale, view) {
    const p = params as NegateParams
    if (!matchesDamageSource(p.source, view) || !checkAllConditions(view, p.when)) return 0
    return clampChance(p.chance * scale * perOf(p, view))
  }
}

const damageCap: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100)),
  // Ngưỡng không đổi theo cấp (quy ước cấp: ngưỡng giữ nguyên).
  damageCapPercent: (params) => (params as { percent: number }).percent
}

const hpFloor: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...checkNumber(obj.percent, 'percent', 0, 100),
      ...checkConditions(obj.when, 'when', data)
    ]),
  hpFloorPercent(params, _scale, view) {
    const p = params as PercentConditional
    return checkAllConditions(view, p.when) ? p.percent : 0
  }
}

// ---------- Đòn thêm, lặp skill, dao động ----------

interface ExtraHitsParams {
  count: number
  damagePercent: number
  categories?: SkillCategory[]
}

const extraHits: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => [
      ...checkInteger(obj.count, 'count', 1),
      ...checkNumber(obj.damagePercent, 'damagePercent', Number.MIN_VALUE),
      ...checkCategories(obj.categories, 'categories')
    ]),
  extraHits(params, _scale, category) {
    const p = params as ExtraHitsParams
    if (!(p.categories ?? ['physical']).includes(category)) return null
    return { count: p.count, damagePercent: p.damagePercent }
  }
}

interface RepeatParams {
  extra: number
  damagePercent?: number
  categories: SkillCategory[]
}

const repeatSkill: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => [
      ...checkInteger(obj.extra, 'extra', 1),
      ...(obj.damagePercent === undefined
        ? []
        : checkNumber(obj.damagePercent, 'damagePercent', Number.MIN_VALUE)),
      ...(obj.categories === undefined
        ? ['categories là bắt buộc']
        : checkCategories(obj.categories, 'categories'))
    ]),
  repeatSkill(params, _scale, category) {
    const p = params as RepeatParams
    return p.categories.includes(category)
      ? { extra: p.extra, damagePercent: p.damagePercent ?? 100 }
      : null
  }
}

const damageVariance: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => {
      const issues = [...checkNumber(obj.min, 'min', 0), ...checkNumber(obj.max, 'max', 0)]
      if (issues.length === 0 && (obj.min as number) > (obj.max as number))
        issues.push('min phải ≤ max')
      return issues
    }),
  damageVariance: (params) => params as { min: number; max: number }
}

// ---------- Hồi máu ----------

const healingModifier: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => {
      if (obj.received === undefined && obj.dealt === undefined) return ['cần received hoặc dealt']
      return [
        ...(obj.received === undefined ? [] : checkNumber(obj.received, 'received', -100)),
        ...(obj.dealt === undefined ? [] : checkNumber(obj.dealt, 'dealt', -100))
      ]
    }),
  healingReceivedPercent: (params, scale) =>
    ((params as { received?: number }).received ?? 0) * scale,
  healingDealtPercent: (params, scale) => ((params as { dealt?: number }).dealt ?? 0) * scale
}

// ---------- Chỉ số công thay thế, sát thương cộng thêm ----------

interface AttackStatParams {
  categories?: SkillCategory[]
  stat: StatBlend['stat']
  weight: number
}

const attackStat: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => [
      ...((AMOUNT_STATS as readonly unknown[]).includes(obj.stat) || obj.stat === 'currentHp'
        ? []
        : ['stat không hợp lệ']),
      ...checkNumber(obj.weight, 'weight', 0, 100),
      ...checkCategories(obj.categories, 'categories')
    ]),
  attackStatBlend(params, category) {
    const p = params as AttackStatParams
    if (category === 'status' || !(p.categories ?? ['physical', 'special']).includes(category)) {
      return null
    }
    return { stat: p.stat, weight: p.weight }
  }
}

interface BonusDamageParams extends Conditional {
  amount: AmountSpec
}

const bonusDamage: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...checkAmount(obj.amount, 'amount', data),
      ...checkConditional(obj, data)
    ]),
  bonusDamage(params, scale, view) {
    const p = params as BonusDamageParams
    if (!conditionalOk(p, view)) return null
    return 'flat' in p.amount ? p.amount : { ...p.amount, percent: p.amount.percent * scale }
  }
}

// ---------- Khắc hệ ----------

const EFFECTIVENESS_MODES: readonly EffectivenessMode[] = ['alwaysStrong', 'reverse', 'neverWeak']

const effectiveness: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) =>
      EFFECTIVENESS_MODES.includes(obj.mode as EffectivenessMode)
        ? []
        : [`mode phải là một trong ${EFFECTIVENESS_MODES.join(' / ')}`]
    ),
  effectivenessMode: (params) => (params as { mode: EffectivenessMode }).mode
}

// ---------- Debuff ----------

const debuffImmunity: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => checkConditions(obj.when, 'when', data)),
  immuneToDebuffs: (params, view) => checkAllConditions(view, (params as Conditional).when)
}

const debuffResist: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...checkNumber(obj.chance, 'chance', 0, 100),
      ...checkConditions(obj.when, 'when', data),
      ...checkPer(obj, data),
      ...(obj.statusIds === undefined
        ? []
        : checkIdList(obj.statusIds, 'statusIds', data.statuses, { label: 'trạng thái' }))
    ]),
  // statusIds bỏ trống = kháng mọi debuff.
  debuffResistChance(params, scale, view, statusId) {
    const p = params as {
      chance: number
      when?: DslCondition[]
      per?: CounterSpec
      statusIds?: string[]
    }
    if (p.statusIds && !p.statusIds.includes(statusId)) return 0
    return checkAllConditions(view, p.when) ? clampChance(p.chance * scale * perOf(p, view)) : 0
  }
}

// ---------- Thứ tự lượt ----------

const turnOrderStat: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => (isStageStat(obj.stat) ? [] : ['stat phải là chỉ số khác hp'])),
  turnOrderStat: (params) => (params as { stat: NonHpStat }).stat
}

const startPosition: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => [
      ...(obj.position === 'top' || obj.position === 'bottom'
        ? []
        : ['position phải là top / bottom']),
      ...(obj.chance === undefined ? [] : checkNumber(obj.chance, 'chance', 0, 100))
    ]),
  startPosition(params, scale) {
    const p = params as { position: 'top' | 'bottom'; chance?: number }
    return {
      position: p.position,
      chance: p.chance === undefined ? 100 : clampChance(p.chance * scale)
    }
  }
}

// ---------- Chặn đòn, gánh sát thương, chọn mục tiêu ----------

const intercept: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...(obj.chance === undefined ? [] : checkNumber(obj.chance, 'chance', 0, 100)),
      ...checkConditions(obj.when, 'when', data)
    ]),
  interceptChance(params, scale, view) {
    const p = params as { chance?: number; when?: DslCondition[] }
    if (!checkAllConditions(view, p.when)) return 0
    return p.chance === undefined ? 100 : clampChance(p.chance * scale)
  }
}

const damageShare: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100)),
  damageSharePercent: (params, scale) =>
    clampChance((params as { percent: number }).percent * scale)
}

const randomTarget: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => checkNumber(obj.chance, 'chance', 0, 100)),
  randomTargetChance: (params, scale) => clampChance((params as { chance: number }).chance * scale)
}

const seeInvisible: TraitHookHandler = {
  validateParams: validateEmptyParams,
  seesInvisible: () => true
}

const blockManual: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) =>
      obj.categories === undefined
        ? ['categories là bắt buộc']
        : checkCategories(obj.categories, 'categories')
    ),
  blockedCategories: (params) => (params as { categories: SkillCategory[] }).categories
}

const interrupt: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...checkNumber(obj.chance, 'chance', 0, 100),
      ...checkConditional(obj, data)
    ]),
  interruptChance(params, scale, view) {
    const p = params as { chance: number } & Conditional
    return conditionalOk(p, view) ? clampChance(p.chance * scale) : 0
  }
}

// ---------- Bậc trận ----------

const stageMultiplier: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => {
      if (obj.gain === undefined && obj.loss === undefined) return ['cần gain hoặc loss']
      return [
        // Âm: đảo chiều (Contrary: gain = loss = −1).
        ...(obj.gain === undefined ? [] : checkNumber(obj.gain, 'gain')),
        ...(obj.loss === undefined ? [] : checkNumber(obj.loss, 'loss'))
      ]
    }),
  // Hệ số nhân không đổi theo cấp (bậc trận giữ nguyên theo quy ước cấp).
  stageChangeMultiplier(params) {
    const p = params as { gain?: number; loss?: number }
    return { gain: p.gain ?? 1, loss: p.loss ?? 1 }
  }
}

const statGainBlock: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => checkConditions(obj.when, 'when', data)),
  blocksStatGain: (params, view) =>
    view === undefined || checkAllConditions(view, (params as Conditional).when)
}

// ---------- Sát thương gián tiếp ----------

const indirectDamage: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => checkNumber(obj.percent, 'percent', -100)),
  indirectDamagePercent: (params, scale) => (params as { percent: number }).percent * scale
}

// ---------- Trạng thái ----------

const statusConversion: TraitHookHandler = {
  validateParams: (params) =>
    withObject(params, (obj) => {
      const kinds = STATUS_KINDS as readonly unknown[]
      const issues = [...checkNumber(obj.chance, 'chance', 0, 100)]
      if (!kinds.includes(obj.from)) issues.push('from phải là buff / debuff')
      if (obj.to !== undefined && !kinds.includes(obj.to)) issues.push('to phải là buff / debuff')
      if (obj.onto !== 'self' && obj.onto !== 'foe' && obj.onto !== 'ally') {
        issues.push('onto phải là self / foe / ally')
      }
      if (obj.redirect !== undefined && obj.redirect !== 'steal' && obj.redirect !== 'reflect') {
        issues.push('redirect phải là steal / reflect')
      }
      if (obj.to === undefined && obj.redirect === undefined) issues.push('cần to hoặc redirect')
      return issues
    }),
  statusConversion(params, scale) {
    const p = params as StatusConversion
    return { ...p, chance: clampChance(p.chance * scale) }
  }
}

/** Lọc trạng thái theo loại / danh sách id (bỏ trống = mọi trạng thái). */
interface StatusDurationBonusParams {
  turns: number
  kind?: StatusKind
  statusIds?: string[]
}

// Trang bị kiểu gậy (mục "Trang bị và đồ cầm"): mọi trạng thái do quái mang gây ra (kể cả ngủ) được
// cộng thêm số lượt vào số lượt đã tung; trạng thái không hết theo lượt thì không đổi. Số lượt
// không đổi theo cấp (quy ước cấp trait).
const statusDurationBonus: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues = checkInteger(obj.turns, 'turns', 1)
      if (obj.kind !== undefined && !(STATUS_KINDS as readonly unknown[]).includes(obj.kind)) {
        issues.push('kind phải là buff / debuff')
      }
      if (obj.statusIds !== undefined) {
        issues.push(
          ...checkIdList(obj.statusIds, 'statusIds', data.statuses, { label: 'trạng thái' })
        )
      }
      return issues
    }),
  statusDurationBonusTurns(params, statusId, kind) {
    const p = params as StatusDurationBonusParams
    if (p.kind !== undefined && p.kind !== kind) return 0
    if (p.statusIds !== undefined && !p.statusIds.includes(statusId)) return 0
    return p.turns
  }
}

const statusDuration: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues: string[] = []
      if (obj.kind !== undefined && !(STATUS_KINDS as readonly unknown[]).includes(obj.kind)) {
        issues.push('kind phải là buff / debuff')
      }
      if (obj.statusIds !== undefined) {
        issues.push(
          ...checkIdList(obj.statusIds, 'statusIds', data.statuses, { label: 'trạng thái' })
        )
      }
      if (obj.turns !== null) issues.push(...checkInteger(obj.turns, 'turns', 1))
      if (obj.on !== 'inflicted' && obj.on !== 'received')
        issues.push('on phải là inflicted / received')
      return issues
    }),
  statusDurationRule: (params) => params as StatusDurationRule
}

interface StatusIdsPercent {
  statusIds: string[]
  percent: number
}

const checkStatusIdsPercent = (params: unknown, data: GameData, min = -Infinity): string[] =>
  withObject(params, (obj) => [
    ...checkIdList(obj.statusIds, 'statusIds', data.statuses, { label: 'trạng thái' }),
    ...checkNumber(obj.percent, 'percent', min)
  ])

const inflictPotency: TraitHookHandler = {
  validateParams: (params, data) => checkStatusIdsPercent(params, data),
  inflictedPotencyPercent(params, scale, statusId) {
    const p = params as StatusIdsPercent
    return p.statusIds.includes(statusId) ? p.percent * scale : 0
  }
}

const statusDamageModifier: TraitHookHandler = {
  validateParams: (params, data) => checkStatusIdsPercent(params, data, -100),
  statusDamagePercent(params, scale, statusId) {
    const p = params as StatusIdsPercent
    return p.statusIds.includes(statusId) ? p.percent * scale : 0
  }
}

const statusHeals: TraitHookHandler = {
  validateParams: (params, data) => checkStatusIdsPercent(params, data, Number.MIN_VALUE),
  statusHealPercent(params, statusId) {
    const p = params as StatusIdsPercent
    return p.statusIds.includes(statusId) ? p.percent : 0
  }
}

const statusGainBlock: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => [
      ...((STATUS_KINDS as readonly unknown[]).includes(obj.kind)
        ? []
        : ['kind phải là buff / debuff']),
      ...checkConditions(obj.when, 'when', data)
    ]),
  blocksStatusGain(params, kind, view) {
    const p = params as { kind: StatusKind; when?: DslCondition[] }
    return p.kind === kind && checkAllConditions(view, p.when)
  }
}

// ---------- Minion ----------

const minionModifier: TraitHookHandler = {
  validateParams: (params, data) =>
    withObject(params, (obj) => {
      const issues: string[] = []
      if (obj.minionIds !== undefined) {
        issues.push(...checkIdList(obj.minionIds, 'minionIds', data.minions, { label: 'minion' }))
      }
      if (obj.leaveChancePercent === undefined && obj.extraMaxStacks === undefined) {
        issues.push('cần leaveChancePercent hoặc extraMaxStacks')
      }
      if (obj.leaveChancePercent !== undefined) {
        issues.push(...checkNumber(obj.leaveChancePercent, 'leaveChancePercent', -100))
      }
      if (obj.extraMaxStacks !== undefined)
        issues.push(...checkInteger(obj.extraMaxStacks, 'extraMaxStacks', 1))
      return issues
    }),
  minionModifier(params, scale, minionId) {
    const p = params as {
      minionIds?: string[]
      leaveChancePercent?: number
      extraMaxStacks?: number
    }
    if (p.minionIds !== undefined && !p.minionIds.includes(minionId)) {
      return { leaveChancePercent: 0, extraMaxStacks: 0 }
    }
    return {
      leaveChancePercent: (p.leaveChancePercent ?? 0) * scale,
      extraMaxStacks: p.extraMaxStacks ?? 0
    }
  }
}

// ---------- Registry ----------

export const PASSIVE_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  highestStatBoost,
  damageDealtModifier,
  damageTakenWhen,
  scaling,
  statWhen,
  guaranteedCritical,
  cannotCrit,
  cannotDodge,
  undodgeable,
  critChance,
  dodge,
  negateDamage,
  damageCap,
  hpFloor,
  extraHits,
  repeatSkill,
  damageVariance,
  healingModifier,
  attackStat,
  bonusDamage,
  effectiveness,
  debuffImmunity,
  debuffResist,
  turnOrderStat,
  startPosition,
  intercept,
  damageShare,
  randomTarget,
  seeInvisible,
  blockManual,
  interrupt,
  stageMultiplier,
  statGainBlock,
  indirectDamage,
  statusConversion,
  statusDuration,
  statusDurationBonus,
  inflictPotency,
  statusDamageModifier,
  statusHeals,
  statusGainBlock,
  minionModifier
}
