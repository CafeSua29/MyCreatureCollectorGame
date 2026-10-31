// Thuần thục skill trong mô phỏng (mục "Thuần thục skill" ở simulation-features.md): quét tầng giả
// định thuần thục theo tầng (mỗi trận quét dùng quái mới nên không tự tích được); chơi liên tục thì
// tích thật theo luật game và đo lại để chỉnh số giả định.

import { masteryLevelFromExp, toBig, type GameData, type Monster } from '@core'
import type { TeamSpec } from './scenarios'

/** Exp thuần thục giả định của mỗi skill đang biết: expPerFloor × (tầng − 1). */
export interface AssumedMasterySpec {
  expPerFloor: number
}

/**
 * Giả định của một đội: exp mỗi tầng riêng của đội (nếu có) đè số chung; không có giả định chung thì
 * không giả định.
 */
export function teamMastery(
  team: Pick<TeamSpec, 'masteryExpPerFloor'>,
  spec: AssumedMasterySpec | null
): AssumedMasterySpec | null {
  if (!spec) return null
  return team.masteryExpPerFloor === null ? spec : { expPerFloor: team.masteryExpPerFloor }
}

/** Đặt thuần thục giả định của tầng `floor` cho mọi skill đang biết của cả đội. */
export function withAssumedMastery(
  data: GameData,
  party: readonly Monster[],
  floor: number,
  spec: AssumedMasterySpec | null
): Monster[] {
  if (!spec || floor <= 1) return [...party]
  const exp = toBig(spec.expPerFloor).times(floor - 1)
  const level = masteryLevelFromExp(data, exp)
  return party.map((monster) => ({
    ...monster,
    skillMastery: Object.fromEntries(monster.skillIds.map((id) => [id, { level, exp }]))
  }))
}

/** Cấp và exp thuần thục trung bình trên mọi skill đang biết của đội mẫu. */
export function averageMastery(
  party: readonly Monster[],
  teamIds: ReadonlySet<string>
): { level: number; exp: number } {
  let level = 0
  let exp = 0
  let count = 0
  for (const monster of party) {
    if (!teamIds.has(monster.id)) continue
    for (const skillId of monster.skillIds) {
      const entry = monster.skillMastery[skillId]
      level += entry?.level ?? 1
      exp += entry ? entry.exp.toNumber() : 0
      count++
    }
  }
  return count === 0 ? { level: 1, exp: 0 } : { level: level / count, exp: exp / count }
}
