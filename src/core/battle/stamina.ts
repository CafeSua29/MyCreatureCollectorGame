// Thể lực cho skill (docs/rules/stamina.md, từ Temtem): mỗi skill bằng lệnh tốn thể lực; thiếu vẫn
// dùng được nhưng quá sức (mất máu theo phần thiếu, mất lượt kế tiếp); cuối lượt hồi một phần, lệnh
// Nghỉ hồi thêm. Chỉ có trong trận: lưu phần đã mất ở bản ghi trận, hết trận tự đầy.

import { getCurrentHp, getMaxHp, isFainted, percentOfMaxHp } from '../monster'
import { forEachTraitHook, staminaMaxOf, type OverexertionRule } from '../registries'
import { asObject, maxBig, minBig, type Decimal } from '../shared'
import type {
  EffectDef,
  GameData,
  Monster,
  Skill,
  StaminaConfig,
  StatusEffectCostConfig
} from '../model'
import { Draft, aliveOnField, log, monsterBattleContext, recordOf } from './draft'
import { emitTraitEvent } from './eventQueue'
import { loseHp } from './hpChanges'

/** Thể lực tối đa: thang cố định × hook `staminaMaxPercent` (không phình theo scale chỉ số). */
export const maxStamina = (data: GameData, d: Draft, monster: Monster): number =>
  staminaMaxOf(data, monster, monsterBattleContext(data, d, monster))

/** Thể lực hiện tại (đầy khi chưa dùng gì). */
export const currentStamina = (data: GameData, d: Draft, monster: Monster): number =>
  Math.max(0, maxStamina(data, d, monster) - (d.battle.records[monster.id]?.staminaUsed ?? 0))

/** Đổi thể lực (dương = hồi), kẹp trong [0, tối đa]. */
export function changeStamina(data: GameData, d: Draft, monster: Monster, amount: number): void {
  const record = recordOf(d, monster.id)
  const max = maxStamina(data, d, monster)
  const used = Math.min(max, Math.max(0, (record.staminaUsed ?? 0) - amount))
  if (used > 0) record.staminaUsed = used
  else delete record.staminaUsed
}

/** Cách tính lượng thể lực đổi (hiệu ứng trait `stamina`): đúng một trường có giá trị. */
export interface StaminaChangeSpec {
  amount?: number
  percent?: number
  atLeastPercent?: number
  eventHpPercent?: number
}

/**
 * Lượng thể lực cần đổi theo spec: số điểm, % tối đa, phần còn thiếu tới mức tối thiểu, hoặc % lượng
 * sự kiện `eventAmount` quy theo tỉ lệ max HP của quái (HP và thể lực khác thang).
 */
export function staminaChangeOf(
  data: GameData,
  d: Draft,
  monster: Monster,
  spec: StaminaChangeSpec,
  eventAmount?: Decimal
): number {
  const max = maxStamina(data, d, monster)
  if (spec.percent !== undefined) return Math.round((max * spec.percent) / 100)
  if (spec.atLeastPercent !== undefined) {
    const floor = Math.ceil((max * spec.atLeastPercent) / 100)
    return Math.max(0, floor - currentStamina(data, d, monster))
  }
  if (spec.eventHpPercent !== undefined) {
    if (!eventAmount) return 0
    // Tỉ lệ so với max HP kẹp ở 1: sát thương vô hạn (boss HP vô hạn) không ra thể lực vô hạn.
    const ratio = Math.min(1, eventAmount.div(getMaxHp(data, monster)).toNumber())
    return Math.round((max * spec.eventHpPercent * ratio) / 100)
  }
  return spec.amount ?? 0
}

/**
 * Hút thể lực: mỗi quái cho lần lượt mất tối đa `amount` (không quá phần nó còn, không quá phần quái
 * nhận còn thiếu), quái nhận được đúng phần đó (Drain Stamina / Drain Energy của Phereon).
 */
