// Công thức sát thương, dựa trên tỉ lệ công / thủ:
//   dmg = K × power/100 × công × (công / thủ)
//         × khắc chế hệ × STAB × (chí mạng hoặc màn chắn) × dao động × spread × hệ số trait
//         × hệ số trạng thái × hệ số môi trường (thời tiết, địa hình, fieldModifiers của skill)
//         × phòng thủ / khiêu khích của bên nhận × % sát thương của đòn do trait (đánh 30%...)
//         + sát thương cộng thêm của trait (theo chỉ số, theo máu)
// Màn chắn (hiệu ứng theo phe kiểu Reflect) chỉ áp khi không chí mạng, như Pokémon.
// Trait còn đổi: thủ bị bỏ qua một phần (tối thiểu 1), STAB riêng, tỉ lệ / hệ số chí mạng, chỉ số
// dùng làm công (trait Siralim kiểu Song of Alacrity), khắc hệ luôn khắc / đảo ngược, dao động
// riêng; tăng sát thương sau khi hút skill (kiểu Flash Fire, hệ số trait). Hào quang (đồng đội,
// địch) đi qua forEachTraitHook với bối cảnh trận của từng bên.
// Sát thương tỉ lệ với chính chỉ số công, nên hai quái cùng sức luôn cần số đòn như nhau
// ở mọi level, và quái mạnh hơn nhiều lần (farm vùng cũ) hạ địch rất nhanh.

