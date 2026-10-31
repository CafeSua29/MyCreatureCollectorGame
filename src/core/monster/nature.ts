// Tính cách (docs/rules/natures.md): tung tính cách cho quái mới, tính cách con breeding.

import { passesNature } from '../registries'
import { pick, type RngState } from '../shared'
import type { GameData, Monster } from '../model'

/** Tung đều một tính cách trong natures.json (quái hoang, boss, trứng, quái khởi đầu). */
export function rollNature(data: GameData, rng: RngState): [string, RngState] {
  return pick(rng, Object.keys(data.natures))
}

/**
 * Tính cách con breeding: bố / mẹ lắp Bất Biến Thạch (hook inheritNature) thì con nhận tính cách
 * của bên đó, cả hai cùng lắp thì tung 50/50; không ai lắp thì tung đều như quái mới.
 */
export function rollChildNature(
  data: GameData,
  rng: RngState,
  parents: readonly Monster[]
): [string, RngState] {
  const keepers = parents.filter((parent) => passesNature(data, parent))
  if (keepers.length === 0) return rollNature(data, rng)
  let keeper: Monster
  ;[keeper, rng] = pick(rng, keepers)
  return [keeper.natureId, rng]
}
