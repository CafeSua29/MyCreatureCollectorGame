// Thân mật trong mô phỏng (mục "Thân mật" ở simulation-features.md): quét tầng giả định thân mật
// theo tầng; chơi liên tục thì thân mật tăng thật theo luật game.

import type { GameData, Monster } from '@core'

/**
 * Thân mật giả định của đội ở tầng `floor`: tầng 1 như quái khởi đầu, từ tầng 2 tối đa (chơi liên
 * tục cần khoảng 200 trận mỗi tầng, mỗi trận thắng +1 / +2, nên qua tầng 1 là đã đầy).
 */
export function assumedAffinity(data: GameData, floor: number): number {
  const { max, start } = data.config.affinity
  return floor <= 1 ? start.starter : max
}

/** Đặt thân mật giả định cho cả đội. */
export const withAssumedAffinity = (
  data: GameData,
  party: readonly Monster[],
  floor: number
): Monster[] => party.map((monster) => ({ ...monster, affinity: assumedAffinity(data, floor) }))