import {
  BIG_ZERO,
  assertNever,
  maxBig,
  minBig,
  nextFloat,
  pickWeighted,
  rollPercent,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import {
  computeStats,
  getCurrentHp,
  getMaxHp,
  skillMasteryBonus,
  type ComputeStatsOptions
} from '../monster'
import { expectedHitCount } from './multiHit'
import { fixedDamageAmount } from './fixedDamage'
import { invulnerableHitMultiplier } from './multiTurnMoves'
import { synergyPowerMultiplier } from './skillSynergy'
import { stylePowerMultiplier } from './moveStyles'
import { stabMultiplierOf, stellarBlastEffectiveness } from './transform'
import {
  absorbBoostMultiplier,
  attackerView,
  counterValue,
  recordTotal,
  defenderView,
  fieldDamageMultiplier,
  forEachStatusHook,
  forEachTraitHook,
  hasAbilityFlag,
  hasTraitFlag,
  isCriticalBlocked,
  isAirborneImmunityRemoved,
  isWeaknessNeutralized,
  sideDamageTakenMultiplier,
  skillInField,
  formulaPower,
  skillPowerInField,
  spellAttackBlend,
  spellDefenseIgnored,
  spellPowerMultiplier,
  traitCritChance,
  traitCritStages,
  traitCritMultiplier,
  traitDefenseIgnoredPercent,
  type AmountSpec,
  type AmountStat,
  type DamageContext,
  type DslView,
  type EffectivenessMode,
  type HookSource,
  type PowerFormula,
  type TraitHookHandler,
  type StatBlend,
  type StrikeView,
  sizeDamageMultiplier,
  polarityDamageMultiplier
} from '../registries'
import {
  NON_HP_STATS,
  type BattleField,
  type BattleStages,
  type BigStats,
  type DamageArena,
  type FixedDamage,
  type GameData,
  type Monster,
  type MonsterBattleContext,
  type MoveStyle,
  type Skill
} from '../model'

/** Hệ số khắc chế: nhân dồn qua mọi hệ của bên phòng thủ. */
export function elementEffectiveness(
  data: GameData,
  attackElementId: string,
  defenderElementIds: readonly string[]
): number {
  const table = data.elements[attackElementId].effectiveness
  return defenderElementIds.reduce((product, id) => product * (table[id] ?? 1), 1)
}

/** Room gỡ miễn nhiễm của quái đang bay với hệ của skill (Gravity: hệ Đất); ngoài trận thì không. */
const airborneImmunityRemoved = (input: DamageFormulaInput): boolean =>
  (input.arena !== undefined &&
    isAirborneImmunityRemoved(input.data, input.arena.field, input.skill.elementId)) ||
  hasTraitFlag(
    input.data,
    input.defender,
    (handler, params) => handler.removesAirborneImmunity?.(params, input.skill.elementId),
    input.arena?.defenderContext
  )

const strikeOf = (input: DamageFormulaInput): StrikeView => ({
  data: input.data,
  attacker: input.attacker,
  defender: input.defender,
  attackerCtx: input.arena?.attackerContext,
  defenderCtx: input.arena?.defenderContext,
  skill: input.skill,
  reactive: input.arena?.reactive
})

/** Chế độ khắc hệ do trait của bên đánh / bên nhận (Siralim: luôn khắc, đảo ngược...). */
function effectivenessModes(input: DamageFormulaInput): Set<EffectivenessMode> {
  const modes = new Set<EffectivenessMode>()
  const collect = (
    monster: Monster,
    ctx: DamageArena['attackerContext'],
    side: 'dealt' | 'taken'
  ): void => {
    forEachTraitHook(
      input.data,
      monster,
      (handler, params) => {
        const mode = handler.effectivenessMode?.(params)
        if (!mode) return
        // alwaysStrong: bên đánh luôn khắc; neverWeak: bên nhận luôn nhận như bị kháng; reverse: cả hai.
        if (mode === 'reverse' || (mode === 'alwaysStrong' && side === 'dealt')) modes.add(mode)
        if (mode === 'neverWeak' && side === 'taken') modes.add(mode)
      },
      ctx
    )
  }
  collect(input.attacker, input.arena?.attackerContext, 'dealt')
  collect(input.defender, input.arena?.defenderContext, 'taken')
  return modes
}

/** Áp chế độ khắc hệ lên hệ số khắc chế (miễn nhiễm 0 giữ nguyên). */
function applyModes(effectiveness: number, modes: ReadonlySet<EffectivenessMode>): number {
  if (effectiveness === 0 || modes.size === 0) return effectiveness
  let result = effectiveness
  if (modes.has('reverse')) result = 1 / result
  if (modes.has('alwaysStrong')) result = Math.max(result, 2)
  if (modes.has('neverWeak')) result = Math.min(result, 0.5)
  return result
}

/**
 * Hệ số khắc chế dùng khi đánh: 0 nếu bên nhận miễn nhiễm hệ của skill, theo bảng hệ hoặc theo
 * trait (elementDamageTaken −100%, kiểu Levitate). Miễn nhiễm thì sát thương 0 (mục Sát thương).
 * Room gỡ miễn nhiễm (Gravity): bỏ qua trait miễn nhiễm, hệ số 0 lên hệ đang bay thành 1. Sau đó
 * chế độ khắc hệ của trait (luôn khắc, đảo ngược).
 */
function effectivenessAgainst(input: DamageFormulaInput): number {
  const { data, defender, skill } = input
  // Đòn không hệ (Struggle, Bide): trúng mọi hệ, kể cả hệ miễn nhiễm (như Pokémon).
  if (skill.typeless) return 1
  // Tera Blast của quái Tera Stellar: khắc chế cố định, không theo bảng hệ (mục "Tera").
  const stellar = stellarBlastEffectiveness(data, input)
  if (stellar !== null) return stellar
  if (airborneImmunityRemoved(input)) {
    const base = skillEffectiveness(
      data,
      skill,
      defender.elementIds,
      (factor, id) => (factor === 0 && data.elements[id].airborne ? 1 : factor),
      input.arena?.field
    )
    return applyModes(base, effectivenessModes(input))
  }
  // Foresight / Miracle Eye (trên mục tiêu), Scrappy (trên quái đánh): hệ skill trong danh sách
  // đánh trúng hệ miễn nhiễm của mục tiêu.
  if (
    hasTraitFlag(
      data,
      defender,
      (handler, params) => handler.immunityRemovedFor?.(params, skill.elementId),
      input.arena?.defenderContext
    ) ||
    hasTraitFlag(
      data,
      input.attacker,
      (handler, params) => handler.hitsImmuneWith?.(params, skill.elementId),
      input.arena?.attackerContext
    )
  ) {
    const base = skillEffectiveness(
      data,
      skill,
      defender.elementIds,
      (factor) => (factor === 0 ? 1 : factor),
      input.arena?.field
    )
    return applyModes(base, effectivenessModes(input))
  }
  const immuneByTrait = hasTraitFlag(
    data,
    defender,
    (handler, params) => handler.immuneToElement?.(params, skill.elementId),
    input.arena?.defenderContext
  )
  if (immuneByTrait) return 0
  return applyModes(
    skillEffectiveness(data, skill, defender.elementIds, undefined, input.arena?.field),
    effectivenessModes(input)
  )
}

/**
 * Hệ số khắc chế của skill: bảng hệ của hệ skill nhân bảng của các hệ thêm (Flying Press), hệ số ghi
 * đè theo hệ bên nhận (Freeze-Dry khắc hệ Nước, Thousand Arrows trúng hệ Bay); `adjust` sửa từng hệ
 * số (Gravity gỡ miễn nhiễm của hệ bay).
 */
function skillEffectiveness(
  data: GameData,
  skill: Skill,
  defenderElementIds: readonly string[],
  adjust: (factor: number, defenderElementId: string) => number = (factor) => factor,
  field?: BattleField
): number {
  const override = skill.effectiveness?.against ?? {}
  const attackElements = [skill.elementId, ...(skill.effectiveness?.extraElementIds ?? [])]
  return defenderElementIds.reduce((product, id) => {
    if (override[id] !== undefined) return product * override[id]
    const factor = attackElements.reduce(
      (inner, attackId) => inner * (data.elements[attackId].effectiveness[id] ?? 1),
      1
    )
    // Delta Stream: hệ của bên nhận hết bị khắc (khắc > 1 thành 1), trước các chỉnh khác.
    const neutral = field !== undefined && factor > 1 && isWeaknessNeutralized(data, field, id)
    return product * adjust(neutral ? 1 : factor, id)
  }, 1)
}

/** Tích hệ số sát thương của hook môi trường. 1 khi ngoài trận. */
function environmentMultiplier(input: DamageFormulaInput): number {
  const { data, arena, attacker, defender, skill } = input
  if (!arena) return 1
  return fieldDamageMultiplier(data, arena.damageField ?? arena.field, {
    attacker,
    defender,
    skill
  })
}

/** Hệ số màn chắn của phe bên nhận (không chí mạng). 1 khi ngoài trận. */
function screenMultiplier({ data, arena, skill, attacker }: DamageFormulaInput): number {
  if (!arena) return 1
  // Infiltrator: bỏ qua màn chắn của phe mục tiêu.
  if (hasAbilityFlag(data, attacker, 'ignoresScreens', arena.attackerContext)) return 1
  return sideDamageTakenMultiplier(data, arena.field, {
    side: arena.defenderSide,
    skill,
    defenderSideCount: arena.defenderSideCount
  })
}

/**
 * Tỉ lệ chí mạng (%) của đòn: hiệu ứng theo phe của bên nhận chặn chí mạng (kiểu Lucky Chant)
 * hoặc trait miễn chí mạng thì 0; skill luôn chí mạng thì 100; không thì tỉ lệ theo bậc chí mạng
 * (skill + Focus Energy + trait critStage, như Pokémon), rồi trait % / luôn chí mạng của bên đánh.
 */
function critChanceOf(input: DamageFormulaInput): number {
  const { data, arena, skill } = input
  if (arena && isCriticalBlocked(data, arena.field, arena.defenderSide)) return 0
  const strike = strikeOf(input)
  if (skill.alwaysCrit) return traitCritChance(strike, 100)
  const stage = (skill.critStage ?? 0) + (arena?.attackerFocusStages ?? 0) + traitCritStages(strike)
  return traitCritChance(strike, critStageChance(data, stage))
}

/** % chí mạng ở bậc `stage`: bậc 0 = critChance, bậc ≥ 1 theo critStageChances (vượt thì mục cuối). */
export function critStageChance(data: GameData, stage: number): number {
  const { critChance, critStageChances } = data.config.battle
  if (stage <= 0 || critStageChances.length === 0) return critChance
  return critStageChances[Math.min(stage, critStageChances.length) - 1]
}

/** Hệ số chí mạng thật (theo trait của bên đánh) hoặc màn chắn: chí mạng bỏ qua màn chắn. */
const critOrScreen = (input: DamageFormulaInput, critical: boolean, screen: number): number =>
  critical ? traitCritMultiplier(strikeOf(input), input.data.config.battle.critMultiplier) : screen

const percentFactor = (percent: number): number => Math.max(0, 1 + percent / 100)

/**
 * Tích hệ số sát thương từ hook của bên đánh (dealt) và bên nhận (taken), kể cả trạng thái, minion
 * và hào quang (theo bối cảnh trận). `ignoreImmunity`: bỏ qua trait bên nhận miễn nhiễm hệ của
 * skill (room gỡ miễn nhiễm, Gravity).
 */
function traitDamageMultiplier(
  ctx: DamageContext,
  views: { attacker: DslView; defender: DslView },
  { ignoreImmunity, heldUsed }: { ignoreImmunity: boolean; heldUsed?: HeldItemUse[] }
): number {
  let multiplier = 1
  // Đồ cầm có hook kích hoạt theo đòn (heldUse 'damage') mà hệ số khác 1 thì đã tác dụng (ghi lại để
  // đòn thật tiêu hao); hook không có heldUse tác dụng liên tục, không làm mất đồ.
  const apply = (
    factor: number,
    {
      handler,
      source,
      sourceId
    }: { handler: TraitHookHandler; source: HookSource; sourceId: string }
  ): void => {
    multiplier *= factor
    if (factor !== 1 && source.kind === 'held' && handler.heldUse === 'damage') {
      heldUsed?.push({ monsterId: source.ownerId, itemId: sourceId })
    }
  }
  forEachTraitHook(
    ctx.data,
    ctx.attacker,
    (handler, params, scale, sourceId, source) => {
      if (handler.modifyDamageDealt) {
        apply(handler.modifyDamageDealt(params, scale, ctx), { handler, source, sourceId })
      }
      if (handler.damageDealtPercent) {
        const percent = handler.damageDealtPercent(params, scale, views.attacker)
        apply(percentFactor(percent), { handler, source, sourceId })
      }
    },
    ctx.attackerContext
  )
  forEachTraitHook(
    ctx.data,
    ctx.defender,
    (handler, params, scale, sourceId, source) => {
      if (ignoreImmunity && handler.immuneToElement?.(params, ctx.skill.elementId)) return
      if (handler.modifyDamageTaken) {
        apply(handler.modifyDamageTaken(params, scale, ctx), { handler, source, sourceId })
      }
      if (handler.damageTakenPercent) {
        const percent = handler.damageTakenPercent(params, scale, views.defender)
        apply(percentFactor(percent), { handler, source, sourceId })
      }
    },
    ctx.defenderContext
  )
  return multiplier
}

/**
 * Tích hệ số sát thương từ trạng thái của bên đánh (ví dụ bỏng: sát thương vật lý × 0,5). Trait
 * kiểu Guts bỏ qua các hệ số < 1.
 */
function statusDamageMultiplier(input: DamageFormulaInput): number {
  const { data, attacker, skill } = input
  if (attacker.statuses.length === 0) return 1
  const ignoresPenalty =
    skill.ignoresStatusPenalty === true ||
    hasTraitFlag(
      data,
      attacker,
      (handler, params) => handler.ignoresStatusDamagePenalty?.(params),
      input.arena?.attackerContext
    )
  let multiplier = 1
  forEachStatusHook(data, attacker, (handler, params) => {
    if (!handler.damageDealtMultiplier) return
    const factor = handler.damageDealtMultiplier(params, skill.category)
    if (!ignoresPenalty || factor >= 1) multiplier *= factor
  })
  return multiplier
}

/** Phòng thủ / khiêu khích của bên nhận (lệnh defend / provoke đang có tác dụng). */
function guardMultiplier(input: DamageFormulaInput): number {
  const ctx = input.arena?.defenderContext
  const volatile = ctx?.volatiles[input.defender.id]
  const { defend, provoke } = input.data.config.battle
  let multiplier = 1
  if (volatile?.defending) multiplier *= percentFactor(defend.damageTakenPercent)
  if (volatile?.provoking) multiplier *= percentFactor(provoke.damageTakenPercent)
  return multiplier
}

/**
 * Tỉ lệ máu hiện tại của quái trong [0, 1], lấy max HP từ chỉ số đã tính (HP không chịu bậc trận
 * hay môi trường nên bằng max HP thật, khỏi tính lại).
 */
function hpRatio(stats: BigStats, monster: Monster): number {
  return maxBig(0, stats.hp.minus(monster.damageTaken)).div(stats.hp).toNumber()
}

/** Đầu vào công thức sát thương, không gồm RNG (dùng chung cho đánh thật và AI dự đoán). */
export interface DamageFormulaInput {
  data: GameData
  attacker: Monster
  defender: Monster
  skill: Skill
  attackerStages?: BattleStages
  defenderStages?: BattleStages
  /** Skill đánh nhiều mục tiêu cùng lúc. */
  spread: boolean
  /** Bối cảnh trận: môi trường, phe hai bên (bỏ trống = ngoài trận, không có môi trường). */
  arena?: DamageArena
  /** % sát thương của đòn (đòn do trait "đánh 30% sát thương", đòn thêm); bỏ trống = 100. */
  damagePercent?: number
  /**
   * Nơi ghi đồ cầm có hệ số sát thương khác 1 trong đòn (đồ cầm kiểu Gem, berry kháng hệ); chỉ đòn
   * thật truyền vào (computeDamage), AI dự đoán không ghi.
   */
  heldUsed?: HeldItemUse[]
  /** Đồng đội cùng tung hợp kích kỹ (docs/rules/team.md); bỏ trống = skill thường. */
  partner?: DamagePartner
  /** Thế mạnh / thế nhanh của lần dùng (docs/rules/move-styles.md); bỏ trống = thế thường. */
  style?: MoveStyle
  /** Bộ nhớ chỉ số của một lần AI chấm điểm (StatsMemo); bỏ trống = luôn tính lại. */
  statsMemo?: StatsMemo
}

/**
 * Bộ nhớ chỉ số trong **một lần AI chấm điểm** trên một draft không đổi (mục "Bộ nhớ chỉ số" ở
 * stats-traits.md): cùng quái (cùng object), cùng bậc trận / môi trường / phe thì cùng chỉ số, vì bối
 * cảnh trận suy ra từ chính draft đó. Tạo mới cho mỗi lần chấm, không giữ qua thay đổi state, không
 * dùng cho đòn thật.
 */
export type StatsMemo = Map<Monster, { options: ComputeStatsOptions; stats: BigStats }[]>

/** Bộ nhớ chỉ số rỗng cho một lần AI chấm điểm. */
export const newStatsMemo = (): StatsMemo => new Map()

/** Chỉ số cuối của quái trong công thức: lấy từ bộ nhớ của lần chấm điểm nếu có. */
function memoStats(
  input: DamageFormulaInput,
  monster: Monster,
  options: ComputeStatsOptions
): BigStats {
  const memo = input.statsMemo
  if (!memo) return computeStats(input.data, monster, options).final
  const entries = memo.get(monster) ?? []
  const hit = entries.find(
    (entry) =>
      entry.options.stages === options.stages &&
      entry.options.field === options.field &&
      entry.options.side === options.side
  )
  if (hit) return hit.stats
  const stats = computeStats(input.data, monster, options).final
  entries.push({ options, stats })
  memo.set(monster, entries)
  return stats
}

/**
 * Đồng đội cùng tung hợp kích kỹ: công / đặc công dùng trung bình của hai quái, STAB nếu một trong
 * hai cùng hệ; mọi bước trait / trạng thái / môi trường khác theo quái đánh (quái chậm hơn).
 */
export interface DamagePartner {
  monster: Monster
  stages?: BattleStages
  context?: MonsterBattleContext
}

export interface DamageInput extends DamageFormulaInput {
  rng: RngState
}

/** Một đồ cầm đã tác dụng trong một đòn (đòn thật tiêu hao nó). */
export interface HeldItemUse {
  monsterId: string
  itemId: string
}

export interface DamageResult {
  /** Sát thương trước khi giới hạn bởi HP còn lại. Tối thiểu 1, trừ khi miễn nhiễm (0). */
  damage: Decimal
  effectiveness: number
  critical: boolean
  rng: RngState
  /** Đồ cầm đã tác dụng trong đòn (rỗng nếu không có). */
  heldUsed: HeldItemUse[]
}

/** Chỉ số cao nhất / thấp nhất (không gồm hp) của bộ chỉ số. */
export function extremeStat(stats: BigStats, which: 'highest' | 'lowest'): Decimal {
  const values: Decimal[] = NON_HP_STATS.map((stat) => stats[stat])
  return values.reduce((best, value) =>
    which === 'highest' ? (value.gt(best) ? value : best) : value.lt(best) ? value : best
  )
}

/** Giá trị chỉ số theo tên trong lượng của trait (chỉ số thường, cao nhất, thấp nhất). */
export function amountStatValue(stats: BigStats, stat: AmountStat): Decimal {
  if (stat === 'highest' || stat === 'lowest') return extremeStat(stats, stat)
  return stats[stat]
}

/** Chỉ số công gốc của đòn: hợp kích kỹ thì trung bình với chỉ số cùng loại của đồng đội. */
function comboAttack(input: DamageFormulaInput, own: Decimal): Decimal {
  const { partner } = input
  if (!partner) return own
  const stats = memoStats(input, partner.monster, {
    stages: partner.stages,
    field: input.arena?.field,
    side: input.arena?.attackerSide,
    battle: partner.context
  })
  return own.plus(stats[input.skill.category === 'physical' ? 'attack' : 'spAttack']).div(2)
}

/** Chỉ số công thật: trộn chỉ số gốc với chỉ số thay thế theo % (spell, trait attackStat). */
function blendedAttack(input: DamageFormulaInput, stats: BigStats, base: Decimal): Decimal {
  const spellBlend = spellAttackBlend(input.skill)
  const blends: StatBlend[] = spellBlend ? [spellBlend] : []
  forEachTraitHook(
    input.data,
    input.attacker,
    (handler, params) => {
      const blend = handler.attackStatBlend?.(params, input.skill.category)
      if (blend) blends.push(blend)
    },
    input.arena?.attackerContext
  )
  if (blends.length === 0) return base
  let attack = base
  for (const { stat, weight } of blends) {
    const replacement =
      stat === 'currentHp' ? getCurrentHp(input.data, input.attacker) : amountStatValue(stats, stat)
    attack = attack.times(1 - weight / 100).plus(replacement.times(weight / 100))
  }
  return maxBig(1, attack)
}

/**
 * Sát thương theo chỉ số (quy đổi của trait Siralim, mục "Trait Siralim"): công = chỉ số cho trước,
 * thủ = thủ (physical) của mục tiêu, sức mạnh = `power`; không STAB, chí mạng hay khắc hệ.
 */
export function statDamage(
  data: GameData,
  { attackStat, defense, power }: { attackStat: Decimal; defense: Decimal; power: number }
): Decimal {
  return attackStat
    .times(attackStat)
    .times(data.config.battle.damageFactor)
    .times(power)
    .div(maxBig(1, defense).times(100))
}

/** Sát thương cộng thêm của trait (bonusDamage) lên đòn, theo lượng của "ngôn ngữ" trait. */
function bonusDamage(
  input: DamageFormulaInput,
  stats: { attacker: BigStats; defender: BigStats },
  view: DslView
): Decimal {
  let total = BIG_ZERO
  forEachTraitHook(
    input.data,
    input.attacker,
    (handler, params, scale) => {
      const amount = handler.bonusDamage?.(params, scale, view)
      if (!amount) return
      const per = amount.per ? Math.max(0, counterValue(view, amount.per)) : 1
      total = total.plus(amountAsDamage(input, stats, amount).times(per))
    },
    input.arena?.attackerContext
  )
  return total
}

/** Đổi một lượng (traitDsl) thành sát thương lên bên nhận của đòn. */
function amountAsDamage(
  input: DamageFormulaInput,
  stats: { attacker: BigStats; defender: BigStats },
  amount: AmountSpec
): Decimal {
  if ('flat' in amount) return toBig(amount.flat)
  if ('event' in amount) return BIG_ZERO
  const monster = amount.of === 'target' || amount.of === 'other' ? input.defender : input.attacker
  if ('record' in amount) {
    const ctx =
      monster === input.defender ? input.arena?.defenderContext : input.arena?.attackerContext
    return recordTotal(ctx, amount.record, amount.side === true)
      .times(amount.percent)
      .div(100)
  }
  const monsterStats = monster === input.defender ? stats.defender : stats.attacker
  if ('stat' in amount) {
    return statDamage(input.data, {
      attackStat: amountStatValue(monsterStats, amount.stat),
      defense: stats.defender.defense,
      power: amount.percent
    })
  }
  const maxHp = getMaxHp(input.data, monster)
  const current = getCurrentHp(input.data, monster)
  const base =
    amount.hp === 'max' ? maxHp : amount.hp === 'current' ? current : maxHp.minus(current)
  return base.times(amount.percent).div(100)
}

/**
 * Đòn tính như vật lý không: theo loại skill, hoặc theo `categoryRule` (Photon Geyser: công >
 * đặc công thì vật lý; Shell Side Arm: chọn loại gây nhiều sát thương hơn theo công / thủ mục tiêu).
 */
function isPhysicalStrike(skill: Skill, attacker: BigStats, defender: BigStats): boolean {
  switch (skill.categoryRule) {
    case undefined:
      return skill.category === 'physical'
    case 'higherAttack':
      return attacker.attack.gt(attacker.spAttack)
    case 'betterRatio':
      return attacker.attack
        .div(maxBig(1, defender.defense))
        .gt(attacker.spAttack.div(maxBig(1, defender.spDefense)))
    default:
      return assertNever(skill.categoryRule, 'luật loại đòn')
  }
}

/**
 * Hệ số power theo thuần thục skill của bên đánh (docs/rules/skill-mastery.md); hợp kích kỹ không
 * áp (skill chung của hai quái), chiêu Max không áp (skillMasteryBonus).
 */
const masteryPowerMultiplier = (input: DamageFormulaInput): number =>
  input.partner ? 1 : skillMasteryBonus(input.data, input.attacker, input.skill).powerMultiplier

/**
 * Sát thương một đòn trước khi làm tròn, với hệ số chí mạng (hoặc màn chắn, xem critOrScreen) và
 * dao động cho trước. Điểm duy nhất của công thức: đánh thật (computeDamage) và AI
 * (expectedDamage) đều gọi hàm này.
 */
function rawDamage(
  input: DamageFormulaInput,
  effectiveness: number,
  { critFactor, random }: { critFactor: number; random: number }
): Decimal {
  const { data, attacker, defender, skill, arena } = input
  const { battle } = data.config
  const field = arena?.field
  // Unaware: bỏ qua bậc trận của đối thủ (bên đánh bỏ qua thủ của mục tiêu và ngược lại).
  const attackerUnaware = hasAbilityFlag(
    data,
    attacker,
    'ignoresOpponentStages',
    arena?.attackerContext
  )
  const defenderUnaware = hasAbilityFlag(
    data,
    defender,
    'ignoresOpponentStages',
    arena?.defenderContext
  )
  const attackerStats = memoStats(input, attacker, {
    stages: defenderUnaware ? undefined : input.attackerStages,
    field,
    side: arena?.attackerSide,
    battle: arena?.attackerContext
  })
  // Sacred Sword / Chip Away: bỏ qua bậc trận của mục tiêu (như Pokémon).
  const defenderStats = memoStats(input, defender, {
    stages: skill.ignoresTargetStages || attackerUnaware ? undefined : input.defenderStages,
    field,
    side: arena?.defenderSide,
    battle: arena?.defenderContext
  })
  const physical = isPhysicalStrike(skill, attackerStats, defenderStats)
  const attackStat = physical ? 'attack' : 'spAttack'
  const baseAttack = skill.attackFrom
    ? (skill.attackFrom.who === 'target' ? defenderStats : attackerStats)[skill.attackFrom.stat]
    : attackerStats[attackStat]
  const attack = blendedAttack(input, attackerStats, comboAttack(input, baseAttack))
  const strike = strikeOf(input)
  const ignored = Math.min(100, traitDefenseIgnoredPercent(strike) + spellDefenseIgnored(skill))
  const defenseStat = skill.defenseStat ?? (physical ? 'defense' : 'spDefense')
  const defense = maxBig(1, defenderStats[defenseStat].times(1 - ignored / 100))
  // STAB theo hệ của quái, Tera (hệ gốc + hệ Tera, Stellar) và trait kiểu Adaptability; hợp kích kỹ
  // lấy STAB lớn hơn của hai quái.
  const stab = Math.max(
    stabMultiplierOf(data, { attacker, skill, ctx: arena?.attackerContext }),
    input.partner
      ? stabMultiplierOf(data, {
          attacker: input.partner.monster,
          skill,
          ctx: input.partner.context
        })
      : 0
  )
  // Sức mạnh theo fieldModifiers của skill (thay thế / nhân); ngoài trận là power gốc. Skill có
  // powerFormula (Eruption, Gyro Ball...) tính power theo công thức thay cho số đó.
  const power = skill.powerFormula
    ? formulaPower(skill.powerFormula as PowerFormula, {
        view: attackerView(strike),
        readStat: (monster, stat) => (monster === attacker ? attackerStats : defenderStats)[stat],
        hpRatio: (monster) =>
          monster === attacker ? hpRatio(attackerStats, attacker) : hpRatio(defenderStats, defender)
      })
    : field
      ? skillPowerInField(data, field, skill, attacker)
      : skill.power
  const ctx: DamageContext = {
    data,
    attacker,
    defender,
    attackerContext: arena?.attackerContext,
    defenderContext: arena?.defenderContext,
    reactive: arena?.reactive,
    skill,
    effectiveness,
    power,
    attackerHpRatio: hpRatio(attackerStats, attacker),
    defenderHpRatio: hpRatio(defenderStats, defender)
  }
  const views = { attacker: attackerView(strike), defender: defenderView(strike) }
  // Nhân hết các hệ số rồi chia một lần cho (100 × thủ) để làm tròn xuống không bị lệch.
  const formula = attack
    .times(attack)
    .times(battle.damageFactor)
    .times(power)
    .times(effectiveness)
    .times(stab)
    .times(critFactor)
    .times(random)
    .times(input.spread ? battle.spreadMultiplier : 1)
    .times(invulnerableHitMultiplier(skill, defender, arena?.defenderContext?.volatiles))
    .times(
      traitDamageMultiplier(ctx, views, {
        ignoreImmunity: airborneImmunityRemoved(input),
        heldUsed: input.heldUsed
      })
    )
    // Collision Course / Electro Drift xét khắc hệ (điều kiện superEffective).
    .times(spellPowerMultiplier(skill, { ...views.attacker, effectiveness }))
    .times(
      absorbBoostMultiplier(
        data,
        attacker,
        {
          boostedTraitIds: arena?.attackerContext?.absorbBoosts ?? [],
          elementId: skill.elementId
        },
        arena?.attackerContext
      )
    )
    .times(statusDamageMultiplier(input))
    .times(environmentMultiplier(input))
    .times(guardMultiplier(input))
    .times(masteryPowerMultiplier(input))
    // Synergy theo đồng đội trên sân (ngoài trận không có bối cảnh trận nên không áp).
    .times(synergyPowerMultiplier(skill, arena?.attackerContext?.allies ?? []))
    .times(stylePowerMultiplier(data, skill, input.style))
    // Quái lớn chỉ hành động 1 lần mỗi lượt (docs/rules/monster-size.md).
    .times(sizeDamageMultiplier(data, attacker))
    // Âm dương tương khắc (docs/rules/polarity.md).
    .times(polarityDamageMultiplier(data, attacker, defender))
    .div(defense.times(100))
  const extra = bonusDamage(
    input,
    { attacker: attackerStats, defender: defenderStats },
    views.attacker
  )
  return formula.plus(extra).times((input.damagePercent ?? 100) / 100)
}

/**
 * Đầu vào với skill đã đổi hệ theo môi trường (kiểu Weather Ball): STAB, khắc chế, miễn nhiễm,
 * hook theo hệ của trait / môi trường đều theo hệ mới. Ngoài trận giữ nguyên.
 */
const withSkillInField = <T extends DamageFormulaInput>(input: T): T =>
  withIgnoredAbility(
    withConvertedElement(
      withUserElement(
        withHeldItemElement(
          input.arena
            ? {
                ...input,
                skill: skillInField(input.data, input.arena.field, input.skill, input.attacker)
              }
            : input
        )
      )
    )
  )

/**
 * Thứ tự hệ của Hidden Power (Pokémon thế hệ 3–7): chỉ số = ⌊(a + 2b + 4c + 8d + 16e + 32f) × 15 / 63⌋
 * với a..f là tính lẻ của gen HP, công, thủ, tốc, đặc công, đặc thủ.
 */
const HIDDEN_POWER_ELEMENTS = [
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark'
] as const
const HIDDEN_POWER_STATS = ['hp', 'attack', 'defense', 'speed', 'spAttack', 'spDefense'] as const

/** Hệ Hidden Power theo gen của quái (hệ không có trong dữ liệu thì giữ hệ của skill). */
export function hiddenPowerElement(data: GameData, monster: Monster, fallback: string): string {
  const bits = HIDDEN_POWER_STATS.reduce(
    (sum, stat, i) => sum + (monster.genes[stat].floor().mod(2).eq(1) ? 2 ** i : 0),
    0
  )
  const elementId = HIDDEN_POWER_ELEMENTS[Math.floor((bits * 15) / 63)]
  return Object.hasOwn(data.elements, elementId) ? elementId : fallback
}

/** Pixilate / Aerilate / Galvanize...: skill hệ Thường của quái mang đổi hệ, power + %. */
function withConvertedElement<T extends DamageFormulaInput>(input: T): T {
  let converted: { elementId: string; percent: number } | null = null
  forEachTraitHook(
    input.data,
    input.attacker,
    (handler, params) => {
      converted ??= handler.convertsSkillElement?.(params, input.skill) ?? null
    },
    input.arena?.attackerContext
  )
  if (!converted) return input
  const { elementId, percent } = converted
  const power = (input.skill.power * (100 + percent)) / 100
  return { ...input, skill: { ...input.skill, elementId, power } }
}

/** Revelation Dance, Ivy Cudgel, Hidden Power...: hệ của skill theo quái dùng. */
function withUserElement<T extends DamageFormulaInput>(input: T): T {
  if (input.skill.elementFromGenes) {
    const elementId = hiddenPowerElement(input.data, input.attacker, input.skill.elementId)
    return { ...input, skill: { ...input.skill, elementId } }
  }
  const pick = input.skill.elementFromUser
  if (!pick) return input
  const ids = input.attacker.elementIds
  const elementId = pick === 'first' ? ids[0] : ids[ids.length - 1]
  return elementId ? { ...input, skill: { ...input.skill, elementId } } : input
}

/** Power trung bình theo trọng số của skill power ngẫu nhiên (AI, sát thương kỳ vọng). */
function withAveragePower<T extends DamageFormulaInput>(input: T): T {
  const options = input.skill.randomPower
  if (!options) return input
  const total = options.reduce((sum, option) => sum + option.weight, 0)
  const power = options.reduce((sum, option) => sum + option.power * option.weight, 0) / total
  return { ...input, skill: { ...input.skill, power } }
}

/** Tung power của skill power ngẫu nhiên (Present, Magnitude, Fickle Beam). */
function withRolledPower(input: DamageInput): DamageInput {
  const options = input.skill.randomPower
  if (!options) return input
  const [option, rng] = pickWeighted(input.rng, options, (entry) => entry.weight)
  return { ...input, rng, skill: { ...input.skill, power: option.power } }
}

/** Natural Gift: hệ của skill theo berry đang cầm đầu tiên có `naturalGift`. */
function withHeldItemElement<T extends DamageFormulaInput>(input: T): T {
  if (!input.skill.elementFromHeldItem) return input
  for (const entry of input.attacker.equipment) {
    if (entry.storage !== 'stack') continue
    const item = input.data.items[entry.itemId]
    if (item?.category !== 'held') continue
    if (item.skillElement?.skillIds.includes(input.skill.id)) {
      return { ...input, skill: { ...input.skill, elementId: item.skillElement.elementId } }
    }
    if (item.naturalGift) {
      return { ...input, skill: { ...input.skill, elementId: item.naturalGift.elementId } }
    }
  }
  return input
}

/** Đòn bỏ qua ability của mục tiêu: skill có ignoresAbility hoặc quái đánh có Mold Breaker. */
export function ignoresTargetAbility(
  data: GameData,
  { attacker, skill, ctx }: { attacker: Monster; skill: Skill; ctx?: MonsterBattleContext }
): boolean {
  return (
    skill.ignoresAbility === true || hasAbilityFlag(data, attacker, 'ignoresTargetAbility', ctx)
  )
}

/**
 * Skill bỏ qua ability của mục tiêu (Moongeist Beam, Sunsteel Strike, như Mold Breaker): bối cảnh trận
 * của bên nhận coi như ability bị vô hiệu trong đòn này.
 */
function withIgnoredAbility<T extends DamageFormulaInput>(input: T): T {
  const ctx = input.arena?.defenderContext
  if (!input.arena || !ctx) return input
  const { data, attacker, skill } = input
  if (!ignoresTargetAbility(data, { attacker, skill, ctx: input.arena.attackerContext })) {
    return input
  }
  return {
    ...input,
    arena: { ...input.arena, defenderContext: { ...ctx, abilitySuppressed: true } }
  }
}

/** Khoảng dao động sát thương: theo trait của bên đánh (kiểu Cold Blood) hoặc config. */
function varianceRange(input: DamageFormulaInput): { min: number; max: number } {
  const { battle } = input.data.config
  let range = { min: battle.randomMin, max: battle.randomMax }
  forEachTraitHook(
    input.data,
    input.attacker,
    (handler, params) => {
      const variance = handler.damageVariance?.(params)
      if (variance) range = { min: variance.min / 100, max: variance.max / 100 }
    },
    input.arena?.attackerContext
  )
  return range
}

export function computeDamage(rawInput: DamageInput): DamageResult {
  const input = withRolledPower(withSkillInField(rawInput))
  const { skill } = input

  const effectiveness = effectivenessAgainst(input)
  if (skill.power <= 0 || effectiveness === 0 || isSpellNullified(input)) {
    return { damage: BIG_ZERO, effectiveness, critical: false, rng: input.rng, heldUsed: [] }
  }
  // Sát thương cố định (Night Shade, Super Fang...): không công thức, không chí mạng / khắc hệ.
  const fixed = fixedDamageAmount(
    { ...input, attackerContext: input.arena?.attackerContext },
    input.rng
  )
  if (fixed) {
    return {
      damage: fixed.amount,
      effectiveness,
      critical: false,
      rng: fixed.rng ?? input.rng,
      heldUsed: []
    }
  }

  // Tỉ lệ 0 (bị chặn) và 100 (luôn chí mạng) không tốn RNG (rollPercent).
  const [critical, afterCrit] = rollPercent(input.rng, critChanceOf(input))
  const [roll, rng] = nextFloat(afterCrit)
  const { min, max } = varianceRange(input)
  const random = min + roll * (max - min)
  const heldUsed: HeldItemUse[] = []
  const raw = rawDamage({ ...input, heldUsed }, effectiveness, {
    critFactor: critOrScreen(input, critical, screenMultiplier(input)),
    random
  })
  return { damage: maxBig(1, raw.floor()), effectiveness, critical, rng, heldUsed }
}

/**
 * Phần spell của skill cho hệ số 0 (kiểu "dùng N lần" với N = 0, mục "Spell Siralim"): không gây
 * sát thương, không kẹp tối thiểu 1 như hệ số trait.
 */
const isSpellNullified = (input: DamageFormulaInput): boolean =>
  input.skill.spell !== undefined &&
  spellPowerMultiplier(input.skill, attackerView(strikeOf(input))) === 0

/**
 * AI: sát thương kỳ vọng của đòn trả (Counter, Mirror Coat) lúc chọn lệnh, khi chưa trúng đòn
 * nào trong lượt: trung bình trên các skill gây sát thương của mục tiêu, skill đúng loại thì tính
 * `multiplier` × sát thương mục tiêu sẽ gây lên quái dùng, loại khác thì 0 (mục tiêu chọn đều).
 */
function expectedCounterDamage(
  input: DamageFormulaInput,
  spec: Extract<FixedDamage, { kind: 'counter' }>
): Decimal {
  const { data, attacker, defender } = input
  const damaging = defender.skillIds
    .map((id) => data.skills[id])
    .filter((skill) => skill.power > 0 && skill.fixedDamage === undefined)
  if (damaging.length === 0) return BIG_ZERO
  let total = BIG_ZERO
  for (const skill of damaging) {
    if (spec.categories && !spec.categories.includes(skill.category)) continue
    const hit = expectedDamage({
      ...input,
      attacker: defender,
      defender: attacker,
      skill,
      arena: undefined
    })
    total = total.plus(hit.times(spec.multiplier))
  }
  return total.div(damaging.length).floor()
}

/**
 * Sát thương kỳ vọng của một lần dùng skill lên một mục tiêu nếu trúng (mục "AI trận đấu"):
 * chí mạng kỳ vọng (gồm màn chắn khi không chí mạng) × dao động trung bình × số đòn kỳ vọng.
 * Không tính accuracy, không giới hạn bởi HP còn lại. 0 với skill status hoặc khi miễn nhiễm.
 */
export function expectedDamage(rawInput: DamageFormulaInput): Decimal {
  const input = withAveragePower(withSkillInField(rawInput))
  const { data, skill } = input
  const { battle } = data.config
  const effectiveness = effectivenessAgainst(input)
  if (skill.power <= 0 || effectiveness === 0 || isSpellNullified(input)) return BIG_ZERO
  const fixed = fixedDamageAmount({ ...input, attackerContext: input.arena?.attackerContext })
  if (fixed) {
    const amount =
      fixed.amount.lte(0) && skill.fixedDamage?.kind === 'counter'
        ? expectedCounterDamage(input, skill.fixedDamage)
        : fixed.amount
    return minBig(amount, getCurrentHp(data, input.defender))
  }
  const critRate = Math.min(1, critChanceOf(input) / 100)
  const screen = screenMultiplier(input)
  const { min, max } = varianceRange(input)
  const perHit = rawDamage(input, effectiveness, {
    critFactor:
      critRate * critOrScreen(input, true, screen) +
      (1 - critRate) * critOrScreen(input, false, screen),
    random: (min + max) / 2
  })
  // Mỗi đòn thật tối thiểu 1 sát thương.
  const { minHitsBonus } = skillMasteryBonus(data, input.attacker, skill)
  const hits = expectedHitCount(battle, skill, minHitsBonus)
  // Đòn thứ n power × n: trung bình (n + 1) / 2 lần power gốc mỗi đòn.
  const escalation = skill.escalatingHits ? (hits + 1) / 2 : 1
  return maxBig(1, perHit).times(hits).times(escalation)
}
