// Thế mạnh / thế nhanh (docs/rules/move-styles.md): như Strong / Agile Style của Pokémon Legends:
// Arceus, chỉ cho skill có `styles` và quái đã thuần thục skill đó đủ cấp.

/** Thế của lệnh skill: mạnh (mạnh hơn, chậm hơn) hoặc nhanh (yếu hơn, đi trước). */
export const MOVE_STYLES = ['strong', 'agile'] as const

export type MoveStyle = (typeof MOVE_STYLES)[number]

/** Số của một thế (balance.json `moveStyles.strong` / `.agile`, skill có thể ghi đè từng số). */
export interface MoveStyleNumbers {
  /** Hệ số power trong công thức sát thương (> 0). */
  powerMultiplier: number
  /** Điểm % cộng vào tỉ lệ hiệu ứng phụ (chance < 100) của skill gây sát thương; có thể âm. */
  secondaryChanceShift: number
  /** Số bậc cộng thêm vào mỗi hiệu ứng đổi bậc chỉ số (theo chiều của hiệu ứng), nguyên ≥ 0. */
  stageBonus: number
  /** Số lượt cộng thêm cho trạng thái do skill trạng thái gây, nguyên ≥ 0. */
  statusTurnsBonus: number
  /** Cộng vào priority của skill (nguyên). */
  priorityShift: number
  /** Hệ số tốc độ khi xếp thứ tự ở lượt ngay sau (> 0). */
  nextTurnSpeedMultiplier: number
}

/** Số ghi đè riêng của skill cho từng thế; thiếu số nào dùng số chung. */
export type SkillStyleOverrides = Partial<Record<MoveStyle, Partial<MoveStyleNumbers>>>

/** Cấu hình thế (balance.json, khóa `moveStyles`). */
export interface MoveStylesConfig {
  /** Cấp thuần thục skill tối thiểu để dùng thế (docs/rules/skill-mastery.md). */
  unlockMastery: number
  strong: MoveStyleNumbers
  agile: MoveStyleNumbers
}
