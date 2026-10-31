// Phòng Thí Nghiệm: cấy ghép (docs/rules/implant.md): NPC ở thị trấn bán huyết thanh, cấy vào quái
// để cộng thẳng vào chỉ số gốc hoặc nhận hiệu ứng (hook trait), có rủi ro thất bại (trừ chỉ số /
// hiệu ứng ngược, thất bại lần cuối mất quái).

import type { Decimal } from '../shared'
import type { TraitHookDef } from './content'
import type { StatName } from './stats'

/**
 * Loại hiệu ứng của huyết thanh (registry SERUM_EFFECTS ở progression/serumEffects.ts). Thêm loại
 * mới = thêm vào đây + một handler.
 */
export const SERUM_EFFECT_KINDS = ['flatStat', 'hookEffect'] as const

export type SerumEffectKind = (typeof SERUM_EFFECT_KINDS)[number]

interface SerumTierBase {
  id: string
  /** Trọng số xuất hiện trong danh sách hàng (> 0). */
  weight: number
  /** Giá cấy = price × highestFloor. */
  price: number
}

/** Bậc cộng chỉ số: statCount chỉ số khác nhau, mỗi chỉ số trong [min, max] ở tầng 1. */
export interface FlatStatSerumTier extends SerumTierBase {
  kind: 'flatStat'
  statCount: number
  min: number
  max: number
}

/** Bậc hiệu ứng: một hiệu ứng của serumEffects.json (theo trọng số), `levels` cấp mỗi lần cấy. */
export interface HookEffectSerumTier extends SerumTierBase {
  kind: 'hookEffect'
  levels: number
}

/** Một bậc huyết thanh (balance.json `implant.tiers`), phân loại theo kind. */
export type SerumTierConfig = FlatStatSerumTier | HookEffectSerumTier

/** Cấu hình cấy ghép (balance.json, khóa `implant`). */
export interface ImplantConfig {
  /** Bậc huyết thanh (ít nhất 1). */
  tiers: SerumTierConfig[]
  /** Số huyết thanh mỗi lần đổi hàng: nguyên trong [stockMin, stockMax]. */
  stockMin: number
  stockMax: number
  /** Đổi hàng sau ngần này ngày. */
  restockDays: number
  /** Tỉ lệ thành công (%) = baseChance × chanceFalloff^(số lần đã cấy). */
  baseChance: number
  chanceFalloff: number
  /** Thất bại lần thứ maxFails thì mất quái. */
  maxFails: number
}

/**
 * Hiệu ứng cấy (src/data/serumEffects.json; tên ở i18n): cấp dương có `hooks` × cấp, cấp âm (cấy
 * thất bại) có `failHooks` × |cấp| (hiệu ứng ngược).
 */
export interface SerumEffectDef {
  id: string
  /** Trọng số được chọn khi random huyết thanh hiệu ứng (> 0). */
  weight: number
  hooks: TraitHookDef[]
  failHooks: TraitHookDef[]
}

/** Một hiệu ứng trong huyết thanh đang bán, phân loại theo kind. */
export type SerumEffect =
  /** Cộng `amount` (nguyên ≥ 1, đã scale theo tầng) vào chỉ số `stat` (implantBonusStats). */
  | { kind: 'flatStat'; stat: StatName; amount: Decimal }
  /** Cộng `levels` cấp hiệu ứng `effectId` (implantEffects). */
  | { kind: 'hookEffect'; effectId: string; levels: number }

/** Huyết thanh đang bán: bậc và các hiệu ứng (dùng không giới hạn số lần tới lần đổi hàng sau). */
export interface Serum {
  tierId: string
  effects: SerumEffect[]
}

/** Phòng Thí Nghiệm trong state: hàng đang bán, ngày đổi hàng kế tiếp. */
export interface LabState {
  stock: Serum[]
  /** Tới ngày này (`day` ≥ restockDay) thì đổi hàng (việc theo ngày). */
  restockDay: number
}
