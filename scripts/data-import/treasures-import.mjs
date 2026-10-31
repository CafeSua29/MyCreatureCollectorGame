/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập thiên tài địa bảo (docs/rules/treasures.md) vào src/data: vật phẩm (items.json), tên i18n,
// khóa config `treasures` (balance.json). Số tạm Claude đặt (chủ project giao). Chạy lại được (ghi
// đè các mục của chính nó): node scripts/data-import/treasures-import.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

const consumable = (id, price, effects, extra = {}) => ({
  id,
  category: 'consumable',
  price,
  ...extra,
  use: 'field',
  target: 'ally',
  effects
})

/** [vật phẩm, tên vi, tên en]. */
const STAT_FRUITS = [
  ['bloodBodhi', 'hp', 'Huyết Bồ Đề', 'Blood Bodhi'],
  ['tigerBoneFruit', 'attack', 'Hổ Cốt Quả', 'Tiger Bone Fruit'],
  ['blackTortoiseShell', 'defense', 'Huyền Quy Giáp', 'Black Tortoise Shell'],
  ['spiritHeartFruit', 'spAttack', 'Linh Tâm Quả', 'Spirit Heart Fruit'],
  ['iceHeartLotus', 'spDefense', 'Băng Tâm Liên', 'Ice Heart Lotus'],
  ['windSpiritGrass', 'speed', 'Phong Linh Thảo', 'Wind Spirit Grass']
]

const entries = [
  [
    consumable('heavenSpiritFruit', 600, [{ type: 'addGenesAll', params: { amount: 1 } }], {
      shop: true,
      shopWeight: 5
    }),
    'Thiên Linh Quả',
    'Heaven Spirit Fruit'
  ],
  ...STAT_FRUITS.map(([id, stat, vi, en]) => [
    consumable(id, 800, [{ type: 'addGenes', params: { stat, amount: 3 } }], {
      shop: true,
      shopWeight: 3
    }),
    vi,
    en
  ]),
  [
    consumable('dragonBloodFruit', 2000, [{ type: 'addGenesAll', params: { amount: 2 } }], {
      favoriteRaceIds: ['dragon', 'reptile']
    }),
    'Long Huyết Quả',
    'Dragon Blood Fruit'
  ],
  [
    consumable('enlightenmentTea', 500, [{ type: 'addMasteryExp', params: { amount: 50 } }], {
      shop: true,
      shopWeight: 5
    }),
    'Ngộ Đạo Trà',
    'Enlightenment Tea'
  ],
  [
    consumable('marrowCleansingPill', 20000, [{ type: 'traitLevelUp', params: { count: 1 } }]),
    'Tẩy Tủy Đan',
    'Marrow Cleansing Pill'
  ]
]

const elements = read(`${DATA}/elements.json`)
const elementNames = {
  vi: read(`${DATA}/i18n/vi/elements.json`),
  en: read(`${DATA}/i18n/en/elements.json`)
}
const demonCoreItemIds = {}
for (const element of elements) {
  const id = `demonCore${element.id[0].toUpperCase()}${element.id.slice(1)}`
  demonCoreItemIds[element.id] = id
  entries.push([
    consumable(id, 1500, [{ type: 'addGenesTopStat', params: { amount: 5 } }], {
      favoriteElementIds: [element.id]
    }),
    `Yêu Đan ${elementNames.vi[element.id]}`,
    `${elementNames.en[element.id]} Demon Core`
  ])
}

const ids = new Set(entries.map(([item]) => item.id))
const items = read(`${DATA}/items.json`).filter((item) => !ids.has(item.id))
items.push(...entries.map(([item]) => item))
write(`${DATA}/items.json`, items)

for (const [language, index] of [
  ['vi', 1],
  ['en', 2]
]) {
  const path = `${DATA}/i18n/${language}/items.json`
  const names = read(path)
  for (const entry of entries) names[entry[0].id] = entry[index]
  write(path, names)
}

const balance = read(`${DATA}/balance.json`)
balance.treasures = {
  resistance: 0.9,
  favoriteMultiplier: 2,
  favoriteAffinity: 5,
  wildDrops: [
    { itemId: 'heavenSpiritFruit', chance: 1 },
    ...STAT_FRUITS.map(([itemId]) => ({ itemId, chance: 0.3 }))
  ],
  bossDrops: [
    { itemId: 'enlightenmentTea', chance: 10 },
    { itemId: 'dragonBloodFruit', chance: 3 },
    { itemId: 'marrowCleansingPill', chance: 1 }
  ],
  demonCoreItemIds,
  demonCoreChance: 15,
  demonCoreWildChance: 3
}
// Nhóm "yêu đan bất kỳ hệ" cho nguyên liệu luyện đan / luyện khí (docs/rules/alchemy.md).
balance.itemGroups = { ...balance.itemGroups, demonCore: Object.values(demonCoreItemIds) }
write(`${DATA}/balance.json`, balance)
