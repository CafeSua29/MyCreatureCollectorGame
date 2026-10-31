/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tách 25 race cũ thành nhóm race (raceGroups.json) + race chi tiết (races.json) và gán lại race cho
// mọi loài (mục "Race" ở docs/rules/stats-traits.md). Chạy: node scripts/data-import/races-split.mjs
// (cần mạng: genus Pokémon từ PokeAPI, race gốc Siralim). Ghi races.json, trait race mới vào
// traits.json, tên race / trait (vi, en), raceId của species.json; in báo cáo vào
// scripts/data-import/races-report.json (loài phải dùng race mặc định để rà).
// Luật chọn race của một chuỗi tiến hóa (mọi loài trong chuỗi chung race):
//   1. race gốc của nguồn (Siralim, lớp quái Monster Hunter) của bất kỳ loài nào trong chuỗi;
//   2. từ khóa (KEYWORDS) trên tên phân loại Pokémon (genus) rồi id của từng loài, dạng đầu trước;
//      ưu tiên race cùng nhóm với race cũ, khác nhóm chỉ khi từ khóa dài ≥ 5 ký tự;
//   3. race mặc định theo nguồn châu Á (SOURCE_FALLBACK), rồi theo race cũ (FALLBACK).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { FALLBACK, GROUP_TRAITS, RACES } from './races-table.mjs'
import { GROUP_EXTRA_TRAITS, RACE_EXTRA_TRAITS } from './races-traits-more.mjs'
import { KEYWORDS, MH, SIRALIM_RACES, SOURCE_FALLBACK } from './races-classify.mjs'
import { DIGIMON_KEYWORDS, DIGIMON_TYPE_RACE, EXTRA_KEYWORDS } from './races-extra.mjs'
import { OVERRIDES as BASE_OVERRIDES } from './races-overrides.mjs'
import { FANTASY_OVERRIDES } from './races-overrides-fantasy.mjs'

const DATA = new URL('../../src/data/', import.meta.url)
const read = (file) => JSON.parse(readFileSync(new URL(file, DATA), 'utf8'))
const write = (file, value) =>
  writeFileSync(new URL(file, DATA), `${JSON.stringify(value, null, 2)}\n`)

async function fetchCsv(url) {
  const text = await (await fetch(url)).text()
  const lines = text.trim().split('\n')
  const header = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(header.map((name, i) => [name, cells[i] ?? '']))
  })
}

function parseCsvLine(line) {
  const cells = []
  let cell = ''
  let quoted = false
  for (const char of line.replace(/\r$/, '')) {
    if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) {
      cells.push(cell)
      cell = ''
    } else cell += char
  }
  cells.push(cell)
  return cells
}

const camelWords = (id) =>
  id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
const toCamel = (name) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')

// ---------- Dữ liệu ----------

const groups = read('raceGroups.json')
const groupIds = new Set(groups.map((g) => g.id))
const species = read('species.json')
const traits = read('traits.json')
// Race cũ (25 race) của từng loài và race cũ: lưu lần chạy đầu để chạy lại ra cùng kết quả.
const LEGACY = new URL('./races-legacy.json', import.meta.url)
if (!existsSync(LEGACY)) {
  const legacySpecies = Object.fromEntries(
    species.filter((s) => s.kind === 'normal').map((s) => [s.id, s.raceId])
  )
  writeFileSync(
    LEGACY,
    `${JSON.stringify({ races: read('races.json'), species: legacySpecies }, null, 2)}
`
  )
}
const legacy = JSON.parse(readFileSync(LEGACY, 'utf8'))
for (const s of species) if (legacy.species[s.id]) s.raceId = legacy.species[s.id]
const raceGroup = new Map(RACES.map(([id, group]) => [id, group]))
const groupOfOld = (oldRace) => (groupIds.has(oldRace) ? oldRace : raceGroup.get(oldRace))

const POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
const [pokemonRows, speciesNames, siralimRows] = await Promise.all([
  fetchCsv(`${POKEAPI}pokemon.csv`),
  fetchCsv(`${POKEAPI}pokemon_species_names.csv`),
  fetchCsv(
    'https://raw.githubusercontent.com/rovermicrover/siralim-ultimate-api/main/app/data/creatures.csv'
  )
])
const genusBySpecies = new Map(
  speciesNames
    .filter((r) => r.local_language_id === '9')
    .map((r) => [r.pokemon_species_id, r.genus])
)
const pokemonSpeciesId = new Map(pokemonRows.map((r) => [r.identifier, r.species_id]))
const pokemonKebab = (id) => id.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase()
function genusOf(s) {
  if (s.origin || s.source) return null
  let key = pokemonKebab(s.id)
  for (;;) {
    const sid = pokemonSpeciesId.get(key)
    if (sid) return genusBySpecies.get(sid) ?? null
    if (!key.includes('-')) return null
    key = key.slice(0, key.lastIndexOf('-'))
  }
}
const siralimRace = new Map(siralimRows.map((r) => [toCamel(r.name), r.race]))

// ---------- Phân loại ----------

// Từ khóa bổ sung (tên riêng, cụ thể hơn) đứng trước từ khóa chung; bỏ mẫu có "-" ở giữa (ghi chú).
const clean = (words) => words.filter((w) => w.startsWith('-') || !w.includes('-'))
// Race chi tiết trùng id nhóm (nhóm giữ id race cũ để tham chiếu cũ giữ nghĩa): đổi id race.
const RENAMED = {
  shapeshifter: 'changeling',
  demon: 'fiend',
  elemental: 'elementalSpirit',
  aberration: 'eldritch'
}

const OVERRIDES = { ...BASE_OVERRIDES, ...FANTASY_OVERRIDES }
const knownIds = new Set(species.map((s) => s.id))
const unknownOverrides = Object.keys(OVERRIDES).filter((id) => !knownIds.has(id))
if (unknownOverrides.length)
  console.warn(`Ghi đè loài không tồn tại: ${unknownOverrides.join(', ')}`)
const raceIdsInTable = new Set(RACES.map(([id]) => RENAMED[id] ?? id))
const badRaces = [...new Set(Object.values(OVERRIDES))].filter(
  (id) => !raceIdsInTable.has(RENAMED[id] ?? id)
)
if (badRaces.length) console.warn(`Ghi đè trỏ race không có: ${badRaces.join(', ')}`)

const keywordTable = [
  ...Object.entries(DIGIMON_KEYWORDS).map(([raceId, words]) => [raceId, clean(words)]),
  ...Object.entries(EXTRA_KEYWORDS).map(([raceId, words]) => [raceId, clean(words)]),
  ...KEYWORDS.map(([raceId, words]) => [raceId, clean(words)])
]
/** Từ của id / genus kèm cặp từ liền nhau ghép lại (seaLion → "sealion") và cả id viết liền. */
const withPairs = (words) => [
  ...words,
  ...words.slice(1).map((w, i) => words[i] + w),
  words.join('')
]

// Khớp chéo nhóm khi từ khóa đủ dài (≥ 5 chữ) hoặc là danh từ chính (từ cuối của tên / genus,
// ví dụ "poisonDartFrog" → frog), vì từ ngắn giữa tên dễ khớp nhầm.
function keywordRace(words, oldGroup, headWords = []) {
  let cross = null
  for (const [raceId, patterns] of keywordTable) {
    for (const p of patterns) {
      const hit = p.startsWith('-')
        ? words.find((w) => w.endsWith(p.slice(1)))
        : words.includes(p) && p
      if (!hit) continue
      if (raceGroup.get(raceId) === oldGroup) return raceId
      if (!cross && (String(hit).length >= 5 || headWords.includes(hit))) cross = raceId
    }
  }
  return cross
}

// Type chính thức của Digimon (digimon-types-fetch.mjs): khớp từ khóa trên chữ của type.
const DIGIMON_TYPES = new URL('./digimon-types.json', import.meta.url)
const digimonTypes = existsSync(DIGIMON_TYPES)
  ? JSON.parse(readFileSync(DIGIMON_TYPES, 'utf8'))
  : {}
