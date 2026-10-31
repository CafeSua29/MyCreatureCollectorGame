// Tham chiếu race (mục "Race" ở stats-traits.md): id race hoặc id nhóm race; id nhóm khớp mọi race
// trong nhóm. Điểm duy nhất cho câu hỏi "quái race X có khớp tham chiếu này không".

import type { GameData } from '../model'

/** Race `raceId` khớp tham chiếu `refId` (chính race đó, hoặc nhóm của nó). */
export function raceMatches(data: GameData, raceId: string, refId: string): boolean {
  return raceId === refId || data.races[raceId]?.groupId === refId
}

/** Race `raceId` khớp một trong các tham chiếu. */
export const raceMatchesAny = (
  data: GameData,
  raceId: string,
  refIds: readonly string[]
): boolean => refIds.some((refId) => raceMatches(data, raceId, refId))

const refCache = new WeakMap<GameData['races'], Record<string, unknown>>()

/** Id hợp lệ cho tham chiếu race (race hoặc nhóm race), để kiểm tra dữ liệu. */
export function raceRefIds(data: GameData): Readonly<Record<string, unknown>> {
  const cached = refCache.get(data.races)
  if (cached) return cached
  const refs = { ...data.raceGroups, ...data.races }
  refCache.set(data.races, refs)
  return refs
}
