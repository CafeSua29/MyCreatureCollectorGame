// Thành tựu và danh hiệu (docs/rules/achievements.md): nhận thưởng bậc đã đạt, đeo / tháo danh hiệu,
// tiến độ cho UI. Tiến độ đọc từ state (bộ đếm + phần state có sẵn) nên không cần ghi sau mỗi action.

import { ActionError, malformedAction, toBig } from '../shared'
import { addItems } from '../inventory'
import {
  achievementProgress,
  achievementTierRewards,
  achievementTierValue,
  achievementTiersReached
} from '../registries'
import type { AchievementDef, GameData, GameState } from '../model'

// Câu hỏi cho UI / mô phỏng (core dùng thẳng registries).
export {
  achievementProgress,
  achievementTierValue,
  achievementTiersReached,
  titleMultiplier,
  titlePercent
} from '../registries'

/** Thành tựu lúc bắt đầu (game mới / test): chưa nhận bậc nào. */
export const newAchievementState = (): GameState['achievements'] => ({ claimedTiers: {} })

/** Danh hiệu lúc bắt đầu: chưa có, không đeo. */
export const newTitleState = (): GameState['titles'] => ({ owned: [], active: null })

/** Số bậc đã nhận thưởng của thành tựu. */
export const claimedTierCount = (
  state: Pick<GameState, 'achievements'>,
  achievementId: string
): number => state.achievements.claimedTiers[achievementId] ?? 0

/** Tình trạng một thành tựu cho UI: tiến độ, bậc đã đạt / đã nhận, giá trị bậc kế tiếp chưa nhận. */
export interface AchievementStatus {
  achievementId: string
  progress: number
  reached: number
  claimed: number
  /** Giá trị cần của bậc kế tiếp chưa nhận; null = đã nhận mọi bậc (thành tựu có trần). */
  nextValue: number | null
}

export function achievementStatus(
  data: GameData,
  state: GameState,
  achievement: AchievementDef
): AchievementStatus {
  const progress = achievementProgress(data, state, achievement)
  const claimed = claimedTierCount(state, achievement.id)
  return {
    achievementId: achievement.id,
    progress,
    reached: achievementTiersReached(achievement, progress),
    claimed,
    nextValue: achievementTierValue(achievement, claimed)
  }
}

/**
 * Nhận thưởng mọi bậc đã đạt mà chưa nhận của thành tựu (ngoài trận, ở đâu cũng được): tiền =
 * moneyPerFloor × highestFloor, vật phẩm, danh hiệu (đã có thì thôi). Mỗi bậc nhận một lần.
 */
export function claimAchievement(
  data: GameData,
  state: GameState,
  achievementId: string
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (typeof achievementId !== 'string' || !Object.hasOwn(data.achievements, achievementId)) {
    throw new ActionError('achievementNotFound', { achievementId: String(achievementId) })
  }
  const achievement = data.achievements[achievementId]
  const { progress, reached, claimed, nextValue } = achievementStatus(data, state, achievement)
  if (nextValue === null) throw new ActionError('achievementCompleted', { achievementId })
  if (reached <= claimed) {
    throw new ActionError('achievementNotReached', {
      achievementId,
      need: nextValue,
      have: progress
    })
  }
  let { money, inventory } = state
  const owned = [...state.titles.owned]
  for (let index = claimed; index < reached; index++) {
    const rewards = achievementTierRewards(achievement, index)
    money = money.plus(toBig(rewards.moneyPerFloor ?? 0).times(state.highestFloor))
    for (const { itemId, count } of rewards.items ?? []) {
      inventory = addItems(inventory, itemId, count)
    }
    if (rewards.titleId !== undefined && !owned.includes(rewards.titleId)) {
      owned.push(rewards.titleId)
    }
  }
  return {
    ...state,
    money,
    inventory,
    titles: { ...state.titles, owned },
    achievements: {
      claimedTiers: { ...state.achievements.claimedTiers, [achievementId]: reached }
    }
  }
}

/** Đeo danh hiệu đã có (null = tháo), ngoài trận, miễn phí. Không đổi gì thì trả state cũ. */
export function setTitle(data: GameData, state: GameState, titleId: string | null): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (titleId !== null && typeof titleId !== 'string') {
    throw malformedAction('titleId phải là id danh hiệu hoặc null')
  }
  if (titleId !== null) {
    if (!Object.hasOwn(data.titles, titleId)) throw new ActionError('titleNotFound', { titleId })
    if (!state.titles.owned.includes(titleId)) throw new ActionError('titleNotOwned', { titleId })
  }
  if (state.titles.active === titleId) return state
  return { ...state, titles: { ...state.titles, active: titleId } }
}