function digimonRace(s, oldGroup) {
  for (const type of digimonTypes[s.id] ?? []) {
    if (DIGIMON_TYPE_RACE[type]) return DIGIMON_TYPE_RACE[type]
    const race = keywordRace(withPairs(camelWords(type)), oldGroup)
    if (race) return race
  }
  return null
}

function sourceRace(s) {
  if (OVERRIDES[s.id]) return OVERRIDES[s.id]
  if (s.source === 'digimon') {
    const race = digimonRace(s, groupOfOld(s.raceId))
    if (race) return race
  }
  if (s.source === 'siralim') {
    const race = siralimRace.get(s.id) ?? siralimRace.get(s.id.replace(/Siralim$/, ''))
    if (race && SIRALIM_RACES[race]) return SIRALIM_RACES[race]
  }
  if (s.source === 'monsterHunter' && MH[s.id]) return MH[s.id]
  return null
}

function fallbackRace(s) {
  const bySource = SOURCE_FALLBACK[s.source]?.[s.raceId]
  if (bySource) return bySource
  if (s.origin === 'extinct' && s.raceId === 'beast') return 'megafauna'
  if (s.origin === 'extinct' && s.raceId === 'dinosaur') return 'theropod'
  if (s.origin === 'myth' && s.raceId === 'beast') return 'mythicBeast'
  if (s.origin === 'myth' && s.raceId === 'avian') return 'mythicBird'
  if (s.origin === 'scifi' && ['humanoid', 'aberration'].includes(s.raceId)) return 'alienRace'
  return FALLBACK[s.raceId] ?? 'wildBeast'
}

// Chuỗi tiến hóa (kèm dạng formOf): mọi loài liên thông chung một race.
const parent = new Map(species.map((s) => [s.id, s.id]))
const find = (id) =>
  parent.get(id) === id ? id : (parent.set(id, find(parent.get(id))), parent.get(id))
const union = (a, b) => {
  if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b))
}
for (const s of species) {
  if (s.kind !== 'normal') continue
  for (const evo of s.evolutions ?? []) union(s.id, evo.speciesId)
  if (s.formOf) union(s.id, s.formOf)
  for (const evo of s.evolutions ?? []) if (evo.mutation) union(s.id, evo.mutation.speciesId)
}
const depth = new Map()
for (const s of species)
  for (const evo of s.evolutions ?? []) depth.set(evo.speciesId, (depth.get(s.id) ?? 0) + 1)
const chains = new Map()
for (const s of species) {
  if (s.kind !== 'normal') continue
  const root = find(s.id)
  if (!chains.has(root)) chains.set(root, [])
  chains.get(root).push(s)
}

const assigned = new Map()
const report = { bySource: {}, byKeyword: 0, byFallback: [], perRace: {} }
for (const members of chains.values()) {
  members.sort(
    (a, b) =>
      (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) || (a.formOf ? 1 : 0) - (b.formOf ? 1 : 0)
  )
  const root = members[0]
  const oldGroup = groupOfOld(root.raceId)
  let raceId =
    members.map((s) => OVERRIDES[s.id]).find(Boolean) ??
    members.map(sourceRace).find(Boolean) ??
    null
  let how = raceId ? 'source' : null
  if (!raceId) {
    for (const s of members) {
      const genus = genusOf(s)
      const genusWords = genus ? camelWords(genus.replace(/Pokémon/g, '')) : []
      const idWords = camelWords(s.id)
      const words = [...withPairs(genusWords), ...withPairs(idWords)]
      raceId = keywordRace(words, oldGroup, [genusWords.at(-1), idWords.at(-1)])
      if (raceId) break
    }
    if (raceId) how = 'keyword'
  }
  if (!raceId) {
    raceId = fallbackRace(root)
    how = 'fallback'
    report.byFallback.push(
      `${root.id} (${root.source ?? root.origin ?? 'pokemon'}, ${root.raceId}) → ${raceId}`
    )
  }
  if (how === 'keyword') report.byKeyword += members.length
  if (how === 'source')
    report.bySource[root.source] = (report.bySource[root.source] ?? 0) + members.length
  for (const s of members) assigned.set(s.id, RENAMED[raceId] ?? raceId)
}

