// Cây thiên phú ngự thú sư (docs/rules/tamer-talents.md): điểm, điều kiện nâng, nút có tác dụng.
// Điểm không lưu trong save (quy tắc 3): suy từ cảnh giới, bộ đếm nhiệm vụ, bậc thành tựu đã nhận,
// trừ phần đã dùng. Giá / trần / nút yêu cầu dùng chung với thiên phú quái (talents.ts).

import { bestRealmReached, type GameData, type GameState, type TamerTalentNodeDef } from '../model'
import { rankedNodeBlocker, rankedPointsSpent, type RankedNodeBlocker } from './talents'

/** Phần state cần để tính điểm thiên phú ngự thú sư. */
export type TamerTalentState = Pick<GameState, 'stats' | 'achievements' | 'ascension'> & {
  tamer: Pick<GameState['tamer'], 'realm' | 'talentRanks' | 'bonusTalentPoints'>
}

/** Tổng số bậc thành tựu đã nhận thưởng. */
export const claimedAchievementTiers = (state: Pick<GameState, 'achievements'>): number =>
  Object.values(state.achievements.claimedTiers).reduce((sum, tiers) => sum + tiers, 0)

/**
 * Tổng điểm thiên phú ngự thú sư đã nhận = cảnh giới cao nhất từng đạt × pointsPerRealm + nhiệm vụ đã hoàn thành ×
 * pointsPerQuest + bậc thành tựu đã nhận × pointsPerAchievementTier + điểm thưởng đã lưu
 * (bonusTalentPoints: tông môn).
 */
export function tamerTalentPointsEarned(data: GameData, state: TamerTalentState): number {
  const { pointsPerRealm, pointsPerQuest, pointsPerAchievementTier } = data.config.tamerTalents
  return (
    bestRealmReached(state) * pointsPerRealm +
    state.stats.questsCompleted * pointsPerQuest +
    claimedAchievementTiers(state) * pointsPerAchievementTier +
    state.tamer.bonusTalentPoints
  )
}

/** Tổng điểm thiên phú ngự thú sư đã dùng. */
export const tamerTalentPointsSpent = (data: GameData, state: TamerTalentState): number =>
  rankedPointsSpent(data.tamerTalents, state.tamer.talentRanks)

/** Điểm còn dùng được (có thể âm nếu dữ liệu tăng giá nút sau khi đã nâng, như thiên phú quái). */
export const tamerTalentPointsAvailable = (data: GameData, state: TamerTalentState): number =>
  tamerTalentPointsEarned(data, state) - tamerTalentPointsSpent(data, state)

/** Lý do không nâng được nút `nodeId` thêm một cấp (nút phải tồn tại; null = nâng được). */
export function tamerTalentBlocker(
  data: GameData,
  state: TamerTalentState,
  nodeId: string
): RankedNodeBlocker | null {
  return rankedNodeBlocker(data.tamerTalents[nodeId], state.tamer.talentRanks, {
    nodeId,
    available: tamerTalentPointsAvailable(data, state)
  })
}

/** Nút đã nâng kèm cấp (hiệu ứng nhân hệ số = cấp); nút không còn trong dữ liệu thì bỏ qua. */
export function tamerTalentScales(
  data: GameData,
  ranks: Readonly<Record<string, number>>
): { node: TamerTalentNodeDef; rank: number }[] {
  return Object.entries(ranks)
    .filter(([nodeId]) => Object.hasOwn(data.tamerTalents, nodeId))
    .map(([nodeId, rank]) => ({ node: data.tamerTalents[nodeId], rank }))
}
