// Biến thể Bootleg (docs/rules/bootleg.md, Bootleg của Cassette Beasts): quái mang đúng một hệ khác hệ
// thường của loài, giữ qua tiến hóa, thưởng EXP / tiền cao hơn. Điểm duy nhất trả hệ theo loài cho
// một quái (`speciesElementsFor`) và tung Bootleg (`rollBootleg`).

import { pick, rollPercent, toBig, type Decimal, type RngState } from '../shared'
import type { GameData, Monster, NormalSpecies } from '../model'

/** Hệ của quái theo loài: Bootleg thì đúng một hệ Bootleg, không thì hệ của loài. */
export function speciesElementsFor(
  species: Pick<NormalSpecies, 'elementIds'>,
  monster: Pick<Monster, 'bootlegElementId'>
): string[] {
  return monster.bootlegElementId === null ? [...species.elementIds] : [monster.bootlegElementId]
}

/** Hệ Bootleg có thể của loài: mọi hệ của game trừ hệ thường của loài. */
export const bootlegElementChoices = (
  data: GameData,
  species: Pick<NormalSpecies, 'elementIds'>
): string[] => Object.keys(data.elements).filter((id) => !species.elementIds.includes(id))

/**
 * Tung Bootleg: `chance` % ra Bootleg, hệ tung đều trong `bootlegElementChoices`. Tỉ lệ 0 không tốn
 * RNG; loài không còn hệ nào khác thì không Bootleg.
 */
export function rollBootleg(
  data: GameData,
  rng: RngState,
  { species, chance }: { species: Pick<NormalSpecies, 'elementIds'>; chance: number }
): [string | null, RngState] {
  const choices = bootlegElementChoices(data, species)
  if (choices.length === 0) return [null, rng]
  const [hit, afterRoll] = rollPercent(rng, chance)
  if (!hit) return [null, afterRoll]
  return pick(afterRoll, choices)
}

/** Quái thành Bootleg hệ `elementId` (null = giữ nguyên quái). */
export function withBootleg(monster: Monster, elementId: string | null): Monster {
  if (elementId === null) return monster
  return { ...monster, bootlegElementId: elementId, elementIds: [elementId] }
}

/** Hệ số thưởng EXP / tiền của quái địch Bootleg (1 nếu không Bootleg). */
export const bootlegRewardFactor = (data: GameData, monster: Monster): Decimal =>
  toBig(monster.bootlegElementId === null ? 1 : data.config.bootleg.rewardMultiplier)