// ---------- Ghi dữ liệu ----------

const groupById = new Map(groups.map((g) => [g.id, g]))
// Trait có sẵn trước khi tách (trait thường + trait race cũ, nay là trait nhóm): id trait mới trùng
// thì thêm tiền tố race / nhóm.
const oldTraitIds = new Set([
  ...traits.filter((t) => t.kind !== 'race').map((t) => t.id),
  ...legacy.races.flatMap((r) => r.traitIds ?? [])
])
const traitId = (raceId, id) =>
  oldTraitIds.has(id) ? `${raceId}${id[0].toUpperCase()}${id.slice(1)}` : id
const round = (n) => Math.round(n * 100) / 100
/**
 * Lệch chỉ số của race = lệch của nhóm × dáng chỉ số của race theo sinh vật / tác phẩm gốc (chủ project
 * chốt 2026-10-26: giống gốc nhất, không ép cân bằng giữa các race; rùa chậm, khổng lồ khỏe hơn tiểu nhân).
 */
function raceStatBias(groupBias, shape) {
  return Object.fromEntries(
    Object.entries(groupBias).map(([stat, value]) => [stat, round(value * (shape[stat] ?? 1))])
  )
}

const newTraits = []
const traitNames = { vi: {}, en: {} }
const raceNames = { vi: {}, en: {} }
// Id trait mới trùng trait có sẵn hoặc trait mới khác (hai race cùng đặt một id): thêm tiền tố.
const takenIds = new Set()
const finalTraitId = (ownerId, tid) => {
  let id = traitId(ownerId, tid)
  if (takenIds.has(id)) id = `${ownerId}${tid[0].toUpperCase()}${tid.slice(1)}`
  takenIds.add(id)
  return id
}
/** Trait chung của nhóm: [nhóm, id cuối, tên vi, tên en, hook]. */
const groupDefs = [
  ...GROUP_TRAITS.map((def) => ['alien', ...def]),
  ...Object.entries(GROUP_EXTRA_TRAITS).flatMap(([groupId, defs]) =>
    defs.map((def) => [groupId, ...def])
  )
].map(([groupId, tid, ...rest]) => [groupId, finalTraitId(groupId, tid), ...rest])
/** Trait riêng của race (bảng chính rồi trait bổ sung ở races-traits-more.mjs), id cuối. */
const raceDefs = new Map(
  RACES.map(([rawId, , , , , , defs]) => {
    const id = RENAMED[rawId] ?? rawId
    const all = [...defs, ...(RACE_EXTRA_TRAITS[id] ? [RACE_EXTRA_TRAITS[id]] : [])]
    return [id, all.map(([tid, ...rest]) => [finalTraitId(id, tid), ...rest])]
  })
)
const generatedIds = new Set(takenIds)
// Tên trait mới trùng tên trait đã có (hoặc trait mới trước đó): thêm tên race trong ngoặc để
// người chơi phân biệt (kiểm tra dữ liệu cấm hai trait trùng tên).
const usedNames = Object.fromEntries(
  ['vi', 'en'].map((lang) => {
    const text = JSON.parse(readFileSync(new URL(`i18n/${lang}/traits.json`, DATA), 'utf8'))
    const names = Object.entries(text).filter(([id]) => !generatedIds.has(id))
    return [lang, new Set(names.map(([, name]) => name))]
  })
)
const uniqueName = (lang, name, raceName) => {
  const finalName = usedNames[lang].has(name) ? `${name} (${raceName})` : name
  usedNames[lang].add(finalName)
  return finalName
}
const groupNames = Object.fromEntries(
  ['vi', 'en'].map((lang) => [
    lang,
    JSON.parse(readFileSync(new URL(`i18n/${lang}/raceGroups.json`, DATA), 'utf8'))
  ])
)
for (const [groupId, tid, tvi, ten, hook] of groupDefs) {
  newTraits.push({ id: tid, kind: 'race', hooks: [hook] })
  traitNames.vi[tid] = uniqueName('vi', tvi, groupNames.vi[groupId])
  traitNames.en[tid] = uniqueName('en', ten, groupNames.en[groupId])
}
// Trait nhóm = trait race cũ cùng id (nay là nhóm) rồi trait nhóm mới.
for (const group of groups) {
  const old = legacy.races.find((r) => r.id === group.id)
  group.traitIds = [
    ...(old?.traitIds ?? []),
    ...groupDefs.filter(([groupId]) => groupId === group.id).map(([, tid]) => tid)
  ]
}
const races = RACES.map(([rawId, groupId, vi, en, kg, bias, , kept = []]) => {
  const id = RENAMED[rawId] ?? rawId
  const group = groupById.get(groupId)
  const ids = raceDefs.get(id).map(([finalId, tvi, ten, hook]) => {
    newTraits.push({ id: finalId, kind: 'race', hooks: [hook] })
    traitNames.vi[finalId] = uniqueName('vi', tvi, vi)
    traitNames.en[finalId] = uniqueName('en', ten, en)
    return finalId
  })
  raceNames.vi[id] = vi
  raceNames.en[id] = en
  return {
    id,
    groupId,
    statBias: raceStatBias(group.statBias, bias),
    traitIds: [...ids, ...kept],
    weightKg: kg
  }
})
// Trait đặc thù của race cũ chuyển sang race chi tiết; giữ trường cũ (partnerSkillId, frenzyProne).
for (const race of races) {
  const old = legacy.races.find((r) => (RENAMED[r.id] ?? r.id) === race.id)
  if (!old) continue
  race.partnerSkillId = old.partnerSkillId
  if (old.frenzyProne) race.frenzyProne = true
}

