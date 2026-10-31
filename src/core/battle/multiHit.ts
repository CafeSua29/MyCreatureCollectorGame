// Số đòn của skill đánh nhiều lần (mục Battle): min = max thì cố định (không tốn RNG); khoảng có
// trong config.battle.hitCountWeights thì theo trọng số (2–5: 35 / 35 / 15 / 15); khác thì chia đều.
// Mốc thuần thục cộng số đòn tối thiểu (docs/rules/skill-mastery.md): tung như cũ rồi nâng số đòn
// thấp hơn lên mức tối thiểu mới (không vượt max), nên RNG tiêu như không có thuần thục.

import { nextInt, pickWeighted, type RngState } from '../shared'
import type { BattleConfig, HitRange, Skill } from '../model'

/** Số đòn tối thiểu sau khi cộng thuần thục, không vượt số đòn tối đa. */
const raisedMin = (hits: HitRange, minHitsBonus: number): number =>
  Math.min(hits.max, hits.min + minHitsBonus)

/**
 * Tung số đòn của một lần dùng skill; skill không có `hits` luôn 1 đòn. `minHitsBonus`: số đòn
 * tối thiểu cộng thêm của thuần thục.
 */
export function rollHitCount(
  config: BattleConfig,
  skill: Skill,
  rng: RngState,
  minHitsBonus = 0
): [number, RngState] {
  if (!skill.hits) return [1, rng]
  const [count, next] = rollBaseHitCount(config, skill.hits, rng)
  return [Math.max(count, raisedMin(skill.hits, minHitsBonus)), next]
}

function rollBaseHitCount(
  config: BattleConfig,
  { min, max }: HitRange,
  rng: RngState
): [number, RngState] {
  if (min === max) return [min, rng]
  const table = config.hitCountWeights.find((entry) => entry.min === min && entry.max === max)
  if (!table) return nextInt(rng, min, max)
  const counts = table.weights.map((_, i) => min + i)
  return pickWeighted(rng, counts, (count) => table.weights[count - min])
}

/** Số đòn trung bình của một lần dùng skill (AI dự đoán sát thương), theo đúng phân bố của rollHitCount. */
export function expectedHitCount(config: BattleConfig, skill: Skill, minHitsBonus = 0): number {
  if (!skill.hits) return 1
  const { min, max } = skill.hits
  const floor = raisedMin(skill.hits, minHitsBonus)
  const table = config.hitCountWeights.find((entry) => entry.min === min && entry.max === max)
  if (min === max || !table) {
    // Chia đều trên [min, max], số đòn dưới floor thành floor.
    let sum = 0
    for (let count = min; count <= max; count++) sum += Math.max(count, floor)
    return sum / (max - min + 1)
  }
  const total = table.weights.reduce((sum, weight) => sum + weight, 0)
  const weighted = table.weights.reduce(
    (sum, weight, i) => sum + Math.max(min + i, floor) * weight,
    0
  )
  return weighted / total
}
