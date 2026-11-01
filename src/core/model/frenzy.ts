// Cuồng bạo (docs/rules/frenzy.md): vai trò quyết định số, số đặt ở balance.json khóa `frenzy`.

/**
 * Vai trò khi cuồng bạo: quái có chủ race khó kiểm soát (người chơi / NPC), quái của người chơi chưa
 * khế ước (`unbound`, docs/rules/tamer.md mục "Khế ước"), quái hoang thường, boss hoang, boss thế
 * giới (docs/rules/world-boss.md).
 */
export const FRENZY_ROLES = ['tamed', 'unbound', 'wild', 'boss', 'worldBoss'] as const
export type FrenzyRole = (typeof FRENZY_ROLES)[number]

/** Số cuồng bạo của một vai trò. */
export interface FrenzyRoleNumbers {
  /** Kích hoạt khi HP ≤ ngưỡng này (% max HP) và phe đang thua. */
  hpThresholdPercent: number
  /**
   * Kích hoạt theo lượt thay cho điều kiện HP / phe thua: cuồng bạo từ lượt này (kích hoạt cuối lượt
   * trước đó); bỏ trống = theo HP. Boss thế giới HP vô hạn nên dùng cách này.
   */
  fromTurn?: number
  /** % công và đặc công cộng vào tổng % ở bước trait tới hết trận. */
  statPercent: number
  /** % hành động thêm (skill do AI chọn) sau khi dùng skill, tối đa 1 lần mỗi lượt. */
  extraActionChance: number
}

export interface FrenzyConfig {
  roles: Record<FrenzyRole, FrenzyRoleNumbers>
}
