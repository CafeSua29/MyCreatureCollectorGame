// Nhập nhóm tăng trưởng EXP thật của Pokémon từ PokeAPI (pokemon_species.csv, cột growth_rate_id)
// vào src/data/species.json (`growthRate`; docs/rules/growth-rates.md). Chạy lại được: node
// scripts/data-import/pokemon-growth-import.mjs (cần mạng). Loài Pokémon = loài không có origin /
// source. Khớp id theo pokemonMatcher (pokeapi.mjs), lấy nhóm của loài (species_id); dạng không khớp
// lấy theo loài gốc (formOf). Medium Fast là mặc định nên không ghi.

import { readFileSync, writeFileSync } from 'node:fs'
import { fetchPokeApiCsv, isPokemonSpecies, pokemonMatcher } from './pokeapi.mjs'

const SPECIES_PATH = new URL('../../src/data/species.json', import.meta.url)

/** growth_rate_id của PokeAPI → nhóm của game (PokeAPI: slow-then-very-fast = Erratic...). */
const RATE_BY_ID = {
  1: 'slow',
  2: 'mediumFast',
  3: 'fast',
  4: 'mediumSlow',
  5: 'erratic',
  6: 'fluctuating'
}
const DEFAULT_RATE = 'mediumFast'

const [pokemonRows, speciesRows] = await Promise.all([
  fetchPokeApiCsv('pokemon'),
  fetchPokeApiCsv('pokemon_species')
])
const match = pokemonMatcher(pokemonRows)
const rateBySpeciesId = new Map(speciesRows.map((row) => [row.id, RATE_BY_ID[row.growth_rate_id]]))

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf8'))
const pokemon = species.filter(isPokemonSpecies)
const found = new Map()
for (const s of pokemon) {
  const rate = rateBySpeciesId.get(match(s.id)?.species_id ?? '')
  if (rate) found.set(s.id, rate)
}
for (const s of pokemon) {
  if (!found.has(s.id) && s.formOf && found.has(s.formOf)) found.set(s.id, found.get(s.formOf))
}
const counts = {}
for (const s of species) {
  const rate = found.get(s.id)
  if (!rate) continue
  counts[rate] = (counts[rate] ?? 0) + 1
  if (rate === DEFAULT_RATE) delete s.growthRate
  else s.growthRate = rate
}
writeFileSync(SPECIES_PATH, `${JSON.stringify(species, null, 2)}\n`)
const missing = pokemon.filter((s) => !found.has(s.id)).map((s) => s.id)
console.log(
  `Đã ghi ${found.size} loài ${JSON.stringify(counts)}; không khớp ${missing.length}: ${missing.join(', ')}`
)
