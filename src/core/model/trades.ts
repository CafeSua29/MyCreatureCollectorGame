// Trao đổi với NPC ở thị trấn (docs/rules/trades.md): NPC muốn một quái theo yêu cầu, đổi lại một
// quái sinh sẵn hoặc vật phẩm, như trao đổi trong game của Pokémon.

import type { Monster } from './monster'

/** Loại yêu cầu (registry TRADE_WANTS ở progression/trades.ts). */
export const TRADE_WANT_KINDS = ['species', 'race', 'element'] as const

export type TradeWantKind = (typeof TRADE_WANT_KINDS)[number]

/** Quái NPC muốn: đúng loài / race / hệ, level tối thiểu. */
export type TradeWant =
  | { kind: 'species'; speciesId: string; minLevel: number }
  | { kind: 'race'; raceId: string; minLevel: number }
  | { kind: 'element'; elementId: string; minLevel: number }

/** Thứ NPC đưa: một quái sinh sẵn (quái hoang, chưa lý lịch) hoặc vật phẩm gộp chồng. */
export type TradeGive =
  { kind: 'monster'; monster: Monster } | { kind: 'item'; itemId: string; count: number }

export type TradeGiveKind = TradeGive['kind']

/** Một đề nghị trên bảng: id "t<số>", NPC (tên trong npcNames.json), yêu cầu, thứ đưa. */
export interface TradeOffer {
  id: string
  npcNameId: string
  want: TradeWant
  give: TradeGive
}

/** Bảng trao đổi (GameState.trades): đề nghị đang có, ngày làm mới kế tiếp, bộ đếm id. */
export interface TradeState {
  offers: TradeOffer[]
  refreshDay: number
  nextOfferId: number
}

export interface TradeConfig {
  /** Bảng làm mới mỗi refreshDays ngày, số đề nghị nguyên trong [min, max]. */
  refreshDays: number
  offerCount: { min: number; max: number }
  /** Trọng số loại yêu cầu / loại thứ đưa (0 = không ra loại đó). */
  wantWeights: Record<TradeWantKind, number>
  giveWeights: Record<TradeGiveKind, number>
  /** Level tối thiểu của quái đưa = ⌈level thấp nhất của quái hoang tầng cao nhất × % / 100⌉ (≥ 1). */
  wantLevelPercent: number
  /**
   * Quái NPC đưa: mọi loài thường trừ dạng chỉ có trong trận, theo trọng số phẩm cấp loài (chỉ số =
   * thứ hạng phẩm cấp; vượt danh sách lấy số cuối), level như quái hoang tầng cao nhất + levelOffset, gen × geneMultiplier, tỉ lệ
   * shiny × shinyMultiplier.
   */
  giveRankWeights: number[]
  giveLevelOffset: number
  giveGeneMultiplier: number
  giveShinyMultiplier: number
  /** Vật phẩm NPC đưa: mọi vật phẩm gộp chồng có giá, 1 cái, trọng số = giá^itemWeightPower. */
  itemWeightPower: number
  /** Quái nhận qua trao đổi được + % EXP (như quái trao đổi của Pokémon nhận ×1,5 EXP). */
  expBonusPercent: number
}
