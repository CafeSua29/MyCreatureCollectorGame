/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Sinh src/data/biomes.json + tên src/data/i18n/{vi,en}/biomes.json + báo cáo
// scripts/data-import/biomes-report.json từ scripts/data-import/biomes-source.json.
// Chạy: node scripts/data-import/biomes-import.mjs (Node thuần, chạy lại an toàn: kết quả tất định).
// Biome làm tay (map `existing`: meadow, volcano; bản gốc ở trường `base` của file nguồn, script
// không đọc lại biomes.json): giữ loài, boss tầng, đồ rơi; thêm loài và boss ngẫu nhiên theo cùng
// luật với map mới. Luật ở biomeAssign.mjs; cờ câu cá / khai thác ở gathering.mjs; danh sách trang bị
// rơi ở equipmentDrops.mjs (tính từ items.json hiện tại).

import fs from 'node:fs'
import path from 'node:path'
import {
  assignSpecies,
  averageWildTotal,
  BOSS_STAT_RATIO,
  bossCandidates,
  bossFieldOf,
  encounterWeight,
  fieldEntries,
  mapBossDrops,
  mapChances,
  mapDrops,
  mapElements,
  pickBosses,
  RANDOM_BOSSES_PER_MAP,
  wildCandidates
} from './biomeAssign.mjs'
import { withGathering } from './gathering.mjs'
import { equipmentDropLookup, withEquipmentDrops } from './equipmentDrops.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const writeJson = (file, value) =>
  fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n')

const source = readJson('scripts/data-import/biomes-source.json')
const species = readJson('src/data/species.json')
const balance = readJson('src/data/balance.json')
const tww3 = readJson('scripts/data-import/tww3-source.json')

const byId = new Map(species.map((s) => [s.id, s]))
const factions = {}
for (const [speciesId, list] of Object.entries(tww3.speciesFactions)) {
  if (!byId.has(speciesId)) continue
  for (const faction of list) (factions[faction] ??= new Set()).add(speciesId)
}
const ctx = { themes: source.themes, factions }
const maps = source.maps
const candidates = wildCandidates(species)
const assigned = assignSpecies({ candidates, maps, ctx })
const usedFloorBosses = new Set(
  maps.flatMap((map) => (map.base ? [map.base.floorBossSpeciesId] : []))
)

const report = { maps: [], speciesWithoutMap: [] }
// Cờ câu cá / khai thác theo luật ở gathering.mjs (docs/rules/gathering.md).
const gatheringLookup = {
  byId,
  groupOf: new Map(readJson('src/data/races.json').map((race) => [race.id, race.groupId])),
  config: balance.gathering
}
// Danh sách trang bị rơi theo luật ở equipmentDrops.mjs (thiếu bước này thì sinh lại map làm mất
// đồ rơi trang bị của mọi map).
const dropLookup = equipmentDropLookup({
  species,
  races: readJson('src/data/races.json'),
  items: readJson('src/data/items.json'),
  equipmentSets: readJson('src/data/equipmentSets.json')
})
const biomes = maps.map((map) => {
  const ids = assigned.get(map.id)
  const biome = map.base ? extendExisting(map, map.base, ids) : buildBiome(map, ids)
  return withEquipmentDrops(withGathering(biome, gatheringLookup), dropLookup)
})

/** Map mới: loài, boss, đồ rơi, môi trường theo luật. */
function buildBiome(map, ids) {
  const target = BOSS_STAT_RATIO * averageWildTotal(ids.map(encounterOf), byId)
  const picked = pickBosses(bossCandidates(map, ids, byId, ctx, target), usedFloorBosses)
  if (!picked) throw new Error(`Map "${map.id}" không có ứng viên boss`)
  const bossField = bossFieldOf(map, source.themes)
  const bosses = [
    { speciesId: picked.floorBossSpeciesId, weight: 1, drops: [], ...(bossField && { bossField }) },
    ...picked.randomBossIds.map((speciesId) => ({ speciesId, weight: 1, drops: [] }))
  ]
  const biome = {
    id: map.id,
    ...mapChances(map, balance.boss.chance),
    encounters: ids.map(encounterOf),
    drops: mapDrops(map, mapElements(map, source.themes)),
    bossDrops: mapBossDrops(map),
    floorBossSpeciesId: picked.floorBossSpeciesId,
    bosses,
    weather: fieldEntries(map.weather),
    terrain: fieldEntries(map.terrain),
    elementIds: [...mapElements(map, source.themes)],
    ...deityOf(map)
  }
  addReport(map, biome)
  return biome
}

/** Thần cai quản map theo theme (docs/rules/deities.md; deities-import.mjs ghi vào themes). */
function deityOf(map) {
  const deityId = source.themes[map.theme]?.deityId
  return deityId ? { deityId } : {}
}

/** Biome đã có: giữ nguyên phần cũ, thêm loài mới và boss ngẫu nhiên mới. */
function extendExisting(map, existing, ids) {
  const known = new Set(existing.encounters.map((entry) => entry.speciesId))
  const encounters = [
    ...existing.encounters,
    ...ids.filter((id) => !known.has(id)).map(encounterOf)
  ]
  const bossIds = new Set(existing.bosses.map((boss) => boss.speciesId))
  const target = BOSS_STAT_RATIO * averageWildTotal(encounters, byId)
  const extraBosses = bossCandidates(map, ids, byId, ctx, target)
    .filter((candidate) => !bossIds.has(candidate.id))
    .slice(0, RANDOM_BOSSES_PER_MAP)
    .map((candidate) => ({ speciesId: candidate.id, weight: 1, drops: [] }))
  const biome = {
    ...existing,
    encounters,
    bosses: [...existing.bosses, ...extraBosses],
    elementIds: [...mapElements(map, source.themes)],
    ...deityOf(map)
  }
  addReport(map, biome)
  return biome
}

function encounterOf(speciesId) {
  return { speciesId, weight: encounterWeight(byId.get(speciesId)) }
}

function addReport(map, biome) {
  report.maps.push({
    id: map.id,
    species: biome.encounters.length,
    floorBoss: biome.floorBossSpeciesId,
    randomBosses: biome.bosses
      .filter((b) => b.speciesId !== biome.floorBossSpeciesId)
      .map((b) => b.speciesId),
    doubleChance: biome.doubleChance,
    bossChance: biome.bossChance ?? balance.boss.chance
  })
}

const placed = new Set(biomes.flatMap((biome) => biome.encounters.map((entry) => entry.speciesId)))
report.speciesWithoutMap = candidates.filter((s) => !placed.has(s.id)).map((s) => s.id)
const sizes = report.maps.map((entry) => entry.species).sort((a, b) => a - b)
report.summary = {
  maps: biomes.length,
  wildCandidates: candidates.length,
  placedSpecies: placed.size,
  encounterEntries: sizes.reduce((sum, size) => sum + size, 0),
  speciesPerMap: { min: sizes[0], median: sizes[sizes.length >> 1], max: sizes[sizes.length - 1] }
}

writeJson('src/data/biomes.json', biomes)
for (const [language, nameOf] of [
  ['vi', (map) => map.nameVi ?? map.name],
  ['en', (map) => map.name]
]) {
  const file = `src/data/i18n/${language}/biomes.json`
  const current = readJson(file)
  // Tên đã có (biome cũ) giữ nguyên.
  writeJson(file, Object.fromEntries(maps.map((map) => [map.id, current[map.id] ?? nameOf(map)])))
}
writeJson('scripts/data-import/biomes-report.json', report)
console.log(JSON.stringify(report.summary))
