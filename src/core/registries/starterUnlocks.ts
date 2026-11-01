// Mở khóa loài khởi đầu xuyên save (docs/rules/starters.md): loài nào đã đủ điều kiện mở ở một state.
// Lưu danh sách đã mở là việc của main / renderer (profile.json), core chỉ tính.

import { evolutionLineOf } from '../inventory'
import type { GameData, StarterUnlock } from '../model'
import { ACHIEVEMENT_CONDITIONS, type AchievementScope } from './achievements'
import { isStarterEligible } from './starterConditions'

/** Phần state điều kiện mở khóa đọc (cùng phạm vi với điều kiện thành tựu). */
export type StarterUnlockScope = AchievementScope

/** Đạt điều kiện của một mục mở khóa: tiến độ ≥ value. */
export function isStarterUnlockReached(
  data: GameData,
  state: StarterUnlockScope,
  unlock: StarterUnlock
): boolean {
  const { type, ...params } = unlock.condition
  return ACHIEVEMENT_CONDITIONS[type].progress(params, state, data) >= unlock.value
}

/** Dạng đầu (loài làm khởi đầu được) của chuỗi tiến hóa chứa loài này. */
function lineStarters(data: GameData, speciesId: string): string[] {
  return evolutionLineOf(data, speciesId).filter((id) => isStarterEligible(data, id))
}

/**
 * Loài khởi đầu đã đủ điều kiện mở ở state này, không trùng: các mục `config.starter.unlocks` đã đạt,
 * rồi (nếu `unlockOwnedLines`) dạng đầu của chuỗi mỗi loài đã sở hữu trong Dex.
 */
export function reachedStarterUnlocks(data: GameData, state: StarterUnlockScope): string[] {
  const { unlocks, unlockOwnedLines } = data.config.starter
  const result = new Set<string>()
  for (const unlock of unlocks) {
    if (isStarterUnlockReached(data, state, unlock))
      unlock.speciesIds.forEach((id) => result.add(id))
  }
  if (unlockOwnedLines) {
    for (const owned of state.dex.owned) lineStarters(data, owned).forEach((id) => result.add(id))
  }
  return [...result]
}

/** Loài mới mở (đạt ở state này mà chưa có trong `unlocked`). */
export function newStarterUnlocks(
  data: GameData,
  state: StarterUnlockScope,
  unlocked: readonly string[]
): string[] {
  const known = new Set(unlocked)
  return reachedStarterUnlocks(data, state).filter((id) => !known.has(id))
}
