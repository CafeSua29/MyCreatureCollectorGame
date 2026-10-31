// Lý lịch quái (monster-history.md): nguồn gốc và cột mốc, chỉ để hiển thị, không ảnh
// hưởng chỉ số. Chỉ lưu id, chữ do UI dịch.

import type { RecruitMethod } from './recruit'
import type { DeathCause } from './soul'

/** Bóng đã bắt quái (Monster.history.origin của quái hoang / boss bắt được). */
interface CaughtOrigin {
  ballItemId: string
}

/**
 * Nguồn gốc của quái. Mục sau có nguồn mới (trade, gacha...) thêm một nhánh vào
 * union này và một mục vào ORIGIN_RULES (validateHistory).
 */
export type HistoryOrigin =
  | { kind: 'starter' }
  | ({ kind: 'wild' } & CaughtOrigin)
  | ({ kind: 'boss' } & CaughtOrigin)
  /** Trứng breeding: loài gốc (baseSpeciesId) của bố mẹ. */
  | { kind: 'egg'; fatherSpeciesId: string; motherSpeciesId: string }
  /** Trứng boss rơi: loài boss rơi trứng. */
  | { kind: 'bossEgg'; bossSpeciesId: string }
  /** Trứng hiếm thám hiểm mang về (expeditions.md): mẫu thám hiểm. */
  | { kind: 'expeditionEgg'; expeditionId: string }
  /** Quái / trứng nhận từ event (docs/rules/events.md). */
  | { kind: 'event'; eventId: string }
  /** Trứng hiếm thưởng thú triều. */
  | { kind: 'beastTide' }
  /** Trứng truyền thừa: loài gốc của quái đã tọa hóa. */
  | { kind: 'legacy'; parentSpeciesId: string }
  /** Quái hoang / boss thu phục (docs/rules/recruit.md): cách thu phục. */
  | { kind: 'recruit'; method: RecruitMethod }
  /** Bắt bằng Bóng Bảo Tồn ở khu bảo tồn (docs/rules/safari-zone.md). */
  | { kind: 'safari' }
  /** Quái từ save cũ, trước khi có lý lịch. */
  | { kind: 'unknown' }

export type HistoryOriginKind = HistoryOrigin['kind']

/** Loài trước / sau khi đổi loài (tiến hóa, dị biến, phản tổ). */
interface SpeciesChange {
  fromSpeciesId: string
  toSpeciesId: string
}

/**
 * Cột mốc, kèm ngày game (từ 0). Mốc của tính năng chưa làm có sẵn trong type nhưng save chứa nó
 * bị kiểm tra chặn tới khi tính năng làm xong (MILESTONE_RULES.pendingRoadmap).
 */
export type Milestone = { day: number } & MilestoneEvent

/** Phần riêng của từng loại mốc (ngoài ngày). */
type MilestoneEvent =
  /** Trứng nở. */
  | { kind: 'hatched' }
  | ({ kind: 'evolved' } & SpeciesChange)
  /** Fuse thành công / thất bại có Bùa Hộ Mệnh, ghi trên quái gốc: loài gốc của quái phụ. */
  | { kind: 'fused'; subSpeciesId: string }
  | { kind: 'fuseFailed'; subSpeciesId: string }
  /** Có mặt trong trận mở tầng (hạ hoặc bắt boss tầng `floor`), mỗi tầng một lần. */
  | { kind: 'floorBossDefeated'; floor: number }
  /** Độ kiếp thành công lên tầng thức tỉnh `tier` (awakening.md). */
  | { kind: 'awakened'; tier: number }
  /** Độ kiếp thất bại ở tầng `tier`, lần thứ `failures` liên tiếp (awakening.md). */
  | { kind: 'tribulationFailed'; tier: number; failures: number }
  /** Hóa hình (human-form.md). */
  | { kind: 'humanFormed' }
  /** Khế ước thành công ở cảnh giới `realm` (docs/rules/tamer.md mục "Khế ước"). */
  | { kind: 'contracted'; realm: number }
  /** Luân hồi lần thứ `count` (rebirth.md). */
  | { kind: 'reborn'; count: number }
  /** Tiến hóa dị biến (evolution-skills.md). */
  | ({ kind: 'mutatedEvolution' } & SpeciesChange)
  /** Dưỡng dục viên mãn (imprinting.md). */
  | { kind: 'imprintPerfected' }
  /** Phản tổ thành loài tổ (bloodline.md). */
  | ({ kind: 'atavized' } & SpeciesChange)
  /** Chết hẳn (chỉ có trong lý lịch của hồn phách / hồn khí, soul-relics.md). */
  | { kind: 'died'; cause: DeathCause }

export type MilestoneKind = Milestone['kind']

export interface MonsterHistory {
  origin: HistoryOrigin
  /**
   * Lúc gặp: ngày game, tầng (null = thị trấn), level. Quái bắt: lúc bắt; trứng: lúc nhận trứng
   * (lúc nở là mốc `hatched`). Save cũ: cả ba null.
   */
  metDay: number | null
  metFloor: number | null
  metLevel: number | null
  /** Cũ trước mới; tối đa config.history.maxMilestones, đầy thì bỏ mốc cũ nhất. */
  milestones: Milestone[]
}

/** Cấu hình lý lịch (balance.json, khóa `history`). */
export interface HistoryConfig {
  maxMilestones: number
}
