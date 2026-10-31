// Nhập điểm nỗ lực thật (EV yield) của Pokémon từ PokeAPI (bảng pokemon_stats.csv, cột `effort`)
// vào src/data/species.json (`effortYield`; docs/rules/effort-values.md). Chạy lại được: node
// scripts/data-import/pokemon-effort-import.mjs (cần mạng). Loài Pokémon = loài không có origin /
// source. Khớp id theo pokemonMatcher (pokeapi.mjs); dạng không có trong bảng lấy theo loài gốc
// (formOf). Loài không khớp giữ trống: game suy từ chỉ số gốc (config.effort.derivedYield).

import { readFileSync, writeFileSync } from 'node:fs'
import { fetchPokeApiCsv, isPokemonSpecies, pokemonMatcher } from './pokeapi.mjs'

const SPECIES_PATH = new URL('../../src/data/species.json', import.meta.url)

/** stat_id của PokeAPI → tên chỉ số của game. */
const STAT_BY_ID = {
  1: 'hp',
  2: 'attack',
  3: 'defense',
  4: 'spAttack',
  5: 'spDefense',
  6: 'speed'
}

const [pokemonRows, statRows] = await Promise.all([
  fetchPokeApiCsv('pokemon'),
  fetchPokeApiCsv('pokemon_stats')
])
const match = pokemonMatcher(pokemonRows)

/** id pokemon của PokeAPI → { chỉ số: điểm } (bỏ chỉ số 0 điểm). */
const yieldsByPokemonId = new Map()
for (const row of statRows) {
  const effort = Number(row.effort)
  const stat = STAT_BY_ID[row.stat_id]
  if (!stat || !(effort > 0)) continue
  const yields = yieldsByPokemonId.get(row.pokemon_id) ?? {}
  yields[stat] = effort
  yieldsByPokemonId.set(row.pokemon_id, yields)
}

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf8'))
const pokemon = species.filter(isPokemonSpecies)
const found = new Map()
for (const s of pokemon) {
  const row = match(s.id)
  const yields = row && yieldsByPokemonId.get(row.id)
  if (yields) found.set(s.id, yields)
}
for (const s of pokemon) {
  if (!found.has(s.id) && s.formOf && found.has(s.formOf)) found.set(s.id, found.get(s.formOf))
}
for (const s of species) {
  const yields = found.get(s.id)
  if (yields) s.effortYield = { ...yields }
}
writeFileSync(SPECIES_PATH, `${JSON.stringify(species, null, 2)}\n`)
const missing = pokemon.filter((s) => !found.has(s.id)).map((s) => s.id)
console.log(`Đã ghi ${found.size} loài; không khớp ${missing.length}: ${missing.join(', ')}`)
