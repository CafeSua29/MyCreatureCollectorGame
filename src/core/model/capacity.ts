// Sức chứa kho quái và túi trang bị (docs/rules/capacity.md): giới hạn, mở rộng không giới hạn bằng
// tiền ở NPC kho đồ, cộng thêm theo mốc cảnh giới ngự thú sư (không gian ngự thú).

/** Loại sức chứa: kho quái (không tính đội), túi trang bị (món + hồn phách, không tính món đang lắp). */
export const CAPACITY_KINDS = ['storage', 'bag'] as const

export type CapacityKind = (typeof CAPACITY_KINDS)[number]

/** Luật một loại sức chứa (balance.json `capacity.<loại>`). */
export interface CapacityRule {
  /** Sức chứa ban đầu. */
  base: number
  /** Mỗi lần mở rộng +perExpansion. */
  perExpansion: number
  /** Giá lần mở rộng thứ k (từ 1) = costBase × k². */
  costBase: number
  /** Mỗi mốc cảnh giới đã đạt (tamer.realmMilestones) +realmBonus. */
  realmBonus: number
}

export type CapacityConfig = Record<CapacityKind, CapacityRule>

/** Số lần đã mở rộng mỗi loại (nguyên ≥ 0). */
export type CapacityState = Record<CapacityKind, number>
