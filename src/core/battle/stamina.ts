// Thể lực cho skill (docs/rules/stamina.md, từ Temtem): mỗi skill bằng lệnh tốn thể lực; thiếu vẫn
// dùng được nhưng quá sức (mất máu theo phần thiếu, mất lượt kế tiếp); cuối lượt hồi một phần, lệnh
// Nghỉ hồi thêm. Chỉ có trong trận: lưu phần đã mất ở bản ghi trận, hết trận tự đầy.

import { getMaxHp, isFainted, percentOfMaxHp } from '../monster'
import { forEachTraitHook, staminaMaxOf } from '../registries'
import type { GameData, Monster, Skill } from '../model'
import { Draft, aliveOnField, log, monsterBattleContext, recordOf } from './draft'
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
}

/** Lượng thể lực cần đổi theo spec: số điểm, % tối đa, hoặc phần còn thiếu tới mức tối thiểu. */
export function staminaChangeOf(
  data: GameData,
  d: Draft,
  monster: Monster,
  spec: StaminaChangeSpec
): number {
  const max = maxStamina(data, d, monster)
  if (spec.percent !== undefined) return Math.round((max * spec.percent) / 100)
  if (spec.atLeastPercent !== undefined) {
    const floor = Math.ceil((max * spec.atLeastPercent) / 100)
    return Math.max(0, floor - currentStamina(data, d, monster))
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

/**
 * Giá của skill với quái: `staminaCost` của skill, không có thì suy theo power (bảng
 * `stamina.costByPower`, skill trạng thái `statusCost`) × hook `staminaCostPercent`. Skill không hệ
 * kiểu Struggle và chiêu bằng lệnh của biến hình tính theo skill gốc đã chọn.
 */
export function staminaCostOf(data: GameData, d: Draft, user: Monster, skill: Skill): number {
  if (data.config.battle.struggleSkillId === skill.id) return 0
  const { costByPower, statusCost } = data.config.stamina
  const base =
    skill.staminaCost ??
    (skill.power <= 0
      ? statusCost
      : ((costByPower.find((tier) => skill.power <= tier.upToPower) ?? costByPower.at(-1))?.cost ??
        0))
  let percent = 100
  forEachTraitHook(
    data,
    user,
    (handler, params, scale) => {
      percent += handler.staminaCostPercent?.(params, scale) ?? 0
    },
    monsterBattleContext(data, d, user)
  )
  return Math.max(0, Math.round((base * Math.max(0, percent)) / 100))
}

/** Trả giá skill; trả về phần thiếu (> 0 = quá sức, phạt sau khi skill xong). */
export function payStamina(data: GameData, d: Draft, user: Monster, skill: Skill): number {
  const cost = staminaCostOf(data, d, user, skill)
  const current = currentStamina(data, d, user)
  changeStamina(data, d, user, -cost)
  return Math.max(0, cost - current)
}

/** Quá sức: mất % max HP mỗi điểm thiếu (có thể gục), mất lượt kế tiếp (tự Nghỉ). */
export function overexert(data: GameData, d: Draft, user: Monster, deficit: number): void {
  if (isFainted(data, user)) return
  const percent = Math.min(100, deficit * data.config.stamina.overexertHpPercent)
  const amount = percentOfMaxHp(getMaxHp(data, user), percent)
  loseHp(data, d, user, amount, (damage) => ({
    type: 'overexerted',
    monsterId: user.id,
    deficit,
    damage
  }))
  recordOf(d, user.id).exhaustedTurn = d.battle.turn + 1
}

/** Lượt này quái đang kiệt sức do quá sức: lệnh nào cũng thành Nghỉ. */
export const isExhausted = (d: Draft, monsterId: string): boolean =>
  d.battle.records[monsterId]?.exhaustedTurn === d.battle.turn

/** Lệnh Nghỉ: hồi thêm % thể lực tối đa. */
export function restStamina(data: GameData, d: Draft, monster: Monster): void {
  const max = maxStamina(data, d, monster)
  changeStamina(data, d, monster, (max * data.config.stamina.restPercent) / 100)
  log(d, { type: 'rested', monsterId: monster.id })
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
