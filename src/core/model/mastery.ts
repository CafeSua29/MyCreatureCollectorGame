// Độ thuần thục skill (docs/rules/skill-mastery.md): skill dùng càng nhiều càng mạnh, không trần.
// Chỉ lưu nguyên liệu (cấp, tổng exp); hiệu lực tính lại theo config.

import type { Decimal } from '../shared'

/** Thuần thục của một skill trên quái: `exp` là tổng exp đã tích, `level` tính từ đó. */
export interface SkillMastery {
  /** Cấp, số nguyên ≥ 1. */
  level: number
  /** Tổng exp đã tích (cấp = masteryLevelFromExp), ≥ 0. */
  exp: Decimal
}

/** Một mốc thuần thục: đạt `level` thì cộng thêm các thưởng ghi trong mốc (cộng dồn các mốc). */
export interface MasteryMilestone {
  level: number
  /** % tỉ lệ hiệu ứng phụ (hiệu ứng có `chance` < 100) cộng thêm, nhân như trait kiểu Serene Grace. */
  secondaryChancePercent?: number
  /** Số đòn tối thiểu cộng thêm của skill đánh nhiều lần (không vượt số đòn tối đa). */
  minHitsBonus?: number
}

/** Cấu hình thuần thục skill (balance.json, khóa `mastery`). */
export interface MasteryConfig {
  /** Tổng exp để đạt cấp L = ⌈baseExp × (L − 1)^expPower⌉ (đa thức, tính ngược được ra cấp). */
  baseExp: number
  expPower: number
  /** Exp mỗi lần dùng skill trong trận (trúng hay trượt). */
  useExp: number
  /** Exp cộng thêm cho mỗi mục tiêu phe địch bị hạ trong lần dùng. */
  knockoutExp: number
  /** Power × levelEffectScale(powerStep, cấp). */
  powerStep: number
  /** Accuracy cộng thêm mỗi cấp trên cấp 1 (accuracy gốc kẹp tối đa 100). */
  accuracyPerLevel: number
  /** Mốc theo cấp tăng dần. */
  milestones: MasteryMilestone[]
}
