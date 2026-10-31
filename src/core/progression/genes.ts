// Tung gen theo % quanh một giá trị gốc (mục Breeding ở docs/rules/breeding-eggs.md): dùng chung cho
// con breeding và đột biến khi ấp trứng ở linh địa.

import { Decimal, maxBig, nextFloat, type RngState } from '../shared'
import { STAT_NAMES, type BigStats, type GameData } from '../model'

/**
 * Gen mới quanh `best`: × (1 + r), r trong [−geneDownPercent, +geneUpPercent] % (đột biến: [0, +up]),
 * luôn lệch ít nhất 1 (đột biến: tăng ít nhất 1), tối thiểu 1.
 */
export function rollGene(
  data: GameData,
  rng: RngState,
  best: Decimal,
  mutation: boolean
): [Decimal, RngState] {
  const { geneDownPercent, geneUpPercent } = data.config.breeding
  const low = mutation ? 0 : -geneDownPercent / 100
  const high = geneUpPercent / 100
  let roll: number
  ;[roll, rng] = nextFloat(rng)
  const r = low + roll * (high - low)
  // Làm tròn nửa lên phía dương (như Math.round cũ), không phải xa số 0.
  let delta = best.times(r).toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL)
  if (delta.isZero()) delta = new Decimal(r < 0 ? -1 : 1)
  if (mutation && delta.lt(1)) delta = new Decimal(1)
  return [maxBig(1, best.plus(delta)), rng]
}

/** Đột biến: mọi gen tăng như đột biến của breeding (rollGene với mutation). */
export function mutateGenes(data: GameData, rng: RngState, genes: BigStats): [BigStats, RngState] {
  const mutated = {} as BigStats
  for (const stat of STAT_NAMES) [mutated[stat], rng] = rollGene(data, rng, genes[stat], true)
  return [mutated, rng]
}
