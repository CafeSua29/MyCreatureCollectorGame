// Thành tựu và danh hiệu (docs/rules/achievements.md): bộ đếm chung của game, thành tựu theo bậc đọc
// bộ đếm / state, danh hiệu đeo một cái để nhận buff nhỏ toàn cục.

import type { ItemReward } from './trainers'

/**
 * Khóa bộ đếm chung (GameState.stats). Chỉ đếm việc không suy ra được từ state; số suy ra được
 * (tầng cao nhất, cảnh giới, huy hiệu, bậc đấu trường, tầng tháp, Dex) điều kiện thành tựu đọc thẳng.
 */
export const STAT_KEYS = [
  'battlesWon',
  'bossesDefeated',
  'trainersDefeated',
  'monstersCaught',
  'shinyCaught',
  'eggsHatched',
  'fusions',
  'breeds',
  'tribulationsPassed',
  'tournamentsWon',
  'pillsCrafted',
  'itemsForged',
  'dishesCooked',
  'oldAgeDeaths'
] as const

export type StatKey = (typeof STAT_KEYS)[number]

/** Bộ đếm chung: số nguyên ≥ 0 theo khóa (đếm số lần làm việc nên không cần Decimal). */
export type GameStats = Record<StatKey, number>

/** Loại điều kiện thành tựu (registry ACHIEVEMENT_CONDITIONS ở registries/achievements.ts). */
export const ACHIEVEMENT_CONDITION_TYPES = [
  'stat',
  'dexOwned',
  'dexPercent',
  'shinySpecies',
  'researchCompleted',
  'highestFloor',
  'tamerRealm',
  'towerFloor',
  'gymBadges',
  'arenaRank',
  'ownSpecies',
  'aptitude',
  'speciesRank'
] as const

export type AchievementConditionType = (typeof ACHIEVEMENT_CONDITION_TYPES)[number]

/** Điều kiện `{ type, ...params }`: params kiểm tra theo handler của loại. */
export interface AchievementCondition {
  type: AchievementConditionType
  [param: string]: unknown
}

/** Thưởng một bậc: tiền × highestFloor, vật phẩm, danh hiệu (đều không bắt buộc). */
export interface AchievementRewards {
  moneyPerFloor?: number
  items?: ItemReward[]
  titleId?: string
}

/** Một bậc: tiến độ đạt `value` thì nhận được thưởng. */
export interface AchievementTier {
  value: number
  rewards: AchievementRewards
}

/**
 * Bậc sinh theo công thức sau bậc cuối của `tiers` (thành tựu không trần): bậc thứ k sau bậc cuối cần
 * ⌈giá trị bậc cuối × factor^k⌉, thưởng `rewards` (không có danh hiệu: mỗi danh hiệu một nguồn).
 */
export interface AchievementRepeat {
  factor: number
  rewards: AchievementRewards
}

/** Một thành tựu (src/data/achievements.json; tên ở i18n). */
export interface AchievementDef {
  id: string
  condition: AchievementCondition
  /** Bậc theo value tăng dần, ít nhất một bậc. */
  tiers: AchievementTier[]
  repeat?: AchievementRepeat
}

/** Phần thành tựu trong save: số bậc đã nhận thưởng theo id thành tựu (chưa nhận bậc nào = không có). */
export interface AchievementState {
  claimedTiers: Record<string, number>
}

/**
 * Loại hiệu ứng danh hiệu (registry TITLE_EFFECTS ở registries/titles.ts): mọi loại là một kênh %,
 * nhân phần thưởng / tỉ lệ như chúc phúc (recruitPercent, alchemySuccessPercent cộng thẳng vào %).
 */
export const TITLE_EFFECT_TYPES = [
  'expPercent',
  'moneyPercent',
  'dropRatePercent',
  'catchRatePercent',
  'recruitPercent',
  'shinyChancePercent',
  'alchemySuccessPercent'
] as const

export type TitleEffectType = (typeof TITLE_EFFECT_TYPES)[number]

export interface TitleEffectDef {
  type: TitleEffectType
  params: unknown
}

/** Một danh hiệu (src/data/titles.json; tên ở i18n): hiệu ứng có tác dụng khi đang đeo. */
export interface TitleDef {
  id: string
  /** Có thể rỗng (danh hiệu chỉ để trưng). */
  effects: TitleEffectDef[]
}

/** Danh hiệu trong save: đã có (không trùng), đang đeo (một trong owned hoặc null). */
export interface TitleState {
  owned: string[]
  active: string | null
}