export function drainStamina(
  data: GameData,
  d: Draft,
  { donors, receiver, amount }: { donors: readonly Monster[]; receiver: Monster; amount: number }
): void {
  for (const donor of donors) {
    if (donor.id === receiver.id) continue
    const missing = maxStamina(data, d, receiver) - currentStamina(data, d, receiver)
    const taken = Math.min(amount, currentStamina(data, d, donor), missing)
    if (taken <= 0) continue
    changeStamina(data, d, donor, -taken)
    changeStamina(data, d, receiver, taken)
  }
}

/** Điểm giá của một hiệu ứng skill trạng thái (`effects` của skill: `type` + `params`). */
function skillEffectPoints(costs: StatusEffectCostConfig, effect: EffectDef): number {
  const params = asObject(effect.params)
  switch (effect.type) {
    case 'statStage':
      return costs.perStage * Math.abs(Number(params?.delta) || 0)
    case 'heal':
      return costs.perHealPercent * (Number(params?.percent) || 0)
    case 'applyStatus':
      return costs.perStatus
    case 'setField':
      return costs.perField
    default:
      return costs.perEffect
  }
}

/** Điểm giá của một hiệu ứng ngôn ngữ trait trong `spell` của skill (`do` + tham số). */
function spellEffectPoints(costs: StatusEffectCostConfig, value: unknown): number {
  const effect = asObject(value)
  switch (effect?.do) {
    case 'stage': {
      const statCount = Array.isArray(effect.stats) ? effect.stats.length : 1
      return costs.perStage * statCount * Math.abs(Number(effect.delta) || 0)
    }
    case 'heal': {
      const percent = Number(asObject(effect.amount)?.percent)
      return Number.isFinite(percent) ? costs.perHealPercent * percent : costs.perEffect
    }
    case 'status':
      return costs.perStatus * (Number(effect.count) || 1)
    case 'placeField':
    case 'clearFields':
      return costs.perField
    default:
      return costs.perEffect
  }
}

/**
 * Giá suy ra khi skill không ghi `staminaCost`: skill gây sát thương theo bảng power, skill trạng thái
 * `statusCost` + điểm theo từng hiệu ứng (stamina.md mục "Giá suy ra"); kẹp ở thể lực tối đa.
 */
export function inferredStaminaCost(config: StaminaConfig, skill: Skill): number {
  const { costByPower, statusCost, statusEffectCost, max } = config
  if (skill.power > 0) {
    const tier = costByPower.find((entry) => skill.power <= entry.upToPower) ?? costByPower.at(-1)
    return tier?.cost ?? 0
  }
  const spellEffects = [...(skill.spell?.onTarget ?? []), ...(skill.spell?.after ?? [])]
  const points =
    skill.effects.reduce((sum, effect) => sum + skillEffectPoints(statusEffectCost, effect), 0) +
    spellEffects.reduce(
      (sum: number, effect) => sum + spellEffectPoints(statusEffectCost, effect),
      0
    )
  return Math.min(max, Math.round(statusCost + points))
}

/**
 * Giá của skill với quái: `staminaCost` của skill, không có thì giá suy ra (`inferredStaminaCost`)
 * × hook `staminaCostPercent`. Struggle tốn 0; chiêu bằng lệnh của biến hình tính theo skill gốc đã chọn.
 */
export function staminaCostOf(data: GameData, d: Draft, user: Monster, skill: Skill): number {
  if (data.config.battle.struggleSkillId === skill.id) return 0
  const base = skill.staminaCost ?? inferredStaminaCost(data.config.stamina, skill)
  let percent = 100
  forEachTraitHook(
    data,
    user,
    (handler, params, scale) => {
      percent += handler.staminaCostPercent?.(params, scale, skill) ?? 0
    },
    monsterBattleContext(data, d, user)
  )
  return Math.max(0, Math.round((base * Math.max(0, percent)) / 100))
}

/**
 * Trả giá skill; trả về phần thiếu (> 0 = quá sức, phạt sau khi skill xong). Quá sức thì bật cờ
 * `overexerting` của bản ghi trận tới hết phạt (điều kiện trait `overexerting`: Vigorous, Seppuku).
 */
