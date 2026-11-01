// Trait làm việc (docs/rules/dwelling.md mục "Trait làm việc", như passive skill của Palworld): tung
// cho quái mới, con breeding thừa hưởng từ bố mẹ (+ đột biến), quái shiny luôn có trait shiny.

import { maxWorkTraits, withWorkTrait } from '../registries'
import { pickWeighted, rollPercent, type RngState } from '../shared'
import type { GameData, Monster } from '../model'

/** Một trait chưa có, không cùng nhóm với trait đang có, theo trọng số; null = hết lựa chọn. */
function rollOneTrait(
  data: GameData,
  rng: RngState,
  traits: readonly string[]
): [string | null, RngState] {
  const groups = new Set(traits.map((id) => data.workTraits[id]?.group).filter(Boolean))
  const pool = Object.values(data.workTraits).filter(
    (def) =>
      def.weight > 0 &&
      !traits.includes(def.id) &&
      (def.group === undefined || !groups.has(def.group))
  )
  if (pool.length === 0) return [null, rng]
  const [def, next] = pickWeighted(rng, pool, (entry) => entry.weight)
  return [def.id, next]
}

/** Quái shiny luôn có trait shiny (Lucky của Lucky Pal); thay trait cuối nếu đã đủ chỗ. */
function withShinyTrait(data: GameData, traits: string[], shinyStacks: number): string[] {
  const { shinyTraitId } = data.config.dwelling.workTraits
  if (shinyStacks <= 0 || shinyTraitId === null || traits.includes(shinyTraitId)) return traits
  const added = withWorkTrait(data, traits, shinyTraitId)
  if (added.includes(shinyTraitId)) return added
  return [...traits.slice(0, -1), shinyTraitId]
}

/**
 * Trait làm việc của quái mới (quái hoang, boss, trứng, quái khởi đầu): số trait theo trọng số
 * countWeights, mỗi trait theo trọng số của nó, không trùng nhóm.
 */
export function rollWorkTraits(
  data: GameData,
  rng: RngState,
  monster: Pick<Monster, 'shinyStacks'>
): [string[], RngState] {
  const weights = data.config.dwelling.workTraits.countWeights
  const options = weights.flatMap((weight, i) => (weight > 0 ? [i] : []))
  // Chỉ một lựa chọn số trait thì không tốn RNG.
  let count = options[0] ?? 0
  if (options.length > 1) [count, rng] = pickWeighted(rng, options, (i) => weights[i])
  const traits: string[] = []
  for (let i = 0; i < count; i++) {
    let traitId: string | null
    ;[traitId, rng] = rollOneTrait(data, rng, traits)
    if (traitId === null) break
    traits.push(traitId)
  }
  return [withShinyTrait(data, traits, monster.shinyStacks), rng]
}

/**
 * Trait làm việc của con breeding: mỗi trait của bố / mẹ (không trùng) inheritChance % được
 * truyền, rồi mutationChance % thêm một trait ngẫu nhiên; không quá số tối đa, không trùng nhóm.
 */
export function rollChildWorkTraits(
  data: GameData,
  rng: RngState,
  { parents, shinyStacks }: { parents: readonly Monster[]; shinyStacks: number }
): [string[], RngState] {
  const { inheritChance, mutationChance } = data.config.dwelling.workTraits
  const max = maxWorkTraits(data)
  const pool = [...new Set(parents.flatMap((parent) => parent.workTraits))]
  let traits: string[] = []
  for (const traitId of pool) {
    let inherited: boolean
    ;[inherited, rng] = rollPercent(rng, inheritChance)
    const group = data.workTraits[traitId]?.group
    const clashes = group !== undefined && traits.some((id) => data.workTraits[id]?.group === group)
    if (inherited && !clashes && traits.length < max) traits = [...traits, traitId]
  }
  let mutated: boolean
  ;[mutated, rng] = rollPercent(rng, mutationChance)
  if (mutated && traits.length < max) {
    let traitId: string | null
    ;[traitId, rng] = rollOneTrait(data, rng, traits)
    if (traitId !== null) traits = [...traits, traitId]
  }
  return [withShinyTrait(data, traits, shinyStacks), rng]
}
