// Bậc sao (docs/rules/star-rank.md): số sao suy ra từ tổng số bản đã ghép (`Monster.starCopies`). Lên
// từ s sao lên s + 1 cần copiesBase + copiesPerStar × s bản, nên số bản cần cho s sao là
// C(s) = copiesBase × s + copiesPerStar × s(s − 1)/2 (tuyến tính mỗi bậc, không trần). Bản thừa giữ lại
// làm tiến độ tới sao kế tiếp, nên một quái nguyên liệu có sao không bao giờ bị phí.

import { toBig, type Decimal } from '../shared'
import type { GameData, Monster, StarRankConfig } from '../model'

/** Số bản cần ghép từ 0 sao để có `stars` sao (C(s)); có thể vượt số nguyên an toàn với s cực lớn. */
export function copiesForStars(config: StarRankConfig, stars: number): number {
  return config.copiesBase * stars + (config.copiesPerStar * stars * (stars - 1)) / 2
}

/**
 * Số sao với `copies` bản đã ghép: s lớn nhất có C(s) ≤ copies. Giải phương trình bậc hai rồi chỉnh
 * ±1 vì sai số dấu phẩy động (copies tới MAX_SAFE_INTEGER).
 */
export function starsFromCopies(config: StarRankConfig, copies: number): number {
  const { copiesBase: base, copiesPerStar: per } = config
  // C(s) ≤ n ⇔ s ≤ (−k + √(k² + 8n/per)) / 2 với k = (2 × base − per) / per.
  const k = (2 * base - per) / per
  let stars =
    per === 0
      ? Math.floor(copies / base)
      : Math.floor((-k + Math.sqrt(k * k + (8 * copies) / per)) / 2)
  while (stars > 0 && copiesForStars(config, stars) > copies) stars--
  while (copiesForStars(config, stars + 1) <= copies) stars++
  return stars
}

/** Số sao của quái. */
export function starsOf(data: GameData, monster: Pick<Monster, 'starCopies'>): number {
  return starsFromCopies(data.config.stars, monster.starCopies)
}

/** Số bản một quái nguyên liệu đáng giá: chính nó + mọi bản đã ghép vào nó (sao không mất khi đem ghép). */
export function starFeedWorth(monster: Pick<Monster, 'starCopies'>): number {
  return 1 + monster.starCopies
}

/**
 * Giá lên từ `from` sao lên `to` sao: Σ costPerStar × (s + 1) với s từ from tới to − 1, tức
 * costPerStar × (T(to) − T(from)) với T(n) = n(n + 1)/2. Tính bằng Decimal (số sao cực lớn).
 */
export function starUpCost(config: StarRankConfig, from: number, to: number): Decimal {
  const triangle = (n: number): Decimal =>
    toBig(n)
      .times(n + 1)
      .div(2)
  return toBig(config.costPerStar)
    .times(triangle(to).minus(triangle(from)))
    .ceil()
}

/** % mọi chỉ số quái đang được cộng từ bậc sao (tuyến tính theo số sao). */
export function starStatPercent(data: GameData, monster: Pick<Monster, 'starCopies'>): number {
  return starsOf(data, monster) * data.config.stars.statPercentPerStar
}

/** Bậc sao để hiển thị (MonsterView.stars). */
export interface StarRankView {
  stars: number
  /** Tổng số bản đã ghép. */
  copies: number
  /** Số bản còn thiếu để lên sao kế tiếp. */
  copiesToNext: number
  /** % mọi chỉ số đang cộng. */
  statPercent: number
  /** Giá lên sao kế tiếp. */
  nextCost: Decimal
}

/** Bậc sao của quái cho MonsterView. */
export function starRankView(data: GameData, monster: Pick<Monster, 'starCopies'>): StarRankView {
  const config = data.config.stars
  const stars = starsOf(data, monster)
  return {
    stars,
    copies: monster.starCopies,
    copiesToNext: copiesForStars(config, stars + 1) - monster.starCopies,
    statPercent: stars * config.statPercentPerStar,
    nextCost: starUpCost(config, stars, stars + 1)
  }
}
