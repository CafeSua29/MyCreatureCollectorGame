// Phi thăng và thiên mệnh (docs/rules/ascension.md): kiểu dữ liệu, state, giá trị cao nhất từng đạt.

import { BIG_ZERO, type Decimal } from '../shared'
import type { TamerBonusDef } from './tamerTalents'

/** Độ hiếm thiên mệnh: trọng số ở config.ascension.destiny.rarityWeights. */
export const DESTINY_RARITIES = ['common', 'rare', 'epic'] as const
export type DestinyRarity = (typeof DESTINY_RARITIES)[number]

/** Một thiên mệnh (src/data/destinies.json; tên ở i18n): có lợi kèm hại qua kênh thưởng ngự thú sư. */
export interface DestinyDef {
  id: string
  rarity: DestinyRarity
  effects: TamerBonusDef[]
}

/**
 * Một nâng cấp Tiên giới (src/data/ascensionUpgrades.json; tên ở i18n): cấp n → n + 1 tốn
 * costPerRank × (n + 1) Tiên nguyên như cây thiên phú; hiệu ứng nhân hệ số = cấp.
 */
export interface AscensionUpgradeDef {
  id: string
  requires?: Record<string, number>
  /** Cấp tối đa; bỏ trống = không trần. */
  maxRank?: number
  costPerRank: number
  effects: TamerBonusDef[]
}

/** balance.json khóa `ascension`. */
export interface AscensionConfig {
  /** Tầng cao nhất phải đạt để phi thăng; cũng là mẫu số của đường cong Tiên nguyên. */
  minFloor: number
  /** Hệ số k của đường cong Tiên nguyên. */
  essenceBase: number
  /** Trần % tầng cao nhất từng đạt của tầng khởi đầu (kênh startFloorPercent). */
  startFloorMaxPercent: number
  /** Trần % tiền giữ lại (kênh keepMoneyPercent). */
  keepMoneyMaxPercent: number
  destiny: {
    /** Số thiên mệnh chọn được khi chưa có nâng cấp. */
    baseSlots: number
    /** Số lựa chọn với một ô; mỗi ô thêm một lựa chọn. */
    choiceCount: number
    rarityWeights: Record<DestinyRarity, number>
  }
}

/** GameState.ascension. */
export interface AscensionState {
  count: number
  /** Tiên nguyên còn tiêu được. */
  immortalEssence: Decimal
  /** Tổng Tiên nguyên đã nhận từ mọi lần phi thăng (phần đã nhận của đường cong). */
  totalEssenceEarned: Decimal
  /** Cấp nâng cấp Tiên giới: id → cấp ≥ 1. */
  upgrades: Record<string, number>
  /** Tầng cao nhất tới lần phi thăng trước; giá trị thật đọc qua bestFloorReached. */
  bestFloor: number
  /** Cảnh giới cao nhất tới lần phi thăng trước; giá trị thật đọc qua bestRealmReached. */
  bestRealm: number
  /** Tổng tầng thức tỉnh cao nhất tới lần phi thăng trước. */
  bestAwakening: number
  /** Thiên mệnh đang chờ chọn sau khi phi thăng; null = không chờ. */
  destinyChoices: string[] | null
}

/** Chưa phi thăng lần nào. */
export const newAscensionState = (): AscensionState => ({
  count: 0,
  immortalEssence: BIG_ZERO,
  totalEssenceEarned: BIG_ZERO,
  upgrades: {},
  bestFloor: 1,
  bestRealm: 0,
  bestAwakening: 0,
  destinyChoices: null
})

/** Tầng cao nhất từng đạt, kể cả các lần trước khi phi thăng (mở khóa vĩnh viễn). */
export const bestFloorReached = (state: {
  highestFloor: number
  ascension: Pick<AscensionState, 'bestFloor'>
}): number => Math.max(state.highestFloor, state.ascension.bestFloor)

/** Cảnh giới cao nhất từng đạt, kể cả các lần trước khi phi thăng (mở khóa vĩnh viễn). */
export const bestRealmReached = (state: {
  tamer: { realm: number }
  ascension: Pick<AscensionState, 'bestRealm'>
}): number => Math.max(state.tamer.realm, state.ascension.bestRealm)
