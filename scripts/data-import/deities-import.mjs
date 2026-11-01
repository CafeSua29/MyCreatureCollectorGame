/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Thần linh và ân sủng (docs/rules/deities.md): sinh src/data/deities.json (chúc phúc theo mẫu chung
// + chúc phúc riêng của thần, cửa hàng theo hệ của thần), tín vật mỗi thần và Hương Nến (items.json),
// tên ở i18n, và gán deityId cho map trong biomes.json theo kiểu môi trường (theme) của map
// (biomes-source.json; biomes-import.mjs ghi cùng trường khi sinh lại map). Số tạm Claude đặt.
// Chạy lại được (ghi đè mục của chính nó): node scripts/data-import/deities-import.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { withZoneDeity } from './deityAssign.mjs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(`${DATA}/${path}`, 'utf8'))
const write = (path, value) =>
  writeFileSync(`${DATA}/${path}`, JSON.stringify(value, null, 2) + '\n')
const readScript = (path) => JSON.parse(readFileSync(`scripts/data-import/${path}`, 'utf8'))
const capitalized = (id) => `${id[0].toUpperCase()}${id.slice(1)}`

const source = readScript('deities-source.json')
const biomeSource = readScript('biomes-source.json')
const INCENSE_ID = 'incense'
const tokenId = (deity) => `${deity.id}Token`

/** Chúc phúc: vòng 10 bậc, bậc 3 và 10 là kênh riêng của thần, bậc 4 là chỉ số riêng. */
function blessingsOf(deity) {
  const percent = (type, value) => ({ type, params: { percent: value } })
  const stat = (value, statName) => ({
    type: 'elementStatPercent',
    params: statName ? { percent: value, stat: statName } : { percent: value }
  })
  return [
    [stat(3)],
    [percent('expPercent', 5)],
    [percent(deity.signatureChannel, 10)],
    [stat(5, deity.signatureStat)],
    [percent('dropRatePercent', 5)],
    [stat(3)],
    [percent('catchRatePercent', 5)],
    [percent('moneyPercent', 5)],
    [percent('recruitPercent', 5), percent('shinyChancePercent', 5)],
    [percent(deity.signatureChannel, 15), stat(3)]
  ].map((effects) => ({ effects }))
}

/** Cửa hàng thần: đồ hiếm theo hệ của thần và đồ quý chung, giá bằng tín vật, mở dần theo bậc. */
function shopOf(deity) {
  const e = deity.elementId
  return [
    { itemId: `demonCore${capitalized(e)}`, price: 8, minRank: 1 },
    { itemId: `${e}TeraShard`, price: 12, minRank: 2 },
    { itemId: 'enlightenmentTea', price: 10, minRank: 2 },
    { itemId: 'heavenSpiritFruit', price: 15, minRank: 3 },
    { itemId: `${e}ZCrystal`, price: 25, minRank: 4 },
    { itemId: 'fiveElementsScroll', price: 40, minRank: 5 },
    { itemId: 'rareCandy', price: 30, minRank: 6 },
    { itemId: 'dragonBloodFruit', price: 40, minRank: 6 },
    { itemId: 'rebirthPill', price: 60, minRank: 8 },
    { itemId: 'marrowCleansingPill', price: 100, minRank: 10 }
  ]
}

const items = read('items.json')
const known = new Set(items.map((item) => item.id))
for (const deity of source.deities) {
  for (const entry of shopOf(deity)) {
    if (!known.has(entry.itemId))
      throw new Error(`Thần "${deity.id}": thiếu vật phẩm ${entry.itemId}`)
  }
}

write(
  'deities.json',
  source.deities.map((deity) => ({
    id: deity.id,
    elementId: deity.elementId,
    tokenItemId: tokenId(deity),
    blessings: blessingsOf(deity),
    shop: shopOf(deity)
  }))
)

// Hương Nến: bán ở Miếu (luôn có hàng, giá × tầng), không vào hàng ngẫu nhiên của cửa hàng; tín vật: nguyên liệu bán được, chỉ rơi trong map của thần.
const ownIds = new Set([INCENSE_ID, ...source.deities.map(tokenId)])
write('items.json', [
  ...items.filter((item) => !ownIds.has(item.id)),
  { id: INCENSE_ID, category: 'material', price: 1000 },
  ...source.deities.map((deity) => ({ id: tokenId(deity), category: 'material', price: 20 }))
])

for (const language of ['vi', 'en']) {
  write(
    `i18n/${language}/deities.json`,
    Object.fromEntries(source.deities.map((deity) => [deity.id, deity[language]]))
  )
  const names = read(`i18n/${language}/items.json`)
  for (const id of ownIds) delete names[id]
  names[INCENSE_ID] = language === 'vi' ? 'Hương Nến' : 'Incense Candle'
  for (const deity of source.deities) {
    names[tokenId(deity)] = language === 'vi' ? `Tín Vật ${deity.vi}` : `${deity.en} Token`
  }
  write(`i18n/${language}/items.json`, names)
}

// Map → thần theo theme (themes[x].deityId trong biomes-source.json, ghi lại để biomes-import dùng).
const deityOfTheme = new Map()
for (const deity of source.deities) {
  for (const theme of deity.themes) {
    if (deityOfTheme.has(theme)) throw new Error(`Theme "${theme}" có hai thần`)
    if (!biomeSource.themes[theme]) throw new Error(`Thần "${deity.id}": theme lạ "${theme}"`)
    deityOfTheme.set(theme, deity.id)
  }
}
for (const [theme, def] of Object.entries(biomeSource.themes)) {
  if (!deityOfTheme.has(theme)) throw new Error(`Theme "${theme}" chưa có thần`)
  def.deityId = deityOfTheme.get(theme)
}
writeFileSync('scripts/data-import/biomes-source.json', JSON.stringify(biomeSource, null, 2) + '\n')
const themeOfMap = new Map(biomeSource.maps.map((map) => [map.id, map.theme]))
const biomes = read('biomes.json').map((biome) => {
  const theme = themeOfMap.get(biome.id)
  if (!theme) throw new Error(`Map "${biome.id}" không có trong biomes-source.json`)
  return { ...biome, deityId: deityOfTheme.get(theme) }
})
write('biomes.json', biomes)

// Map hiểm địa: thần theo hệ chủ đạo của hiểm địa (zones-import.mjs ghi cùng trường khi sinh lại).
const deityOfElement = new Map(source.deities.map((deity) => [deity.elementId, deity.id]))
const speciesById = new Map(read('species.json').map((species) => [species.id, species]))
const zones = read('zones.json').map((zone) => withZoneDeity(zone, { speciesById, deityOfElement }))
write('zones.json', zones)

const counts = {}
for (const biome of biomes) counts[biome.deityId] = (counts[biome.deityId] ?? 0) + 1
for (const zone of zones) {
  const key = `zone:${zone.map.deityId ?? 'none'}`
  counts[key] = (counts[key] ?? 0) + 1
}
console.log(`deities.json: ${source.deities.length} thần; map theo thần:`, counts)
