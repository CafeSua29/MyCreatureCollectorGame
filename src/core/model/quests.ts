// Bảng nhiệm vụ (docs/rules/quests.md): mẫu nhiệm vụ (src/data/quests.json), nhiệm vụ trên bảng /
// đang nhận trong state, sự kiện tính tiến độ.

import type { Decimal } from '../shared'
import type { ItemAmount } from './alchemy'

/**
 * Mẫu nhiệm vụ (quests.json; tên ở i18n): loại theo registry QUEST_TYPES (tham số trong `params`),
 * số lần cần trong [countMin, countMax], trọng số xuất hiện, thưởng (tiền × tầng cao nhất lúc ra
 * nhiệm vụ, vật phẩm).
 */
export interface QuestTemplate {
  id: string
  type: string
  params: unknown
  countMin: number
  countMax: number
  weight: number
  reward: QuestRewardDef
}

export interface QuestRewardDef {
  moneyPerFloor: number
  items: ItemAmount[]
}

/** Mục tiêu đã tung của một nhiệm vụ: loại + tham số cụ thể (ví dụ hệ cần bắt, tầng tối thiểu). */
export interface QuestObjective {
  type: string
  [param: string]: unknown
}

/** Nhiệm vụ trên bảng: mục tiêu, số lần cần và thưởng đã tung sẵn lúc ra nhiệm vụ. */
export interface QuestInstance {
  id: string
  templateId: string
  objective: QuestObjective
  target: number
  reward: { money: Decimal; items: ItemAmount[] }
}

/** Nhiệm vụ đang nhận: tiến độ chỉ tính sau khi nhận (≤ target). */
export interface ActiveQuest extends QuestInstance {
  progress: number
}

export interface QuestState {
  board: QuestInstance[]
  active: ActiveQuest[]
  /**
   * Nhiệm vụ tông môn (docs/rules/sects.md): tự nhận khi ra (tiến độ tính ngay), thưởng cống hiến
   * thay cho tiền / vật phẩm; chung bộ đếm id với bảng thường.
   */
  sect: ActiveQuest[]
  /** Bộ đếm id nhiệm vụ "q<số>". */
  nextQuestId: number
}

/** Sự kiện tính tiến độ nhiệm vụ (bắt, hạ, hạ boss tầng, trứng nở, fuse, breed). */
export type QuestEvent =
  | { type: 'caught'; raceId: string; elementIds: readonly string[] }
  | { type: 'defeated'; floor: number }
  | { type: 'floorBossDefeated'; floor: number }
  | { type: 'hatched' }
  | { type: 'fused' }
  | { type: 'bred' }

export interface QuestConfig {
  /** Số nhiệm vụ trên bảng và số nhận cùng lúc tối đa. */
  boardSize: number
  maxActive: number
}