export function payStamina(data: GameData, d: Draft, user: Monster, skill: Skill): number {
  const cost = staminaCostOf(data, d, user, skill)
  const current = currentStamina(data, d, user)
  changeStamina(data, d, user, -cost)
  const deficit = Math.max(0, cost - current)
  if (deficit > 0) recordOf(d, user.id).overexerting = true
  return deficit
}

/** Gộp hook `overexertion` của quái (cộng % máu mất, cờ nào có ở một hook là có). */
function overexertionRule(data: GameData, d: Draft, user: Monster): OverexertionRule {
  const rule: OverexertionRule = { hpPercent: 0, skipsExhaustion: false, cannotFaint: false }
  forEachTraitHook(
    data,
    user,
    (handler, params, scale) => {
      const part = handler.overexertion?.(params, scale)
      if (!part) return
      rule.hpPercent += part.hpPercent
      rule.skipsExhaustion ||= part.skipsExhaustion
      rule.cannotFaint ||= part.cannotFaint
    },
    monsterBattleContext(data, d, user)
  )
  return rule
}

/**
 * Quá sức: mất % max HP mỗi điểm thiếu (có thể gục), mất lượt kế tiếp (tự Nghỉ); hook `overexertion`
 * đổi lượng máu mất, bỏ mất lượt, chặn gục. Sự kiện trait `overexert` xếp trước khi trừ máu (Tireless).
 */
export function overexert(data: GameData, d: Draft, user: Monster, deficit: number): void {
  const record = recordOf(d, user.id)
  if (isFainted(data, user)) {
    delete record.overexerting
    return
  }
  const rule = overexertionRule(data, d, user)
  emitTraitEvent(d, { type: 'overexert', subjectId: user.id })
  const basePercent = Math.min(100, deficit * data.config.stamina.overexertHpPercent)
  const percent = (basePercent * Math.max(0, 100 + rule.hpPercent)) / 100
  const full = percentOfMaxHp(getMaxHp(data, user), percent)
  const amount = rule.cannotFaint
    ? minBig(full, maxBig(0, getCurrentHp(data, user).minus(1)))
    : full
  loseHp(data, d, user, amount, (damage) => ({
    type: 'overexerted',
    monsterId: user.id,
    deficit,
    damage
  }))
  delete record.overexerting
  if (!rule.skipsExhaustion) exhaust(d, user)
}

/** Quái mất lượt kế tiếp (quá sức, hiệu ứng `exhaust`). */
export function exhaust(d: Draft, monster: Monster): void {
  recordOf(d, monster.id).exhaustedTurn = d.battle.turn + 1
}

/** Lượt này quái đang kiệt sức do quá sức: lệnh nào cũng thành Nghỉ. */
export const isExhausted = (d: Draft, monsterId: string): boolean =>
  d.battle.records[monsterId]?.exhaustedTurn === d.battle.turn

/** Lệnh Nghỉ (cả lượt kiệt sức): hồi thêm % thể lực tối đa, sự kiện trait `rest`. */
export function restStamina(data: GameData, d: Draft, monster: Monster): void {
  const max = maxStamina(data, d, monster)
  changeStamina(data, d, monster, (max * data.config.stamina.restPercent) / 100)
  log(d, { type: 'rested', monsterId: monster.id })
  emitTraitEvent(d, { type: 'rest', subjectId: monster.id })
}

/** Cuối lượt: quái trên sân hồi % tối đa + số cố định, cộng / trừ theo trạng thái (AP Boost / Drain). */
export function staminaAtTurnEnd(data: GameData, d: Draft): void {
  const { regenPercent, regenFlat } = data.config.stamina
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      const fromStatuses = monster.statuses.reduce(
        (sum, status) => sum + (data.statuses[status.statusId]?.staminaPerTurn ?? 0),
        0
      )
      const regen = (maxStamina(data, d, monster) * regenPercent) / 100 + regenFlat
      changeStamina(data, d, monster, regen + fromStatuses)
    }
  }
}
