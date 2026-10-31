// Cuồng bạo (docs/rules/frenzy.md): vai trò quyết định số, số đặt ở balance.json khóa `frenzy`.

/**
 * Vai trò khi cuồng bạo: quái có chủ race khó kiểm soát (người chơi / NPC), quái của người chơi chưa
 * khế ước (`unbound`, docs/rules/tamer.md mục "Khế ước"), quái hoang thường, boss hoang.
 */
export const FRENZY_ROLES = ['tamed', 'unbound', 'wild', 'boss'] as const
export type FrenzyRole = (typeof FRENZY_ROLES)[number]

/** Số cuồng bạo của một vai trò. */
export interface FrenzyRoleNumbers {
  /** Kích hoạt khi HP ≤ ngưỡng này (% max HP) và phe đang thua. */
  hpThresholdPercent: number
  /** % công và đặc công cộng vào tổng % ở bước trait tới hết trận. */
  statPercent: number
  /** % hành động thêm (skill do AI chọn) sau khi dùng skill, tối đa 1 lần mỗi lượt. */
  extraActionChance: number
}

export interface FrenzyConfig {
  roles: Record<FrenzyRole, FrenzyRoleNumbers>
}
