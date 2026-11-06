/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập Nether Boss của Siralim Ultimate làm loài (luật "boss bắt được" ở content-data.md: game gốc chỉ
// là trận đấu, game này bắt được mọi boss). 35 boss trên trang "Nether Bosses" của
// siralimultimate.wiki.gg; boss mang tên riêng (Kiichi, King Andrick, Blacksmith Ianne...) bị loại theo
// luật nhân vật độc nhất, chỉ lấy boss tên chung (bảng NETHER dưới, race / hệ đặt theo hình dạng vì
// trang không ghi). Trait Tier 1 của boss ghi vào traits-planned.json để siralim-traits/convert.mjs
// chuyển (part9.mjs), rồi thành ability qua siralim-species-update.mjs. Ghi sources/siralimNether.json.
// Chạy (cần mạng): node scripts/data-import/siralim-nether-fetch.mjs, rồi
// species-batch-import.mjs sources/siralimNether.json, siralim-traits/convert.mjs, siralim-species-update.mjs.

import { readFileSync, writeFileSync } from 'node:fs'
import { freshId } from './siralim-update/ids.mjs'
import { VI_TRAITS } from './siralim-update/names.mjs'
import { plainText, wikiApi, writeSource } from './sourceHelpers.mjs'

const api = wikiApi('https://siralimultimate.wiki.gg/api.php')
const HERE = new URL('./', import.meta.url)
const DATA = new URL('../../src/data/', import.meta.url)
const read = (url) => JSON.parse(readFileSync(url, 'utf8'))
const write = (url, value) => writeFileSync(url, `${JSON.stringify(value, null, 2)}\n`)

/** Boss tên chung → loài: tên mục trên trang, race, hệ (trang chỉ ghi race của Judgment / Mercy). */
const NETHER = [
  {
    section: 'Ceaseless Gladiator',
    name: 'Ceaseless Gladiator',
    raceId: 'human',
    elements: ['fighting', 'fire']
  },
  { section: 'Deathwalker', name: 'Deathwalker', raceId: 'wraith', elements: ['ghost'] },
  { section: 'Inner Darkness', name: 'Inner Darkness', raceId: 'wraith', elements: ['dark'] },
  {
    section: 'Scylla & Charybdis',
    name: 'Scylla',
    raceId: 'leviathan',
    elements: ['water', 'dark']
  },
  { section: 'Scylla & Charybdis', name: 'Charybdis', raceId: 'leviathan', elements: ['water'] },
  { section: 'Judgment and Mercy', name: 'Judgment', raceId: 'angel', elements: ['light'] },
  { section: 'Judgment and Mercy', name: 'Mercy', raceId: 'angel', elements: ['light'] }
]
/** Boss Nether mạnh như Godspawn: bậc thần thoại, tỉ lệ bắt thấp nhất. */
const TIER = 'mythic'
const CATCH_RATE = 5

const text = (await api({ action: 'parse', page: 'Nether_Bosses', prop: 'wikitext' }))?.parse
  ?.wikitext?.['*']
if (!text) throw new Error('Không tải được trang Nether Bosses')
/** Trait Tier 1 của một boss: "Trait: X" + mô tả "Tier 1:", hoặc ô bảng của từng boss (Judgment / Mercy). */
function traitOf(section, name) {
  const start = text.indexOf(`===${section}===`)
  const body = text.slice(start, text.indexOf('\n===', start + 5))
  const simple = /Trait:\s*([^\n]+)[\s\S]*?Tier 1:\s*\n([^\n]+)/.exec(body)
  if (simple) return { trait: plainText(simple[1]), description: describeTier(simple[2]) }
  const row = new RegExp(
    `'''${name.replace('Judgment', 'Judgement')}'''[^\\n]*\\n\\|[^|]*\\|\\s*([^\\n]+)\\n\\|\\s*1\\n\\|\\s*([^\\n]+)`
  ).exec(body)
  return row ? { trait: plainText(row[1]), description: describeTier(row[2]) } : null
}
/** Wiki viết tên trạng thái bằng template icon ({{Scorned}}): plainText sẽ xóa mất nên đổi về chữ trước. */
function describeTier(wikitext) {
  return plainText(wikitext.replace(/\{\{(\w+)\}\}/g, '$1'))
}

const traitsEn = read(new URL('i18n/en/traits.json', DATA))
const traitIds = new Set(read(new URL('traits.json', DATA)).map((t) => t.id))
const nameKey = (name) =>
  String(name)
    .replace(/ \(siralim\)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
const existingTrait = new Set(Object.values(traitsEn).map(nameKey))
const planned = read(new URL('traits-planned.json', HERE))
const creatureTraits = read(new URL('sources/siralimCreatureTraits.json', HERE))
const species = []
for (const boss of NETHER) {
  const found = traitOf(boss.section, boss.name)
  if (!found) throw new Error(`Không thấy trait của ${boss.name} trên trang Nether Bosses`)
  species.push({
    name: boss.name,
    elements: boss.elements,
    raceId: boss.raceId,
    tier: TIER,
    catchRate: CATCH_RATE,
    category: 'Nether Boss',
    flavor: `Nether Boss. ${found.trait}: ${found.description}`
  })
  if (!creatureTraits.creatures.some((c) => c.creature === boss.name))
    creatureTraits.creatures.push({
      creature: boss.name,
      trait: found.trait,
      siralimRace: 'Nether Boss'
    })
  const key = nameKey(found.trait)
  if (existingTrait.has(key) || planned.some((t) => nameKey(t.nameEn) === key)) continue
  const { id, conversionKey } = freshId(found.trait, traitIds)
  planned.push({
    id,
    ...(conversionKey !== id ? { conversionKey } : {}),
    name: VI_TRAITS[conversionKey] ?? found.trait,
    kind: 'rare',
    hooks: [],
    nameEn: found.trait,
    description: found.description,
    source: 'siralim',
    siralimGroup: 'Nether Boss',
    siralimCreature: boss.name
  })
}
write(new URL('traits-planned.json', HERE), planned)
write(new URL('sources/siralimCreatureTraits.json', HERE), creatureTraits)
writeSource('siralimNether', { source: 'siralim', origin: 'fantasy', species })
