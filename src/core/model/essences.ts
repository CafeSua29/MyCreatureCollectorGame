// Tinh chất (docs/rules/essences.md, theo Essence của Portals of Phereon): lợi ích lâu dài của cả save,
// chọn một trong vài tinh chất tung ngẫu nhiên (thưởng khi đóng một cổng thế giới, zones.md). Dữ liệu
// src/data/essences.json (tên ở i18n `essences`), số ở balance.json khóa `essences`.

import type { StatName } from './stats'

export const ESSENCE_RARITIES = ['common', 'rare', 'mythic'] as const

export type EssenceRarity = (typeof ESSENCE_RARITIES)[number]

/**
 * Hiệu ứng của tinh chất (union theo `kind`, registry ESSENCE_EFFECTS ở progression/essences.ts).
 * - `growth`: quái nở / fuse (thuộc race / nhóm race nếu có) + % gen các chỉ số; `lowest` = chỉ số gen
 *   thấp nhất (Balance).
 * - `battleTrait`: quái của người chơi vào trận nhận trait tạm (tới hết trận).
 * - `fusionTraitChoices`: chọn thêm trait khi fuse (`extra`, cộng dồn).
 * - `egg`: + sức lớn / độ ổn định của trứng trong phòng ấp.
 */
export type EssenceEffect =
  | {
      kind: 'growth'
      stats: StatName[] | 'lowest'
      percent: number
      raceIds?: string[]
      raceGroupIds?: string[]
    }
  | { kind: 'battleTrait'; traitId: string }
  | { kind: 'fusionTraitChoices'; extra: number }
  | { kind: 'egg'; growth: number; stability: number }

export type EssenceEffectKind = EssenceEffect['kind']

export const ESSENCE_EFFECT_KINDS = [
  'growth',
  'battleTrait',
  'fusionTraitChoices',
  'egg'
] as const satisfies readonly EssenceEffectKind[]

export interface EssenceDef {
  id: string
  rarity: EssenceRarity
  effect: EssenceEffect
}

export interface EssenceState {
  /** Tinh chất đã có (không lặp). */
  owned: string[]
  /** Lựa chọn đang chờ (id tinh chất); null = không có. */
  offer: string[] | null
}

export interface EssenceConfig {
  /** Số tinh chất mỗi lần chọn. */
  offerSize: number
  /** Trọng số độ hiếm khi tung từng ô lựa chọn. */
  rarityWeights: Record<EssenceRarity, number>
}
