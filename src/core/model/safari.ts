// Khu bảo tồn (docs/rules/safari-zone.md): khu chỉ để bắt, không đánh; ném bóng / mồi / đá.

import type { Monster } from './monster'

/** Thứ ném vào quái (ngoài bóng) để đổi tỉ lệ bắt / chạy trong vài lượt. */
export const SAFARI_LURES = ['bait', 'rock'] as const

export type SafariLure = (typeof SAFARI_LURES)[number]

/**
 * Hiệu ứng mồi / đá đang có trên quái đang gặp: còn `turnsLeft` lượt (≥ 1, kể cả lượt vừa ném).
 * `favorite`: mồi đúng khẩu vị (không giảm tỉ lệ bắt); đá luôn false.
 */
export interface SafariLureEffect {
  kind: SafariLure
  turnsLeft: number
  favorite: boolean
}

/** Quái đang gặp: quái hoang (chưa khế ước), số lần thoát khỏi bóng (bắt trượt), mồi / đá. */
export interface SafariEncounter {
  monster: Monster
  misses: number
  lure: SafariLureEffect | null
}

/**
 * Một lượt vào khu: lượt gặp còn lại (chưa kể quái đang gặp), Bóng Bảo Tồn còn lại (≥ 1), quái
 * đang gặp, số quái đã bắt.
 */
export interface SafariVisit {
  encountersLeft: number
  balls: number
  encounter: SafariEncounter
  caught: number
}

/** Diễn biến một action trong khu bảo tồn (dòng log ngoài trận, model/gameLog.ts). */
export type SafariLogEntry =
  | { type: 'safariEncounter'; monsterId: string; speciesId: string }
  | {
      type: 'safariThrowBall'
      monsterId: string
      chance: number
      critical: boolean
      shakes: number
    }
  | { type: 'safariBreakFree'; monsterId: string }
  | { type: 'safariCaught'; monsterId: string; destination: 'party' | 'storage' }
  /** Ném mồi (itemId: mồi trong túi; null = mồi thường miễn phí) hoặc đá. */
  | {
      type: 'safariLure'
      monsterId: string
      kind: SafariLure
      itemId: string | null
      favorite: boolean
    }
  | { type: 'safariFled'; monsterId: string }
  | { type: 'safariSkipped'; monsterId: string }
  /** Hết lượt vào khu: hết lượt gặp, hết bóng hoặc tự rời. */
  | { type: 'safariVisitEnded'; caught: number }

/** Phần khu bảo tồn trong save. */
export interface SafariState {
  /** Danh sách loài của đợt hiện tại (không trùng); làm mới khi tới refreshDay. */
  roster: string[]
  refreshDay: number
  /** Lượt vào khu đang diễn ra; null = không ở trong khu. */
  visit: SafariVisit | null
}

/** Hệ số của mồi / đá: nhân tỉ lệ bắt, nhân tỉ lệ chạy, số lượt có tác dụng (kể cả lượt ném). */
export interface SafariLureConfig {
  catchMultiplier: number
  fleeMultiplier: number
  turns: number
}

/** config.safari (balance.json). */
export interface SafariConfig {
  /** Phí vào = entryFeeBase × highestFloor. */
  entryFeeBase: number
  balls: number
  encounters: number
  /** Hệ số bắt của Bóng Bảo Tồn (như catchMultiplier của bóng). */
  ballCatchMultiplier: number
  /** Danh sách loài đổi sau ngần này ngày. */
  rotationDays: number
  rosterSize: number
  /** % mỗi ô danh sách lấy từ loài không gán vào map nào (thay vì loài của map đã gặp). */
  unmappedChance: number
  /**
   * Trọng số loài = (rarityWeightBase + 100 − catchRate) ^ rarityExponent × rankFalloff ^ thứ hạng
   * phẩm cấp loài.
   */
  rarityWeightBase: number
  rarityExponent: number
  rankFalloff: number
  /** % chạy mỗi lượt = fleeBase + fleeRarity × (1 − catchRate / 100), trước hệ số mồi / đá. */
  fleeBase: number
  fleeRarity: number
  lures: Record<SafariLure, SafariLureConfig>
}
