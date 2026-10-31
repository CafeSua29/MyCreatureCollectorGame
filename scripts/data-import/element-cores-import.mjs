/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Yêu đan theo hệ trong đột phá và luyện khí (docs/rules/awakening.md, alchemy.md,
// equipment-forge.md): Thức tỉnh đan theo hệ (thay Thức tỉnh đan chung, mỗi hệ một món + công thức
// từ yêu đan và linh thạch cùng hệ), Phá Cảnh Đan cần 3 yêu đan cùng hệ, dòng linh hệ của phụ linh
// (equipmentAffixes.json, trọng số 0), config `awakening` / `forge.imbue` (balance.json). Chạy sau
// treasures-import.mjs, alchemy-import.mjs, equipment-import.mjs. Số tạm Claude đặt. Chạy lại được
// (ghi đè mục của chính nó): node scripts/data-import/element-cores-import.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(`${DATA}/${path}`, 'utf8'))
const write = (path, value) =>
  writeFileSync(`${DATA}/${path}`, JSON.stringify(value, null, 2) + '\n')
const capitalized = (id) => `${id[0].toUpperCase()}${id.slice(1)}`

const OLD_PILL = 'awakeningPill'
const balance = read('balance.json')
const cores = balance.treasures.demonCoreItemIds
const stones = balance.alchemy.elementStoneItemIds
const elementIds = Object.keys(cores)
const elementNames = { vi: read('i18n/vi/elements.json'), en: read('i18n/en/elements.json') }
const pillId = (elementId) => `${OLD_PILL}${capitalized(elementId)}`
const lineId = (elementId) => `affixImbue${capitalized(elementId)}`

// Thức tỉnh đan theo hệ: giá như món cũ, mỗi hệ trọng số cửa hàng 15 (gấp 3 món cũ để bù việc phải đúng hệ; mô phỏng
// 2026-10-27).
const items = read('items.json').filter(
  (item) => item.id !== OLD_PILL && !elementIds.some((e) => item.id === pillId(e))
)
const pillIndex = read('items.json').findIndex((item) => item.id === OLD_PILL)
const pills = elementIds.map((e) => ({
  id: pillId(e),
  category: 'material',
  price: 2000,
  shop: true,
  shopWeight: 15
}))
items.splice(pillIndex >= 0 ? pillIndex : items.length, 0, ...pills)
write('items.json', items)
for (const [language, label] of [
  ['vi', (name) => `Thức Tỉnh Đan (${name})`],
  ['en', (name) => `Awakening Pill (${name})`]
]) {
  const path = `i18n/${language}/items.json`
  const names = read(path)
  delete names[OLD_PILL]
  for (const e of elementIds) names[pillId(e)] = label(elementNames[language][e])
  write(path, names)
}

// Công thức: Thức tỉnh đan hệ X = 2 yêu đan hệ X + 1 linh thạch hệ X + 2 Nhân Sâm (thay công thức
// cũ ở cùng vị trí); Phá Cảnh Đan cần 3 yêu đan cùng một hệ.
const recipes = read('recipes.json').filter((r) => !elementIds.some((e) => r.id === pillId(e)))
const oldIndex = recipes.findIndex((r) => r.id === OLD_PILL)
const pillRecipes = elementIds.map((e) => ({
  id: pillId(e),
  output: { itemId: pillId(e), count: 1 },
  inputs: [
    { itemId: cores[e], count: 2 },
    ...(stones[e] ? [{ itemId: stones[e], count: 1 }] : []),
    { itemId: 'ginseng', count: 2 }
  ],
  money: 1000,
  minLevel: 4,
  successChance: 65,
  exp: 20
}))
if (oldIndex >= 0) recipes.splice(oldIndex, 1, ...pillRecipes)
else recipes.push(...pillRecipes)
const breakthrough = recipes.find((r) => r.id === 'breakthroughPill')
breakthrough.inputs = [
  ...breakthrough.inputs.filter((input) => input.groupId === undefined),
  { groupId: 'demonCore', count: 3, sameItem: true }
]
write('recipes.json', recipes)

// Dòng linh hệ: + % sát thương skill của hệ (elementDamageDealt), không tung ngẫu nhiên.
const IMBUE_RANGES = {
  common: { min: 4, max: 6 },
  uncommon: { min: 6, max: 9 },
  rare: { min: 9, max: 13 },
  epic: { min: 13, max: 18 },
  legendary: { min: 18, max: 24 },
  unique: { min: 22, max: 30 }
}
const affixes = read('equipmentAffixes.json').filter(
  (affix) => !elementIds.some((e) => affix.id === lineId(e))
)
for (const e of elementIds) {
  affixes.push({
    id: lineId(e),
    weight: 0,
    hook: { type: 'elementDamageDealt', params: { elementIds: [e] } },
    valueParam: 'percent',
    ranges: IMBUE_RANGES,
    tags: ['elementImbue']
  })
}
write('equipmentAffixes.json', affixes)

// Config: Thức tỉnh đan theo hệ đầu của boss; phụ linh; đúc dùng yêu đan cùng hệ (không còn nhóm).
const awakening = balance.awakening
delete awakening.pillItemId
awakening.pillItemIds = Object.fromEntries(elementIds.map((e) => [e, pillId(e)]))
awakening.bossDrops = awakening.bossDrops.filter((drop) => drop.itemId !== OLD_PILL)
awakening.floorBossDrops = awakening.floorBossDrops.filter((drop) => drop.itemId !== OLD_PILL)
awakening.bossPillChance = 30
awakening.floorBossPillChance = 30
delete balance.forge.cast.groupId
balance.forge.imbue = {
  lineIds: Object.fromEntries(elementIds.map((e) => [e, lineId(e)])),
  cores: { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8, unique: 12 },
  money: 300,
  exp: 5
}
// Rương bí cảnh: Thức tỉnh đan chung → mỗi hệ một mục, chia đều trọng số cũ.
const chest = balance.trials.realm.chest.items
const old = chest.findIndex((entry) => entry.itemId === OLD_PILL)
if (old >= 0) {
  const { weight, min, max } = chest[old]
  const split = elementIds.map((e) => ({
    itemId: pillId(e),
    weight: weight / elementIds.length,
    min,
    max
  }))
  chest.splice(old, 1, ...split)
}
write('balance.json', balance)
