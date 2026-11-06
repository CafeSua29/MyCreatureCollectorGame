/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải quái Beastmancer từ guide cộng đồng "Bestiary of the Dawn and Dusk Islands" trên Steam (game
// không có wiki; guide liệt kê quái thường / hiếm / huyền thoại, mỗi mục là tên rồi "Commentary")
// thành sources/beastmancer.json. Chạy: node scripts/data-import/beastmancer-fetch.mjs (cần mạng),
// rồi species-batch-import.mjs sources/beastmancer.json. Luật ở content-sources-real.md mục "Beastmancer".

import { guessRace } from './raceGuess.mjs'
import { existingSpecies, writeSource } from './sourceHelpers.mjs'
import { guessElements, pageLines } from './smallSources.mjs'
import { readDumpJson, statsAtTier } from './game-files/gameFiles.mjs'

const GUIDE = 'https://steamcommunity.com/sharedfiles/filedetails/?id=1387116090'
const TIER_BY_SECTION = { Basic: 'small', Rare: 'medium', Legendary: 'large' }
/** Thiên thần / ác quỷ có tên riêng dạng người (luật nhân vật độc nhất, content-data.md). */
const UNIQUE = new Set(['samael', 'sathanus'])

/** Tên guide gõ khác tên trong database game. */
const OFFICIAL_NAMES = {
  'ratkin brigard': 'Ratkin Brigand',
  'king testudo': 'Testudo King',
  'kobold chieftan': 'Kobold Warchief'
}
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
/** Cân nặng của quái `big` (chiếm 2 ô trong game gốc): đúng ngưỡng quái lớn (size.largeWeightKg, monster-size.md). */
const BIG_WEIGHT_KG = 1000
/** Tổng chỉ số tăng theo level của từng quái trong database BeastData của game đã cài. */
const growthOf = new Map(readDumpJson('beastmancer.json').map((row) => [nameKey(row.name), row]))
/** Chỉ số gốc, `big`, `flies` trên prefab của game đã cài. */
const prefabOf = new Map(
  Object.entries(readDumpJson('beastmancer-prefabs.json')).map(([name, row]) => [
    nameKey(name),
    row
  ])
)
const totals = [...prefabOf].map(([key, prefab]) => {
  const growth = growthOf.get(key)
  return {
    key,
    hp: prefab.health + (growth?.health ?? 0),
    attack: prefab.attack + (growth?.attack ?? 0) + 1,
    defense: prefab.defense + (growth?.defense ?? 0) + 1,
    speed: prefab.initiative + (growth?.initiative ?? 0) + (growth?.speed ?? 0)
  }
})
const averageOf = (stat) => totals.reduce((sum, row) => sum + row[stat], 0) / totals.length
const averages = Object.fromEntries(
  ['hp', 'attack', 'defense', 'speed'].map((s) => [s, averageOf(s)])
)
/**
 * Dáng chỉ số: gốc + tổng tăng theo level, so với trung bình cả game của từng chỉ số (HP hàng trăm,
 * công vài điểm nên phải chia theo chỉ số). Game có Attack / Defense chung cho cả hai loại.
 */
function shapeOf(key) {
  const row = totals.find((total) => total.key === key)
  const ratio = (stat) => row[stat] / averages[stat]
  return {
    hp: ratio('hp'),
    attack: ratio('attack'),
    defense: ratio('defense'),
    spAttack: ratio('attack'),
    spDefense: ratio('defense'),
    speed: ratio('speed')
  }
}

const lines = await pageLines(GUIDE)
const existing = existingSpecies('beastmancer')
const species = []
const excluded = []
let section = null
for (let i = 1; i < lines.length; i++) {
  const sectionMatch = /^(Basic|Rare|Legendary) monsters part/i.exec(lines[i])
  if (sectionMatch)
    section = sectionMatch[1][0].toUpperCase() + sectionMatch[1].slice(1).toLowerCase()
  // Phần giới thiệu cách đọc mục ("Name: the given creature's name") không phải quái.
  if (!section || !/^Commentary/i.test(lines[i]) || /^Name:/i.test(lines[i - 1])) continue
  const name = lines[i - 1]
    .replace(/^The /, '')
    .replace(/\.$/, '')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const official = OFFICIAL_NAMES[name.toLowerCase()] ?? name
  if (UNIQUE.has(name.toLowerCase())) {
    excluded.push({ name, reason: 'nhân vật độc nhất (thiên thần / ác quỷ có tên riêng)' })
    continue
  }
  const commentary = lines[i].replace(/^Commentary:\s*/i, '')
  const prefab = prefabOf.get(nameKey(official))
  if (!prefab) throw new Error(`Prefab game không có ${official}`)
  const guessed = guessElements(name, commentary)
  // Game ghi rõ quái nào bay (`flies`): hệ Bay theo đó, không theo từ khóa (game xét đang bay theo hệ, hit-locations.md).
  const grounded = guessed.filter((element) => element !== 'flying')
  // Không đoán được hệ thì không hệ (guessElements).
  const elements = prefab.flies ? ['flying', ...grounded].slice(0, 2) : grounded
  const tier = TIER_BY_SECTION[section]
  species.push({
    name: official,
    elements,
    raceId:
      existing.get(name.toLowerCase())?.raceId ??
      guessRace([name, commentary], null) ??
      'mythicBeast',
    tier,
    stats: statsAtTier(shapeOf(nameKey(official)), tier),
    ...(prefab.big ? { weightKg: BIG_WEIGHT_KG } : {}),
    category: `${section} monster`,
    flavor: commentary
  })
}
// Tên chính thức thay tên guide gõ sai: bỏ mục cũ; cập nhật dáng chỉ số thật.
writeSource('beastmancer', {
  source: 'beastmancer',
  origin: 'fantasy',
  prune: true,
  update: { stats: true, elements: true },
  species,
  excluded
})
