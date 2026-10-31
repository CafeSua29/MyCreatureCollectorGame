/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập hồn tinh (docs/rules/soul-levels.md) vào src/data: 2 loại hồn tinh (items.json), tên i18n,
// khóa config `soulLevels`, thêm vào rương bí cảnh / thưởng mốc tháp (config.trials) và đồ mang về
// của vài chuyến thám hiểm (expeditions.json; chạy lại sau expeditions-import.mjs). Số tạm Claude đặt.
// Chạy lại được (ghi đè các mục của chính nó): node scripts/data-import/soul-levels-import.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

const SMALL = 'soulCrystalSmall'
const LARGE = 'soulCrystalLarge'

/** [vật phẩm, tên vi, tên en]. */
const entries = [
  [
    { id: SMALL, category: 'soulCrystal', price: 300, points: 1 },
    'Hồn tinh nhỏ',
    'Small Soul Crystal'
  ],
  [
    { id: LARGE, category: 'soulCrystal', price: 1500, points: 5 },
    'Hồn tinh lớn',
    'Large Soul Crystal'
  ]
]

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

const withoutSoul = (list) => list.filter((entry) => !ids.has(entry.itemId))

const balance = read(`${DATA}/balance.json`)
balance.soulLevels = {
  percentPerLevel: 3,
  costBase: 100,
  fuseRefundPercent: 50,
  wildDrops: [{ itemId: SMALL, chance: 4 }],
  bossDrops: [
    { itemId: SMALL, chance: 60 },
    { itemId: LARGE, chance: 15 }
  ]
}
const { realm, tower } = balance.trials
realm.chest.items = [
  ...withoutSoul(realm.chest.items),
  { itemId: SMALL, weight: 8, min: 2, max: 5 },
  { itemId: LARGE, weight: 3, min: 1, max: 1 }
]
tower.milestoneRewards = [...withoutSoul(tower.milestoneRewards), { itemId: LARGE, count: 1 }]
write(`${DATA}/balance.json`, balance)

/** Đồ mang về thêm theo chuyến thám hiểm. */
const EXPEDITION_DROPS = {
  beastHunt: [{ itemId: SMALL, chance: 25, min: 1, max: 3 }],
  ancientRuins: [
    { itemId: SMALL, chance: 40, min: 2, max: 4 },
    { itemId: LARGE, chance: 10, min: 1, max: 1 }
  ]
}
const expeditions = read(`${DATA}/expeditions.json`)
for (const expedition of expeditions) {
  expedition.drops = [...withoutSoul(expedition.drops), ...(EXPEDITION_DROPS[expedition.id] ?? [])]
}
write(`${DATA}/expeditions.json`, expeditions)
