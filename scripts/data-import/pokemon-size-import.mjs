// Nhập chiều cao / cân nặng thật của Pokémon từ PokeAPI (bảng pokemon.csv) vào src/data/species.json
// (`heightM`, `weightKg`; mục "Cân nặng" ở docs/rules/battle.md). Chạy lại được: node
// scripts/data-import/pokemon-size-import.mjs (cần mạng). Loài Pokémon = loài không có origin / source.
// Khớp id theo pokemonMatcher (pokeapi.mjs); dạng không có trong bảng lấy theo loài gốc (formOf).

import { readFileSync, writeFileSync } from 'node:fs'
import { fetchPokeApiCsv, isPokemonSpecies, pokemonMatcher } from './pokeapi.mjs'

const SPECIES_PATH = new URL('../../src/data/species.json', import.meta.url)

const match = pokemonMatcher(await fetchPokeApiCsv('pokemon'))

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf8'))
const pokemon = species.filter(isPokemonSpecies)
const sizes = new Map()
for (const s of pokemon) {
  const row = match(s.id)
  if (row) sizes.set(s.id, { heightM: Number(row.height) / 10, weightKg: Number(row.weight) / 10 })
}
for (const s of pokemon) {
  if (!sizes.has(s.id) && s.formOf && sizes.has(s.formOf)) sizes.set(s.id, sizes.get(s.formOf))
}
for (const s of species) {
  const size = sizes.get(s.id)
  if (!size) continue
  if (size.heightM > 0) s.heightM = size.heightM
  if (size.weightKg > 0) s.weightKg = size.weightKg
}
writeFileSync(SPECIES_PATH, `${JSON.stringify(species, null, 2)}\n`)
const missing = pokemon.filter((s) => !sizes.has(s.id)).map((s) => s.id)
console.log(`Đã ghi ${sizes.size} loài; không khớp ${missing.length}: ${missing.join(', ')}`)
