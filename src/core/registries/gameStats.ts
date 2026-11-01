// Bộ đếm chung của game (docs/rules/achievements.md mục "Bộ đếm"): một hàm bumpStat gọi ở mỗi chỗ phát
// sinh việc cần đếm. Đặt ở registries để battle / world / progression gọi được.

import { STAT_KEYS, type GameStats, type Monster, type StatKey } from '../model'

/** Bộ đếm lúc bắt đầu (game mới / test): mọi khóa = 0. */
export const newGameStats = (): GameStats =>
  // Ép kiểu: object có đủ mọi khóa của STAT_KEYS.
  Object.fromEntries(STAT_KEYS.map((key) => [key, 0])) as GameStats

/** Cộng `amount` (nguyên ≥ 0) vào khóa `key`; 0 thì trả bộ đếm cũ. Dừng ở MAX_SAFE_INTEGER. */
export function bumpStat(stats: GameStats, key: StatKey, amount = 1): GameStats {
  if (amount <= 0) return stats
  return { ...stats, [key]: Math.min(Number.MAX_SAFE_INTEGER, stats[key] + amount) }
}

/** Quái về tay người chơi bằng bắt / Thị Uy / thu phục / khu bảo tồn: + quái bắt, + shiny bắt. */
export function countCaught(
  stats: GameStats,
  monsters: readonly Pick<Monster, 'shinyStacks'>[]
): GameStats {
  const shiny = monsters.filter((monster) => monster.shinyStacks > 0).length
  return bumpStat(bumpStat(stats, 'monstersCaught', monsters.length), 'shinyCaught', shiny)
}
