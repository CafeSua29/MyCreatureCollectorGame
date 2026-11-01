// Kiểm tra bộ đếm, thành tựu, danh hiệu trong save (docs/rules/achievements.md). Gọi từ
// validateGameState.

import { asObject, checkInteger } from '../shared'
import { achievementTierValue } from '../registries'
import { STAT_KEYS, type GameData } from '../model'
import { checkKnownFields } from '../gameData'

/** stats: đủ mọi khóa của STAT_KEYS, số nguyên ≥ 0, không khóa lạ. */
function checkStats(value: unknown, issues: string[]): void {
  const stats = asObject(value)
  if (!stats) {
    issues.push('stats phải là object')
    return
  }
  checkKnownFields(stats, STAT_KEYS, 'stats', 'bộ đếm', issues)
  for (const key of STAT_KEYS) issues.push(...checkInteger(stats[key], `stats.${key}`, 0))
}

/** achievements.claimedTiers: thành tựu tồn tại, số bậc nguyên ≥ 1 và có thật (thành tựu có trần). */
function checkAchievements(data: GameData, value: unknown, issues: string[]): void {
  const achievements = asObject(value)
  if (!achievements) {
    issues.push('achievements phải là object')
    return
  }
  checkKnownFields(achievements, ['claimedTiers'], 'achievements', 'thành tựu', issues)
  const claimed = asObject(achievements.claimedTiers)
  if (!claimed) {
    issues.push('achievements.claimedTiers phải là object')
    return
  }
  for (const [id, count] of Object.entries(claimed)) {
    const path = `achievements.claimedTiers.${id}`
    if (!Object.hasOwn(data.achievements, id)) {
      issues.push(`${path}: thành tựu không tồn tại`)
      continue
    }
    const problems = checkInteger(count, path, 1)
    issues.push(...problems)
    if (problems.length > 0) continue
    // Bậc cuối đã nhận (count − 1) phải có trong thành tựu.
    if (achievementTierValue(data.achievements[id], Number(count) - 1) === null) {
      issues.push(`${path}: thành tựu không có tới ${String(count)} bậc`)
    }
  }
}

/** titles: owned là danh hiệu tồn tại không trùng; active là null hoặc một danh hiệu trong owned. */
function checkTitles(data: GameData, value: unknown, issues: string[]): void {
  const titles = asObject(value)
  if (!titles) {
    issues.push('titles phải là object')
    return
  }
  checkKnownFields(titles, ['owned', 'active'], 'titles', 'danh hiệu', issues)
  const { owned, active } = titles
  if (!Array.isArray(owned)) {
    issues.push('titles.owned phải là danh sách id danh hiệu')
    return
  }
  owned.forEach((id: unknown, i) => {
    if (typeof id !== 'string' || !Object.hasOwn(data.titles, id)) {
      issues.push(`titles.owned[${i}]: danh hiệu không tồn tại "${String(id)}"`)
    } else if (owned.indexOf(id) !== i) {
      issues.push(`titles.owned[${i}]: danh hiệu bị trùng "${id}"`)
    }
  })
  if (active !== null && (typeof active !== 'string' || !owned.includes(active))) {
    issues.push(`titles.active: phải là null hoặc danh hiệu đã có, nhận "${String(active)}"`)
  }
}

/** Kiểm tra stats, achievements, titles của save. */
export function validateAchievementState(
  data: GameData,
  state: Readonly<Record<string, unknown>>
): string[] {
  const issues: string[] = []
  checkStats(state.stats, issues)
  checkAchievements(data, state.achievements, issues)
  checkTitles(data, state.titles, issues)
  return issues
}
