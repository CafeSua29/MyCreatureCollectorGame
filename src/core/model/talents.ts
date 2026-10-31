// Thiên phú quái (docs/rules/monster-talents.md): quái nhận điểm theo level cao nhất từng đạt và
// tầng thức tỉnh, người chơi tự chọn nâng nút trong các nhánh; hiệu ứng của nút là hook trait.

import type { DropEntry, TraitHookDef } from './content'

/**
 * Một nhánh thiên phú (src/data/talentBranches.json; tên ở i18n). `raceIds` (id race hoặc nhóm
 * race) bỏ trống = nhánh chung mọi quái; có thì chỉ quái khớp race mới nâng / nhận hiệu ứng.
 */
export interface TalentBranchDef {
  id: string
  raceIds?: string[]
}

/**
 * Một nút thiên phú (src/data/talents.json; tên ở i18n). Cấp n → n + 1 tốn costPerRank × (n + 1)
 * điểm; hook nhân hệ số = cấp (nguồn hook "talent").
 */
export interface TalentNodeDef {
  id: string
  branchId: string
  /** Nút cần có trước: id nút → cấp tối thiểu. */
  requires?: Record<string, number>
  /** Cấp tối đa; bỏ trống = không trần. */
  maxRank?: number
  costPerRank: number
  hooks: TraitHookDef[]
}

export interface TalentConfig {
  /** +1 điểm mỗi `levelsPerPoint` level theo maxLevelReached. */
  levelsPerPoint: number
  /** Điểm mỗi tầng thức tỉnh. */
  pointsPerAwakening: number
  /** Điểm mỗi lần luân hồi (docs/rules/rebirth.md). */
  pointsPerRebirth: number
  /** Vong Ưu Thủy và đồ tẩy thiên phú rơi thêm từ boss. */
  bossDrops: DropEntry[]
}
