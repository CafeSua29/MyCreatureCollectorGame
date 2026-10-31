// Registry hiệu ứng bùa fuse (category fusionAid, mục Fusing). Thêm hiệu ứng mới = thêm handler vào
// FUSION_AID_EFFECTS, rồi khai báo { type, params } trong items.json. Mỗi handler thuộc một ô:
// action fuse nhận tối đa 1 bùa mỗi ô, mọi hiệu ứng của một bùa phải cùng ô.

import { asObject, checkNumber } from '../shared'
import type { FusionAidItem, GameData } from '../model'

/** Ô bùa trong action fuse: tăng tỉ lệ (`boostItemId`) hay hộ mệnh (`protectItemId`). */
export const FUSION_AID_SLOTS = ['boost', 'protect'] as const

export type FusionAidSlot = (typeof FUSION_AID_SLOTS)[number]

export interface FusionAidEffectHandler {
  slot: FusionAidSlot
  validateParams(params: unknown, data: GameData): string[]
  /** Điểm % cộng vào tỉ lệ fuse thành công. */
  chanceBonus?(params: unknown): number
  /** Fuse thất bại thì quái gốc được giữ nguyên. */
  protectsBase?: true
}

// ---------- fuseChanceBonus: + điểm % thành công ----------

const fuseChanceBonus: FusionAidEffectHandler = {
  slot: 'boost',
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.points, 'points', 0, 100) : ['params phải là object']
  },
  chanceBonus(params) {
    return (params as { points: number }).points
  }
}

// ---------- fuseProtect: thất bại thì giữ quái gốc (quái phụ, tiền vẫn mất) ----------

const fuseProtect: FusionAidEffectHandler = {
  slot: 'protect',
  validateParams(params) {
    return asObject(params) ? [] : ['params phải là object']
  },
  protectsBase: true
}

// ---------- Registry ----------

export const FUSION_AID_EFFECTS: Readonly<Record<string, FusionAidEffectHandler>> = {
  fuseChanceBonus,
  fuseProtect
}

/** Ô của bùa (dữ liệu đã kiểm tra: mọi hiệu ứng cùng ô, ít nhất một hiệu ứng). */
export function fusionAidSlot(item: FusionAidItem): FusionAidSlot {
  return FUSION_AID_EFFECTS[item.effects[0].type].slot
}

/** Tổng điểm % thành công bùa cộng thêm. */
export function fusionAidChanceBonus(item: FusionAidItem): number {
  return item.effects.reduce(
    (sum, effect) => sum + (FUSION_AID_EFFECTS[effect.type].chanceBonus?.(effect.params) ?? 0),
    0
  )
}

/** Bùa có giữ quái gốc khi fuse thất bại không. */
export function fusionAidProtectsBase(item: FusionAidItem): boolean {
  return item.effects.some((effect) => FUSION_AID_EFFECTS[effect.type].protectsBase === true)
}
