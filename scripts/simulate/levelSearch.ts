// Tìm level cần để thắng boss tầng (mục "Tìm level cần để thắng boss" ở simulation.md): tìm nhị
// phân levelOffset nhỏ nhất có tỉ lệ thắng ≥ mục tiêu, giả định tỉ lệ thắng tăng theo level.

export interface SearchPoint {
  offset: number
  won: number
  played: number
}

export const winRateOf = (point: SearchPoint): number =>
  point.played > 0 ? point.won / point.played : 0

/**
 * Offset nhỏ nhất trong [0, maxOffset] có tỉ lệ thắng ≥ target (0–1); không đạt kể cả ở maxOffset
 * thì null. `measure` nên tự nhớ kết quả theo offset vì nhiều mục tiêu đo lại cùng điểm.
 */
export function findMinOffset<Point extends SearchPoint>(
  target: number,
  maxOffset: number,
  measure: (offset: number) => Point
): Point | null {
  if (winRateOf(measure(maxOffset)) < target) return null
  let low = 0
  let high = maxOffset
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (winRateOf(measure(middle)) >= target) high = middle
    else low = middle + 1
  }
  return measure(low)
}

/** Bọc hàm đo để mỗi offset chỉ đo một lần. */
export function memoizeByOffset<Point extends SearchPoint>(
  measure: (offset: number) => Point
): (offset: number) => Point {
  const cache = new Map<number, Point>()
  return (offset) => {
    const cached = cache.get(offset)
    if (cached) return cached
    const point = measure(offset)
    cache.set(offset, point)
    return point
  }
}
