// Đấu giá hành ở thị trấn (docs/rules/auction.md): phiên bán vài lô hiếm, người chơi đặt giá kín
// cạnh tranh với người mua NPC; ký gửi đồ để NPC mua. Khác chợ đen (event, mua ngay giá cố định).

import type { Decimal } from '../shared'
import type { NormalRarity } from './content'
import type { Egg, EquipmentInstance, ItemEntry, ItemRef } from './state'

/** Loại lô (registry AUCTION_LOTS ở progression/auction.ts; trọng số config.auction.lotWeights). */
export const AUCTION_LOT_KINDS = ['equipment', 'unique', 'egg', 'book', 'item'] as const

export type AuctionLotKind = (typeof AUCTION_LOT_KINDS)[number]

/** Thứ bán trong lô: item (món trang bị count = 1) hoặc một trứng. */
export type AuctionGood =
  { kind: 'item'; entry: ItemEntry; count: number } | { kind: 'egg'; egg: Egg }

/**
 * Một lô: id "a<số>", giá khởi điểm, giá trần NPC (ẩn với người chơi tới khi phiên đóng), giá người
 * chơi đã đặt (tiền đang bị giữ; null = chưa đặt).
 */
export interface AuctionLot {
  id: string
  kind: AuctionLotKind
  good: AuctionGood
  startPrice: Decimal
  npcPrice: Decimal
  bid: Decimal | null
}

/** Đồ ký gửi: id "a<số>" (chung bộ đếm với lô), item đã rời túi, giá sàn. */
export interface AuctionConsignment {
  id: string
  entry: ItemEntry
  count: number
  reservePrice: Decimal
}

/** GameState.auction: phiên đang mở, đồ ký gửi, món trang bị giữ hộ (túi đầy lúc nhận). */
export interface AuctionState {
  lots: AuctionLot[]
  /** Ngày đóng phiên hiện tại (cũng là ngày mở phiên mới); 0 = chưa có phiên nào. */
  closeDay: number
  consignments: AuctionConsignment[]
  held: EquipmentInstance[]
  nextId: number
}

/** Thứ người chơi nhận khi thắng lô / đồ ký gửi bị trả về (log). */
export type AuctionReceived =
  { kind: 'item'; item: ItemRef; count: number; held: boolean } | { kind: 'egg'; eggId: string }

/** Dòng log khi đóng phiên (việc theo ngày, docs/rules/game-log.md). */
export type AuctionDayEvent =
  /** Thắng lô: trả đúng giá đã đặt. */
  | { type: 'auctionWon'; lotId: string; price: Decimal; received: AuctionReceived }
  /** Thua lô: tiền đặt được hoàn; lộ giá trần NPC để người chơi học. */
  | { type: 'auctionLost'; lotId: string; npcPrice: Decimal }
  /** Đồ ký gửi bán được: tiền nhận (đã trừ phí). */
  | {
      type: 'consignmentSold'
      consignmentId: string
      item: ItemRef
      count: number
      earned: Decimal
    }
  /** Đồ ký gửi không bán được (giá NPC dưới giá sàn): trả về túi (hoặc giữ hộ). */
  | {
      type: 'consignmentReturned'
      consignmentId: string
      npcPrice: Decimal
      received: AuctionReceived
    }

export interface AuctionConfig {
  /** Phiên dài sessionDays ngày; số lô nguyên trong [min, max]. */
  sessionDays: number
  lotCount: { min: number; max: number }
  /** Trọng số loại lô (0 = không ra; loại không có hàng thì bỏ qua). */
  lotWeights: Record<AuctionLotKind, number>
  /** Giá khởi điểm = giá trị lô × startPercent / 100 (giá trị: giá gốc item ở tầng cao nhất). */
  startPercent: number
  /** Giá trần NPC = giá khởi điểm × % nguyên trong [npcMinPercent, npcMaxPercent]. */
  npcMinPercent: number
  npcMaxPercent: number
  /** Trang bị thường: bậc theo bảng (hệ số tầng như đồ rơi), dòng ở phần trên của khoảng. */
  equipmentRarityWeights: Partial<Record<NormalRarity, number>>
  equipmentMinRollPercent: number
  /** Số cái của lô vật phẩm (đồ hiếm như chợ đen). */
  itemCount: { min: number; max: number }
  /** Lô sách: tỉ lệ (%) là Chân kinh. */
  bookReusableChance: number
  /**
   * Lô trứng: loài trong bảng gặp của map đã mở, trọng số = catchRate^eggCatchRatePower (âm: loài
   * khó bắt hay ra hơn); giá trị = eggValuePerFloor × tầng cao nhất × eggRankMultipliers[thứ hạng
   * phẩm cấp loài] (vượt danh sách lấy số cuối).
   */
  eggCatchRatePower: number
  eggValuePerFloor: number
  eggRankMultipliers: number[]
  /** Ký gửi: giá NPC trả = giá bán ở cửa hàng × % nguyên trong [min, max]; phí % trên tiền bán. */
  consignMinPercent: number
  consignMaxPercent: number
  feePercent: number
}
