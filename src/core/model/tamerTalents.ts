// Thưởng toàn cục của ngự thú sư (docs/rules/tamer-talents.md): danh hiệu đang đeo và cây thiên phú
// ngự thú sư cùng cộng vào một bộ kênh (TAMER_BONUS_TYPES), nơi dùng hỏi theo kênh, không theo nguồn.

/**
 * Loại kênh thưởng (registry TAMER_BONUSES ở registries/tamerBonuses.ts). Kênh `...Percent` có params
 * `{ percent }` (khác 0, ≥ −100), `tamerSkillCooldown` có `{ turns }` (giảm hồi chiêu kỹ năng ngự
 * thú sư của người chơi), `destinySlots` / `partySlotPenalty` có `{ slots }` (nguyên ≥ 1).
 */
export const TAMER_BONUS_TYPES = [
  'expPercent',
  'moneyPercent',
  'dropRatePercent',
  'catchRatePercent',
  'recruitPercent',
  'shinyChancePercent',
  'alchemySuccessPercent',
  'smithingSuccessPercent',
  'cookingSuccessPercent',
  'shopPricePercent',
  'dwellingOutputPercent',
  'teamStatPercent',
  'manaPercent',
  'contractLevelPercent',
  'tamerSkillCooldown',
  'teamDamagePercent',
  'contractResonancePercent',
  'breakthroughCostPercent',
  'startFloorPercent',
  'keepMoneyPercent',
  'destinySlots',
  'partySlotPenalty'
] as const

export type TamerBonusType = (typeof TAMER_BONUS_TYPES)[number]

export interface TamerBonusDef {
  type: TamerBonusType
  params: unknown
}

/** Một nhánh thiên phú ngự thú sư (src/data/tamerTalentBranches.json; tên ở i18n). */
export interface TamerTalentBranchDef {
  id: string
}

/**
 * Một nút thiên phú ngự thú sư (src/data/tamerTalents.json; tên ở i18n). Cấp n → n + 1 tốn
 * costPerRank × (n + 1) điểm (như thiên phú quái); hiệu ứng nhân hệ số = cấp.
 */
export interface TamerTalentNodeDef {
  id: string
  branchId: string
  /** Nút cần có trước (nhánh nào cũng được): id nút → cấp tối thiểu. */
  requires?: Record<string, number>
  /** Cấp tối đa; bỏ trống = không trần. */
  maxRank?: number
  costPerRank: number
  effects: TamerBonusDef[]
}

export interface TamerTalentConfig {
  /** Điểm mỗi cảnh giới (mỗi lần đột phá thành công). */
  pointsPerRealm: number
  /** Điểm mỗi nhiệm vụ đã hoàn thành (bộ đếm questsCompleted). */
  pointsPerQuest: number
  /** Điểm mỗi bậc thành tựu đã nhận. */
  pointsPerAchievementTier: number
  /** Vật phẩm tẩy cây thiên phú (action resetTamerTalents tiêu 1 cái). */
  resetItemId: string
}
