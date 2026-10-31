/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập ability thật của Pokémon vào src/data/species.json (`abilities`, `hiddenAbility`;
// docs/rules/abilities.md). Chạy lại được: node scripts/data-import/pokemon-abilities-import.mjs (cần
// mạng). Loài Pokémon = loài không có origin / source. Nguồn: pokedex của Pokémon Showdown khi có
// đúng dạng cùng tên (mới nhất, đủ dạng Mega Z-A / Ogerpon Tera / Totem); không có thì PokeAPI
// (pokemon_abilities.csv, khớp id theo pokemonMatcher của pokeapi.mjs); dạng không khớp lấy theo
// loài gốc (formOf). Ability đặc biệt "S" của Showdown (Power Construct của Zygarde) thành ability ẩn
// khi loài không có ability ẩn.
// Ability là id trait camelCase theo tên PokeAPI; ability chưa có trong traits.json thì bỏ (ghi vào
// pokemon-abilities-report.json để làm dần, docs/rules/abilities.md), chạy lại sau khi thêm.

import { readFileSync, writeFileSync } from 'node:fs'
import { fetchPokeApiCsv, isPokemonSpecies, pokemonMatcher } from './pokeapi.mjs'
import { fetchShowdown, showdownId } from './showdown.mjs'

const SPECIES_PATH = new URL('../../src/data/species.json', import.meta.url)
const TRAITS_PATH = new URL('../../src/data/traits.json', import.meta.url)
const REPORT_PATH = new URL('./pokemon-abilities-report.json', import.meta.url)

/** "speed-boost" → "speedBoost". */
const camel = (identifier) =>
  identifier
    .split('-')
    .map((word, i) => (i === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join('')

const [pokemonRows, abilityRows, pokemonAbilityRows, showdownDex] = await Promise.all([
  fetchPokeApiCsv('pokemon'),
  fetchPokeApiCsv('abilities'),
  fetchPokeApiCsv('pokemon_abilities'),
  fetchShowdown('pokedex.js')
])
const match = pokemonMatcher(pokemonRows)
// Ability trùng id trait race khác nghĩa: dùng trait riêng (pokemon-ability-traits.mjs `pokeapiId`).
const ABILITY_ALIASES = {
  telepathy: 'telepathyAbility',
  mimicry: 'mimicryAbility',
  stamina: 'staminaAbility',
  schooling: 'schoolingAbility',
  corrosion: 'corrosionAbility',
  gluttony: 'gluttonyAbility',
  disguise: 'disguiseAbility'
}
const abilityIdOf = new Map(
  abilityRows.map((row) => {
    const id = camel(row.identifier)
    return [row.id, ABILITY_ALIASES[id] ?? id]
  })
)
const traitIds = new Set(JSON.parse(readFileSync(TRAITS_PATH, 'utf8')).map((trait) => trait.id))

/** id pokemon của PokeAPI → { normal: id ability theo thứ tự ô, hidden }. */
const byPokemon = new Map()
for (const row of [...pokemonAbilityRows].sort((a, b) => Number(a.slot) - Number(b.slot))) {
  const entry = byPokemon.get(row.pokemon_id) ?? { normal: [], hidden: null }
  const abilityId = abilityIdOf.get(row.ability_id)
  if (row.is_hidden === '1') entry.hidden = abilityId
  else entry.normal.push(abilityId)
  byPokemon.set(row.pokemon_id, entry)
}

/** Tên ability Showdown → id trait (như id PokeAPI: "RKS System" → rks-system → rksSystem). */
const showdownAbilityId = (name) => {
  const id = camel(
    name
      .replace(/['’]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  )
  return ABILITY_ALIASES[id] ?? id
}
/** Dạng Showdown theo id chữ thường của tên ("Ogerpon-Teal-Tera" → ogerpontealtera). */
const showdownByName = new Map()
for (const entry of Object.values(showdownDex)) {
  if (!entry?.name || !entry.abilities || entry.num <= 0) continue
  const { 0: first, 1: second, H: hidden, S: special } = entry.abilities
  showdownByName.set(showdownId(entry.name), {
    normal: [first, second].filter(Boolean).map(showdownAbilityId),
    hidden: hidden || special ? showdownAbilityId(hidden ?? special) : null
  })
}

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf8'))
const pokemon = species.filter(isPokemonSpecies)
const found = new Map()
// id game khác tên Showdown.
const SHOWDOWN_NAMES = { zygarde10Percent: 'zygarde10' }
for (const s of pokemon) {
  const entry =
    showdownByName.get(SHOWDOWN_NAMES[s.id] ?? showdownId(s.id)) ??
    byPokemon.get(match(s.id)?.id ?? '')
  if (entry) found.set(s.id, entry)
}
for (const s of pokemon) {
  if (!found.has(s.id) && s.formOf && found.has(s.formOf)) found.set(s.id, found.get(s.formOf))
}

const missingAbilities = new Map()
const noteMissing = (abilityId, speciesId) => {
  const list = missingAbilities.get(abilityId) ?? []
  list.push(speciesId)
  missingAbilities.set(abilityId, list)
}
let withAbilities = 0
for (const s of species) {
  const entry = found.get(s.id)
  delete s.abilities
  delete s.hiddenAbility
  if (!entry) continue
  // Ability chưa làm thì bỏ, giữ thứ tự ô của ability đã có (chạy lại khi thêm ability).
  const normal = [...new Set(entry.normal)].filter((id) => {
    if (traitIds.has(id)) return true
    noteMissing(id, s.id)
    return false
  })
  if (normal.length === 0) {
    if (entry.hidden && !traitIds.has(entry.hidden)) noteMissing(entry.hidden, s.id)
    continue
  }
  s.abilities = normal
  withAbilities++
  if (!entry.hidden || normal.includes(entry.hidden)) continue
  if (traitIds.has(entry.hidden)) s.hiddenAbility = entry.hidden
  else noteMissing(entry.hidden, s.id)
}
writeFileSync(SPECIES_PATH, `${JSON.stringify(species, null, 2)}\n`)
const missing = [...missingAbilities.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([abilityId, speciesIds]) => ({ abilityId, species: speciesIds.length }))
writeFileSync(
  REPORT_PATH,
  `${JSON.stringify({ speciesWithAbilities: withAbilities, missingAbilities: missing }, null, 2)}\n`
)
const unmatched = pokemon.filter((s) => !found.has(s.id)).map((s) => s.id)
console.log(
  `Loài có ability: ${withAbilities}; ability chưa có: ${missing.length}; loài không khớp: ${unmatched.length}`
)
