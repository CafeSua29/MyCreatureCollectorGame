// Giới tính theo loài (mục "Loài không giới tính" trong docs/rules/world-items.md): loài có
// `genderless: true` thì quái có gender 'none'; loài có giới tính thì đực / cái 50/50.

import { pick, type RngState } from '../shared'
import { SEXED_GENDERS, type GameData, type Gender, type Monster } from '../model'

/** Loài không giới tính (loài thường có `genderless: true`). */
export function isGenderlessSpecies(data: GameData, speciesId: string): boolean {
  const species = data.species[speciesId]
  return species?.kind === 'normal' && species.genderless === true
}

/** Tung giới tính cho quái mới của loài này; loài không giới tính không tốn RNG. */
export function rollGender(data: GameData, rng: RngState, speciesId: string): [Gender, RngState] {
  if (isGenderlessSpecies(data, speciesId)) return ['none', rng]
  return pick(rng, SEXED_GENDERS)
}

/**
 * Giới tính sau khi tiến hóa thành loài toSpeciesId: thành loài không giới tính thì 'none';
 * từ không giới tính thành có giới tính thì tung 50/50; còn lại giữ nguyên (không tốn RNG).
 */
export function genderAfterEvolution(
  data: GameData,
  rng: RngState,
  monster: Monster,
  toSpeciesId: string
): [Gender, RngState] {
  if (isGenderlessSpecies(data, toSpeciesId)) return ['none', rng]
  if (monster.gender === 'none') return pick(rng, SEXED_GENDERS)
  return [monster.gender, rng]
}
