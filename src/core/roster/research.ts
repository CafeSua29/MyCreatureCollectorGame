// Nghiên cứu loài (docs/rules/species-research.md): nhận thưởng theo cấp, tình trạng nghiên cứu cho UI.

import { ActionError } from '../shared'
import { addItems } from '../inventory'
import {
  isDexSpecies,
  maxResearchLevel,
  researchCounter,
  researchLevel,
  researchPoints,
  researchTasksOf
} from '../registries'
import type { GameData, GameLogEntry, GameState, ResearchState, ResearchTaskKind } from '../model'

// Câu hỏi về nghiên cứu cho UI / mô phỏng (core dùng thẳng registries).
export {
  hasResearchReveal,
  isResearchComplete,
  maxResearchLevel,
  researchCompletedCount,
  researchLevel,
  researchMultiplier,
  researchPoints
} from '../registries'

/**
 * Nhận thưởng cấp nghiên cứu của loài `speciesId` (ngoài trận): mọi thưởng của cấp đã đạt mà chưa
 * nhận (cấp > claimedLevel), một lần; claimedLevel thành cấp hiện tại.
 */
export function claimResearchReward(
  data: GameData,
  state: GameState,
  speciesId: string
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (!isDexSpecies(data.species[speciesId])) {
    throw new ActionError('researchSpeciesNotFound', { speciesId })
  }
  const level = researchLevel(data, state.research, speciesId)
  const claimed = Object.hasOwn(state.research, speciesId)
    ? state.research[speciesId].claimedLevel
    : 0
  const rewards = data.config.research.levelRewards.filter(
    (reward) => reward.level > claimed && reward.level <= level
  )
  if (rewards.length === 0) throw new ActionError('researchNoReward', { speciesId, level })
  let inventory = state.inventory
  for (const { itemId, count } of rewards.flatMap((reward) => reward.items)) {
    inventory = addItems(inventory, itemId, count)
  }
  const entry = state.research[speciesId]
  return {
    ...state,
    inventory,
    research: { ...state.research, [speciesId]: { ...entry, claimedLevel: level } }
  }
}

/**
 * Dòng log `researchLevelUp` cho loài lên cấp nghiên cứu giữa hai bản research (bộ đếm tăng cả trong
 * lẫn ngoài trận nên gameReducer gọi một chỗ sau mọi action). Chỉ xét loài có mục đổi.
 */
export function researchLevelUps(
  data: GameData,
  before: ResearchState,
  after: ResearchState
): GameLogEntry[] {
  if (after === before) return []
  const entries: GameLogEntry[] = []
  for (const [speciesId, entry] of Object.entries(after)) {
    if (Object.hasOwn(before, speciesId) && before[speciesId] === entry) continue
    const level = researchLevel(data, after, speciesId)
    if (level > researchLevel(data, before, speciesId)) {
      entries.push({ type: 'researchLevelUp', speciesId, level })
    }
  }
  return entries
}

/** Tiến độ một nhiệm vụ của loài (cho UI). */
export interface ResearchTaskStatus {
  kind: ResearchTaskKind
  count: number
  thresholds: readonly number[]
  points: number
}

/** Tình trạng nghiên cứu một loài (như trang Research Tasks của Pokémon Legends: Arceus). */
export interface ResearchStatus {
  speciesId: string
  level: number
  maxLevel: number
  points: number
  /** Điểm cần cho cấp kế tiếp; đã Hoàn thành = null. */
  nextLevelPoints: number | null
  tasks: ResearchTaskStatus[]
  /** Có thưởng cấp đã đạt mà chưa nhận. */
  hasUnclaimedReward: boolean
}

/** Tình trạng nghiên cứu loài `speciesId` (loài thuộc Dex; không thì null). */
export function researchStatus(
  data: GameData,
  research: ResearchState,
  speciesId: string
): ResearchStatus | null {
  if (!isDexSpecies(data.species[speciesId])) return null
  const level = researchLevel(data, research, speciesId)
  const claimed = Object.hasOwn(research, speciesId) ? research[speciesId].claimedLevel : 0
  return {
    speciesId,
    level,
    maxLevel: maxResearchLevel(data),
    points: researchPoints(data, research, speciesId),
    nextLevelPoints: data.config.research.levelPoints[level] ?? null,
    tasks: researchTasksOf(data, speciesId).map((task) => ({
      kind: task.kind,
      count: researchCounter(research, speciesId, task.kind),
      thresholds: task.thresholds,
      points: task.points
    })),
    hasUnclaimedReward: data.config.research.levelRewards.some(
      (reward) => reward.level > claimed && reward.level <= level
    )
  }
}
