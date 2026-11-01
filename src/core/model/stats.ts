// Chỉ số: tên chỉ số, bộ chỉ số, bậc trận, kết quả tính chỉ số.

import type { Decimal } from '../shared'

export const STAT_NAMES = ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'] as const

export type StatName = (typeof STAT_NAMES)[number]

/** Mọi chỉ số trừ HP (chỉ số có bậc trận, chỉ số "cao nhất / thấp nhất" của trait). */
export const NON_HP_STATS: readonly Exclude<StatName, 'hp'>[] = STAT_NAMES.filter(
  (stat): stat is Exclude<StatName, 'hp'> => stat !== 'hp'
)

/** Bộ chỉ số dạng number: số từ JSON (chỉ số gốc loài, độ lệch race, growth...). */
export type Stats = Record<StatName, number>

/** Bộ chỉ số có thể lớn vô hạn (gen, fusingBonusStats, chỉ số đã tính): dùng Decimal. */
export type BigStats = Record<StatName, Decimal>

export type PartialStats = Partial<Stats>

// ---------- Kết quả tính chỉ số ----------

/**
 * Chỉ số có bậc trận: mọi chỉ số trừ HP, cùng bậc chính xác / né (như Pokémon; không phải chỉ số,
 * chỉ đổi tỉ lệ trúng: docs/rules/battle.md mục "Bậc trận").
 */
export const STAGE_STATS = [...NON_HP_STATS, 'accuracy', 'evasion'] as const

export type StageStat = (typeof STAGE_STATS)[number]

/** Bậc tăng/giảm trong trận. HP không có bậc. */
export type BattleStages = Partial<Record<StageStat, number>>

/** Chỉ số sau từng bước, theo đúng thứ tự trong CLAUDE.md. */
/**
 * Nguồn % chỉ số (mục "Thứ tự tính chỉ số": mọi nguồn % cộng vào cùng một tổng ở bước áp trait).
 * Registry nguồn: STAT_PERCENT_SOURCES (registries/statPercentSources.ts).
 */
export const STAT_PERCENT_SOURCE_IDS = [
  'traits',
  'statuses',
  'minions',
  'auras',
  'equipment',
  'contract',
  'affinity',
  'age',
  'imprint',
  'synergy',
  'formation',
  'partner',
  'injury',
  'humanForm',
  'trueForm',
  'nature',
  'soulLevel',
  'effort',
  'talent',
  'frenzy',
  'collection',
  'meal',
  'blessing',
  'polarity',
  'sacrifice',
  'rebirth',
  'implant',
  'workTraits',
  'ailment',
  'rules'
] as const

export type StatPercentSourceId = (typeof STAT_PERCENT_SOURCE_IDS)[number]

export interface StatBreakdown {
  /** (gốc loài + gen × geneWeight) × race × boss */
  base: BigStats
  /** × (1 + (level − 1) × growth) */
  leveled: BigStats
  /** + fusingBonusStats. Fusing lấy ½ chỉ số ở bước này của quái phụ. */
  withFusingBonus: BigStats
  /** Sau khi áp trait (cộng, rồi nhân %). */
  withTraits: BigStats
  /** % cộng ở bước áp trait, tách theo nguồn (tổng các nguồn = % đã áp). */
  percentBySource: Record<StatPercentSourceId, Stats>
  /** × hệ số của trạng thái bất thường đang có (ví dụ tê liệt: tốc độ × 0,5). */
  withStatuses: BigStats
  /** × hệ số của môi trường trong trận (ví dụ bão cát: thủ đặc biệt hệ đá × 1,5). */
  withField: BigStats
  /** × hệ số của biến hình trong trận (Dynamax: chỉ max HP). */
  withTransform: BigStats
  /** Sau bậc trong trận, làm tròn xuống, tối thiểu 1. */
  final: BigStats
}
