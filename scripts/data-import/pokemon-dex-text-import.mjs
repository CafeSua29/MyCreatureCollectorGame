/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập phân loại ("Seed Pokémon") và mô tả Pokédex của Pokémon từ PokeAPI vào
// src/data/i18n/<ngôn ngữ>/speciesInfo/{category,flavor}.json (trang Bộ sưu tập, docs/rules/dex.md).
// Chạy lại được: node scripts/data-import/pokemon-dex-text-import.mjs (cần mạng). Mô tả lấy bản của
// phiên bản game mới nhất có chữ. Chỉ ghi loài gốc (dạng `formOf` dùng chữ của loài gốc lúc tra).
// PokeAPI không có tiếng Việt: chỉ ghi tiếng Anh (ngôn ngữ khác tra theo thứ tự dự phòng).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fetchPokeApiCsv, isPokemonSpecies, pokemonMatcher } from './pokeapi.mjs'

const SPECIES_PATH = new URL('../../src/data/species.json', import.meta.url)
const I18N = new URL('../../src/data/i18n/', import.meta.url)
/** Mã ngôn ngữ của game → language_id của PokeAPI. */
const LANGUAGES = { en: '9' }

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf8'))
const match = pokemonMatcher(await fetchPokeApiCsv('pokemon'))
const names = await fetchPokeApiCsv('pokemon_species_names')
const flavors = await fetchPokeApiCsv('pokemon_species_flavor_text')

// Bỏ ký tự ngắt trang / xuống dòng / gạch nối mềm (U+00AD) của bản in game gốc.
const clean = (text) =>
  text
    .replace(/[\f\n\r­]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const speciesIdOf = new Map()
for (const s of species.filter(isPokemonSpecies)) {
  if (s.formOf) continue
  const row = match(s.id)
  if (row) speciesIdOf.set(s.id, row.species_id)
}

for (const [code, languageId] of Object.entries(LANGUAGES)) {
  const genus = new Map(
    names
      .filter((row) => row.local_language_id === languageId && row.genus)
      .map((row) => [row.pokemon_species_id, clean(row.genus)])
  )
  const latest = new Map()
  for (const row of flavors) {
    if (row.language_id !== languageId || !row.flavor_text) continue
    const current = latest.get(row.species_id)
    if (!current || Number(row.version_id) > Number(current.version_id))
      latest.set(row.species_id, row)
  }
  const category = {}
  const flavor = {}
  for (const [id, pokeId] of speciesIdOf) {
    if (genus.has(pokeId)) category[id] = genus.get(pokeId)
    if (latest.has(pokeId)) flavor[id] = clean(latest.get(pokeId).flavor_text)
  }
  const dir = new URL(`${code}/speciesInfo/`, I18N)
  mkdirSync(dir, { recursive: true })
  writeFileSync(new URL('category.json', dir), `${JSON.stringify(category, null, 2)}\n`)
  writeFileSync(new URL('flavor.json', dir), `${JSON.stringify(flavor, null, 2)}\n`)
  console.log(
    `${code}: phân loại ${Object.keys(category).length}, mô tả ${Object.keys(flavor).length} / ${speciesIdOf.size} loài`
  )
}

// Phân loại tiếng Việt: PokeAPI không có, dịch theo bảng pokemon-category-vi.json ("Seed Pokémon" →
// "Pokémon Hạt Giống"; chủ project duyệt 2026-10-25). Mô tả tiếng Việt chưa có (dự phòng tiếng Anh).
const VI_TERMS = JSON.parse(
  readFileSync(new URL('./pokemon-category-vi.json', import.meta.url), 'utf8')
)
const enCategory = JSON.parse(readFileSync(new URL('en/speciesInfo/category.json', I18N), 'utf8'))
const viCategory = {}
const untranslated = new Set()
for (const [id, text] of Object.entries(enCategory)) {
  const term = text.replace(/ Pokémon$/, '')
  if (VI_TERMS[term]) viCategory[id] = `Pokémon ${VI_TERMS[term]}`
  else untranslated.add(term)
}
const viDir = new URL('vi/speciesInfo/', I18N)
mkdirSync(viDir, { recursive: true })
writeFileSync(new URL('category.json', viDir), `${JSON.stringify(viCategory, null, 2)}\n`)
console.log(
  `vi: phân loại ${Object.keys(viCategory).length}; chưa dịch ${untranslated.size}: ${[...untranslated].join(', ')}`
)
