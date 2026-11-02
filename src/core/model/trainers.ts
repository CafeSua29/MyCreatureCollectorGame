// Ngự thú sư NPC (docs/rules/trainers.md): lớp NPC (src/data/trainers.json; tên ở i18n), trận NPC
// trong BattleState, đạo quán / giải đấu / đấu trường trong GameState, config.

import type { DropEntry } from './content'

/** Lớp thường (gặp trên tầng, đạo quán, giải đấu, đấu trường) và quán chủ (chỉ ở đạo quán). */
export const TRAINER_KINDS = ['regular', 'gymLeader'] as const

export type TrainerKind = (typeof TRAINER_KINDS)[number]

/** Hồ sơ AI: `standard` không đổi quái; `switcher` đổi quái khi bất lợi nặng. */
export const TRAINER_AI_PROFILES = ['standard', 'switcher'] as const

export type TrainerAiProfile = (typeof TRAINER_AI_PROFILES)[number]

/** Chế độ của trận NPC: quyết định thưởng thêm và việc sau trận (registry TRAINER_MODES). */
export const TRAINER_MODES = [
  'floor',
  'gym',
  'gymLeader',
  'tournament',
  'arena',
  'trial',
  'event',
  'sectDuel',
  'sectPromotion',
  'sectWar'
] as const

export type TrainerMode = (typeof TRAINER_MODES)[number]

/**
 * Lớp NPC: đội `teamSize` quái loài hoang có hệ thuộc `elementIds` (rỗng = mọi hệ; quán chủ lấy hệ
 * của đạo quán), level như quái hoang của tầng + `levelOffset`, cảnh giới ngự thú sư = cảnh giới
 * người chơi + `tamerRealmOffset` (tối thiểu 0) và chỉ dùng `tamerSkillIds`; thưởng tiền ×
 * `rewardMultiplier`. `equipmentSlots` món trang bị theo map; `transforms` = biến hình như boss;
 * `formationIds`: trận pháp đầu tiên đội đủ điều kiện.
 */
export interface TrainerClass {
  id: string
  kind: TrainerKind
  elementIds: string[]
  teamSize: { min: number; max: number }
  levelOffset: number
  rewardMultiplier: number
  tamerRealmOffset: number
  tamerSkillIds: string[]
  aiProfile: TrainerAiProfile
  equipmentSlots: number
  transforms: boolean
  formationIds: string[]
}

/** Trận NPC đang đánh: lớp, chế độ, hệ đội (đạo quán), hệ số tiền thưởng của chế độ. */
export interface BattleTrainer {
  classId: string
  mode: TrainerMode
  /** Hệ của đạo quán (đội NPC lấy loài theo hệ này); null = theo lớp. */
  elementId: string | null
  /** Hệ số tiền thưởng của chế độ (vòng giải đấu, đánh lại đạo quán); nhân thêm rewardMultiplier. */
  rewardMultiplier: number
  /** Đồng môn đang đấu (luận võ, thi thăng chức; docs/rules/sects.md). */
  memberId?: string
  /** Tên NPC (id trong npcNames.json) khi đối thủ không phải đồng môn (tông chiến). */
  npcNameId?: string
}

/** Một đạo quán (mỗi `gym.every` tầng; hệ tung lúc mở tầng). */
export interface Gym {
  floor: number
  elementId: string
  /** Số NPC phải thắng trước quán chủ. */
  trainerCount: number
  /** NPC đã thắng trong lượt thử hiện tại (thua thì về 0). */
  progress: number
  /** Số lần đã thắng quán chủ (> 0 = có huy hiệu). */
  wins: number
}

export interface TournamentState {
  /** Kỳ giải đã tham gia gần nhất (⌊ngày ÷ everyDays⌋); −1 = chưa. */
  lastPeriod: number
  /** Vòng sắp đánh (0 = vòng đầu); null = không trong giải. */
  round: number | null
}

export interface TrainerState {
  gyms: Gym[]
  /** Bậc đấu trường xếp hạng (không trần). */
  arenaRank: number
  tournament: TournamentState
}

/** Vòng giải đấu: level đối thủ cộng thêm, hệ số tiền thưởng. */
export interface TournamentRound {
  levelOffset: number
  rewardMultiplier: number
}

/** Món thưởng cố định (số lượng). */
export interface ItemReward {
  itemId: string
  count: number
}

export interface TrainerConfig {
  /** % gặp ngự thú sư thay quái hoang khi startWildBattle. */
  encounterChance: number
  /** Trọng số loài không gặp ở map nào trong đội NPC (loài hoang = 1). */
  nonWildSpeciesWeight: number
  /** Trọng số gặp lớp NPC khi map không có loài đúng hệ của lớp. */
  offThemeClassWeight: number
  /** Đồ thưởng mỗi trận NPC thắng (tung từng món, × hệ số rơi). */
  rewardDrops: DropEntry[]
  ai: {
    /** Đổi quái khi điểm lựa chọn tốt nhất < switchRatio × điểm của quái dự bị tốt nhất. */
    switchRatio: number
    /** Không đổi khi quái dự bị tốt nhất có điểm dưới mức này. */
    switchMinScore: number
  }
  gym: {
    every: number
    trainerCount: { min: number; max: number }
    leaderClassId: string
    /** % tiền thưởng khi đánh lại quán chủ / NPC của đạo quán đã có huy hiệu. */
    repeatRewardPercent: number
    /** Lần đầu thắng quán chủ: một món trong danh sách (đều nhau). */
    firstClearItemIds: string[]
    /** Vật phẩm chìa khóa theo tầng đạo quán: nhận khi lần đầu thắng quán chủ ở tầng đó. */
    keyItemFloors: Record<string, number>
  }
  tournament: {
    everyDays: number
    rounds: TournamentRound[]
    championRewards: ItemReward[]
  }
  arena: {
    /** Level đối thủ + ⌊bậc × levelPerRank⌋. */
    levelPerRank: number
    milestoneEvery: number
    milestoneRewards: ItemReward[]
  }
}
