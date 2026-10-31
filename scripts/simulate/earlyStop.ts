// Dừng sớm khi quét tầng (mục "Quét theo tầng" ở simulation.md): đủ minBattles trận và khoảng tin
// cậy Wilson 95% của tỉ lệ thắng đủ hẹp thì không đánh tiếp, vì thêm trận không đổi kết luận.

import type { EarlyStopSpec } from './scenarios'

/** z của khoảng tin cậy 95% (phân phối chuẩn). */
const Z_95 = 1.96

/** Khoảng tin cậy Wilson 95% của tỉ lệ won / played; played = 0 thì [0, 1]. */
export function wilsonInterval(won: number, played: number): { low: number; high: number } {
  if (played <= 0) return { low: 0, high: 1 }
  const rate = won / played
  const z2 = Z_95 * Z_95
  const denominator = 1 + z2 / played
  const center = (rate + z2 / (2 * played)) / denominator
  const margin =
    (Z_95 * Math.sqrt((rate * (1 - rate)) / played + z2 / (4 * played * played))) / denominator
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) }
}

/** Đúng khi đã đánh đủ minBattles trận và khoảng tin cậy rộng ≤ ciWidth. null = không dừng sớm. */
export function shouldStopEarly(won: number, played: number, spec: EarlyStopSpec | null): boolean {
  if (!spec || played < spec.minBattles) return false
  const { low, high } = wilsonInterval(won, played)
  return high - low <= spec.ciWidth
}