const newIds = new Set(newTraits.map((t) => t.id))
// Trait race không còn race / nhóm nào dùng (bản chạy trước đặt id khác) thì bỏ, kể cả chữ.
const usedRaceTraits = new Set([...races, ...groups].flatMap((entry) => entry.traitIds))
const isStale = (t) => t.kind === 'race' && !newIds.has(t.id) && !usedRaceTraits.has(t.id)
const droppedTraits = new Set(traits.filter(isStale).map((t) => t.id))
const withoutDropped = (text) =>
  Object.fromEntries(Object.entries(text).filter(([id]) => !droppedTraits.has(id)))
write('traits.json', [...traits.filter((t) => !newIds.has(t.id) && !isStale(t)), ...newTraits])
write('races.json', races)
write('raceGroups.json', groups)
for (const s of species) {
  if (s.kind === 'normal' && assigned.has(s.id)) s.raceId = assigned.get(s.id)
}
write('species.json', species)
for (const lang of ['vi', 'en']) {
  const traitText = JSON.parse(readFileSync(new URL(`i18n/${lang}/traits.json`, DATA), 'utf8'))
  writeFileSync(
    new URL(`i18n/${lang}/traits.json`, DATA),
    `${JSON.stringify(withoutDropped({ ...traitText, ...traitNames[lang] }), null, 2)}\n`
  )
  writeFileSync(
    new URL(`i18n/${lang}/races.json`, DATA),
    `${JSON.stringify(raceNames[lang], null, 2)}\n`
  )
}

for (const raceId of assigned.values()) report.perRace[raceId] = (report.perRace[raceId] ?? 0) + 1
report.perRace = Object.fromEntries(Object.entries(report.perRace).sort((a, b) => b[1] - a[1]))
writeFileSync(
  new URL('./races-report.json', import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`
)
console.log(`Race: ${races.length}, trait mới: ${newTraits.length}, loài: ${assigned.size}`)
console.log(
  `Theo nguồn: ${JSON.stringify(report.bySource)}; theo từ khóa: ${report.byKeyword}; mặc định: ${report.byFallback.length} chuỗi`
)
