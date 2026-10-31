// Thanh chỉ số trên thẻ quái: các thẻ cùng màn dùng chung một thang (chỉ số lớn nhất) để so sánh.

import { maxBig, STAT_NAMES, type BigValue, type Decimal, type MonsterView } from '@core'

/** Thang chung = chỉ số lớn nhất trong mọi thẻ (tối thiểu 1 để không chia cho 0). */
export function statBarScale(views: readonly MonsterView[]): Decimal {
  return maxBig(1, ...views.flatMap((view) => STAT_NAMES.map((stat) => view.stats[stat])))
}

/** Độ dài thanh (%) trong [0, 100]. Tính tỉ lệ bằng Decimal nên đúng cả khi chỉ số rất lớn. */
export function statBarPercent(value: BigValue, scale: Decimal): number {
  if (scale.lte(0)) return 0
  return Math.min(100, maxBig(0, value).div(scale).times(100).toNumber())
}
