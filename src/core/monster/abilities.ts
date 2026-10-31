// Ability theo loài (docs/rules/abilities.md), như ability của Pokémon: loài có 1–2 ability thường và
// có thể có ability ẩn (đều là id trait); quái lưu ô ability, ability thật tính theo loài hiện tại
// (dạng Mega khi đang Mega Evolution, như Pokémon đổi ability khi Mega). Hook của ability chạy như
// trait (nguồn `ability`, hệ số 1) ở registries/traitHooks.ts.

import { assertNever, pick, rollPercent, type RngState } from '../shared'
import { type AbilitySlot, type GameData, type Monster, type NormalSpecies } from '../model'
import { activeTransform } from './stats'
import { getBaseSpecies } from './validateMonster'

/**
 * Loài quyết định ability của quái: dạng Mega đang có tác dụng; dạng trong trận có ability riêng
 * (như Pokémon đổi dạng hẳn: Terapagos Terastal → Tera Shell, Ogerpon Tera → Embody Aspect; dạng
 * cùng ability như Zen Mode thì như cũ); không thì loài hiện tại (sau tiến hóa); quái fuse (loài
 * hiện tại không phải loài thường) theo loài gốc.
 */
function abilitySpecies(data: GameData, monster: Monster): NormalSpecies | undefined {
  const transform = activeTransform(monster)
  if ((transform?.kind === 'mega' || transform?.kind === 'ultraBurst') && transform.formSpeciesId) {
    const form = data.species[transform.formSpeciesId]
    if (form?.kind === 'normal' && form.abilities) return form
  }
  if (monster.battleForm) {
    const form = data.species[monster.battleForm.speciesId]
    if (form?.kind === 'normal' && form.abilities) return form
  }
  const current = data.species[monster.speciesId]
  return current?.kind === 'normal' ? current : getBaseSpecies(data, monster)
}

/**
 * Ability của loài ở ô `slot`: như Pokémon, loài chỉ có một ability thường thì ô thứ hai là ability
 * đó; loài không có ability ẩn thì ô ẩn là ability thường thứ nhất. Loài không có ability: null.
 */
export function speciesAbility(species: NormalSpecies, slot: AbilitySlot): string | null {
  const [first, second] = species.abilities ?? []
  if (first === undefined) return null
  switch (slot) {
    case 'first':
      return first
    case 'second':
      return second ?? first
    case 'hidden':
      return species.hiddenAbility ?? first
    default:
      return assertNever(slot, 'ô ability')
  }
}

/** Id trait ability của quái (null = loài không có ability riêng). */
export function abilityTraitId(data: GameData, monster: Monster): string | null {
  const species = abilitySpecies(data, monster)
  return species ? speciesAbility(species, monster.abilitySlot) : null
}

/** Cách đổi ô ability bằng vật phẩm (như Pokémon). */
export const ABILITY_SLOT_CHANGES = ['swapNormal', 'toggleHidden'] as const

export type AbilitySlotChange = (typeof ABILITY_SLOT_CHANGES)[number]

/**
 * Ô ability mới sau khi dùng vật phẩm đổi ô; null = không có tác dụng. `swapNormal` (Ability
 * Capsule): đổi giữa hai ô thường, loài chỉ có một ability thường hoặc quái đang ở ô ẩn thì không
 * được. `toggleHidden` (Ability Patch, thế hệ 9): ô thường → ô ẩn, ô ẩn → ô thường thứ nhất; loài
 * không có ability ẩn khác ability thường thì không được.
 */
export function changedAbilitySlot(
  data: GameData,
  monster: Monster,
  change: AbilitySlotChange
): AbilitySlot | null {
  const species = abilitySpecies(data, monster)
  if (!species?.abilities) return null
  const current = speciesAbility(species, monster.abilitySlot)
  const target: AbilitySlot =
    change === 'swapNormal'
      ? monster.abilitySlot === 'first'
        ? 'second'
        : 'first'
      : monster.abilitySlot === 'hidden'
        ? 'first'
        : 'hidden'
  if (change === 'swapNormal' && monster.abilitySlot === 'hidden') return null
  return speciesAbility(species, target) === current ? null : target
}

/** Một trong hai ô thường, chia đều. */
const rollNormalSlot = (rng: RngState): [AbilitySlot, RngState] => pick(rng, ['first', 'second'])

/** Ô ability của quái hoang / quái mới: `wildHiddenChance`% ô ẩn, còn lại chia đều hai ô thường. */
export function rollAbilitySlot(data: GameData, rng: RngState): [AbilitySlot, RngState] {
  let hidden: boolean
  ;[hidden, rng] = rollPercent(rng, data.config.abilities.wildHiddenChance)
  return hidden ? ['hidden', rng] : rollNormalSlot(rng)
}

/**
 * Ô ability của con breeding theo mẹ (như Pokémon thế hệ 6+): mẹ ô ẩn thì `inheritHiddenChance`% con
 * ô ẩn, còn lại chia đều hai ô thường; mẹ ô thường thì `inheritChance`% giữ đúng ô đó, còn lại ô kia.
 */
export function rollChildAbilitySlot(
  data: GameData,
  rng: RngState,
  mother: Monster
): [AbilitySlot, RngState] {
  const { inheritChance, inheritHiddenChance } = data.config.abilities
  let kept: boolean
  if (mother.abilitySlot === 'hidden') {
    ;[kept, rng] = rollPercent(rng, inheritHiddenChance)
    return kept ? ['hidden', rng] : rollNormalSlot(rng)
  }
  ;[kept, rng] = rollPercent(rng, inheritChance)
  const other: AbilitySlot = mother.abilitySlot === 'first' ? 'second' : 'first'
  return [kept ? mother.abilitySlot : other, rng]
}
