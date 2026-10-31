/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập giờ hoạt động (`activeTime`, docs/rules/calendar.md) của Pokémon từ bảng gặp theo giờ của
// PokeAPI (encounters + encounter_condition_value_map + encounter_slots). Chạy lại được: node
// scripts/data-import/pokemon-active-time-import.mjs (cần mạng). Báo cáo:
// scripts/data-import/pokemon-active-time-report.json.
// Cách tính: chỉ xét cách gặp (đi bộ trong cỏ...) của phiên bản có gặp theo giờ (Gold / Silver /
// Crystal, Diamond / Pearl / Platinum, HeartGold / SoulSilver: sáng / ngày / đêm); cách gặp không
// đổi theo giờ ở bản đó (húc cây, câu cá, lướt sóng) không tính, vì không cho biết loài ngày / đêm. Mỗi ô gặp cộng độ hiếm của ô vào các giờ nó xuất hiện
// (ô không ghi giờ là cả ba). Ngày = max(sáng, ngày); đêm ≥ 2 × ngày → nocturnal, ngày ≥ 2 × đêm →
// diurnal, còn lại cathemeral (gặp như nhau, ghi rõ để không suy theo race / hệ nữa). Pokémon
// không có dữ liệu (không gặp ngoài tự nhiên ở các bản đó, Gen 5+) lấy theo dạng trước gần nhất có
// dữ liệu, không có thì dạng sau; vẫn không có thì bỏ trống (suy theo race / hệ). Dạng (formOf)
// không phải dạng vùng miền lấy theo loài gốc; dạng vùng miền bỏ trống.

import { readFileSync, writeFileSync } from 'node:fs'
import { fetchPokeApiCsv, isPokemonSpecies, pokemonMatcher } from './pokeapi.mjs'

const SPECIES_PATH = new URL('../../src/data/species.json', import.meta.url)
const REPORT_PATH = new URL('./pokemon-active-time-report.json', import.meta.url)
// encounter_condition_values: time-morning, time-day, time-night.
const TIME_VALUES = { 3: 'morning', 4: 'day', 5: 'night' }
const ALL_TIMES = Object.values(TIME_VALUES)
// Ngưỡng lệch giữa ngày và đêm để coi là loài ngày / đêm (cùng tỉ lệ ×2 với hệ số gặp).
const RATIO = 2

const [pokemonRows, encounters, conditionMap, slots] = await Promise.all([
  fetchPokeApiCsv('pokemon'),
  fetchPokeApiCsv('encounters'),
  fetchPokeApiCsv('encounter_condition_value_map'),
  fetchPokeApiCsv('encounter_slots')
])
const match = pokemonMatcher(pokemonRows)

/** Giờ của từng ô gặp có điều kiện giờ (encounter id → các giờ). */
const timesOf = new Map()
for (const row of conditionMap) {
  const time = TIME_VALUES[row.encounter_condition_value_id]
  if (!time) continue
  if (!timesOf.has(row.encounter_id)) timesOf.set(row.encounter_id, [])
  timesOf.get(row.encounter_id).push(time)
}
const rarityOf = new Map(slots.map((slot) => [slot.id, Number(slot.rarity) || 1]))
const methodOf = new Map(slots.map((slot) => [slot.id, slot.encounter_method_id]))
/** Khóa "phiên bản:cách gặp" của một ô gặp. */
const methodKey = (encounter) =>
  `${encounter.version_id}:${methodOf.get(encounter.encounter_slot_id)}`
const timedMethods = new Set(encounters.filter((e) => timesOf.has(e.id)).map(methodKey))

/** pokemon_id → { morning, day, night } (tổng độ hiếm). */
const totals = new Map()
for (const encounter of encounters) {
  if (!timedMethods.has(methodKey(encounter))) continue
  const sum = totals.get(encounter.pokemon_id) ?? { morning: 0, day: 0, night: 0 }
  const rarity = rarityOf.get(encounter.encounter_slot_id) ?? 1
  for (const time of timesOf.get(encounter.id) ?? ALL_TIMES) sum[time] += rarity
  totals.set(encounter.pokemon_id, sum)
}

/** Giờ hoạt động theo tổng độ hiếm sáng / ngày / đêm. */
function classify({ morning, day, night }) {
  const daytime = Math.max(morning, day)
  if (night >= RATIO * daytime) return 'nocturnal'
  if (daytime >= RATIO * night) return 'diurnal'
  return 'cathemeral'
}

const species = JSON.parse(readFileSync(SPECIES_PATH, 'utf8'))
const byId = new Map(species.map((s) => [s.id, s]))
const pokemon = species.filter(isPokemonSpecies)
const report = { direct: {}, inherited: {}, missing: [] }
const found = new Map()
for (const s of pokemon) {
  if (s.formOf && s.formKind === 'regional') continue
  const row = s.formOf ? null : match(s.id)
  const sum = row && totals.get(row.id)
  if (!sum) continue
  found.set(s.id, classify(sum))
  report.direct[s.id] = { activeTime: found.get(s.id), ...sum }
}

// Dạng trước / dạng sau trong cùng dòng tiến hóa (chỉ loài Pokémon).
const prevo = new Map()
for (const s of pokemon) for (const e of s.evolutions ?? []) prevo.set(e.speciesId, s.id)
const nearestPrevo = (id) => {
  for (let at = prevo.get(id); at; at = prevo.get(at)) if (found.has(at)) return at
  return null
}
const nearestEvo = (id) => {
  const queue = [...(byId.get(id)?.evolutions ?? []).map((e) => e.speciesId)]
  for (let i = 0; i < queue.length; i++) {
    if (found.has(queue[i])) return queue[i]
    queue.push(...(byId.get(queue[i])?.evolutions ?? []).map((e) => e.speciesId))
  }
  return null
}
const inherited = new Map()
for (const s of pokemon) {
  if (found.has(s.id) || (s.formOf && s.formKind === 'regional')) continue
  const from = s.formOf && found.has(s.formOf) ? s.formOf : (nearestPrevo(s.id) ?? nearestEvo(s.id))
  if (from) inherited.set(s.id, from)
  else report.missing.push(s.id)
}
// Dạng vùng miền sống ở vùng khác (PokeAPI không có bảng gặp theo giờ của Alola / Galar /
// Hisui / Paldea): không lấy theo loài gốc, bỏ trống (suy theo race / hệ).
for (const s of pokemon) if (s.formOf && s.formKind === 'regional') report.missing.push(s.id)

for (const s of species) {
  const activeTime = found.get(s.id) ?? found.get(inherited.get(s.id))
  if (!activeTime) continue
  s.activeTime = activeTime
  if (inherited.has(s.id)) report.inherited[s.id] = { activeTime, from: inherited.get(s.id) }
}
writeFileSync(SPECIES_PATH, `${JSON.stringify(species, null, 2)}\n`)
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
const count = (list) =>
  Object.values(list).reduce(
    (acc, { activeTime }) => ({ ...acc, [activeTime]: (acc[activeTime] ?? 0) + 1 }),
    {}
  )
console.log('trực tiếp', count(report.direct), 'theo dòng tiến hóa', count(report.inherited))
console.log(`không có dữ liệu: ${report.missing.length}`)
