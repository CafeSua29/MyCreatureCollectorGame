/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập luyện đan và linh điền (docs/rules/alchemy.md) vào src/data: nguyên liệu (tinh phách theo race,
// linh thạch theo hệ, dược liệu), hạt giống, đan phương (items.json + i18n), công thức (recipes.json),
// khóa config `alchemy` (balance.json), kỹ năng đồng hành tỉ lệ luyện đan của race plant
// (partnerSkills.json), công thức luyện khí (station "smithing") và Tụ Linh Đan dùng yêu đan bất kỳ
// (nhóm `demonCore` của treasures-import.mjs). Số tạm Claude đặt (chủ project giao). Chạy lại được
// (ghi đè mục của chính nó): node scripts/data-import/alchemy-import.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const capitalized = (id) => `${id[0].toUpperCase()}${id.slice(1)}`

const names = { vi: {}, en: {} }
const newItems = []
const add = (item, vi, en) => {
  newItems.push(item)
  names.vi[item.id] = vi
  names.en[item.id] = en
}
const material = (id, price, extra = {}) => ({ id, category: 'material', price, ...extra })

// Tinh phách theo race, linh thạch theo hệ.
const races = read(`${DATA}/races.json`)
const elements = read(`${DATA}/elements.json`)
const raceNames = { vi: read(`${DATA}/i18n/vi/races.json`), en: read(`${DATA}/i18n/en/races.json`) }
const elementNames = {
  vi: read(`${DATA}/i18n/vi/elements.json`),
  en: read(`${DATA}/i18n/en/elements.json`)
}
const raceEssenceItemIds = {}
for (const race of races) {
  const id = `essence${capitalized(race.id)}`
  raceEssenceItemIds[race.id] = id
  add(material(id, 100), `Tinh Phách ${raceNames.vi[race.id]}`, `${raceNames.en[race.id]} Essence`)
}
const elementStoneItemIds = {}
for (const element of elements) {
  const id = `spiritStone${capitalized(element.id)}`
  elementStoneItemIds[element.id] = id
  add(
    material(id, 150),
    `Linh Thạch ${elementNames.vi[element.id]}`,
    `${elementNames.en[element.id]} Spirit Stone`
  )
}

// Dược liệu và hạt giống: [id, vi, en, ngày chín, thu hoạch min, max].
const HERBS = [
  ['lingzhi', 'Linh Chi', 'Lingzhi', 2, 2, 4],
  ['ginseng', 'Nhân Sâm', 'Ginseng', 3, 1, 3],
  ['snowLotus', 'Tuyết Liên', 'Snow Lotus', 5, 1, 2],
  ['fleeceflower', 'Hà Thủ Ô', 'Fleeceflower', 2, 2, 4]
]
for (const [id, vi, en, growDays, min, max] of HERBS) {
  add(material(id, 80), vi, en)
  add(
    {
      id: `seed${capitalized(id)}`,
      category: 'seed',
      price: 120,
      shop: true,
      shopWeight: 8,
      growDays,
      harvest: [{ itemId: id, min, max }]
    },
    `Hạt ${vi}`,
    `${en} Seed`
  )
}

const amount = (itemId, count = 1) => ({ itemId, count })
const essence = (raceId, count) => amount(raceEssenceItemIds[raceId], count)
const stone = (elementId, count) => amount(elementStoneItemIds[elementId], count)
const demonCore = (count) => ({ groupId: 'demonCore', count })

/** [công thức, output count, inputs, money, minLevel, % thành công, exp, cần đan phương]. */
const RECIPES = [
  ['potion', 3, [amount('lingzhi')], 0, 1, 95, 2],
  ['superPotion', 2, [amount('lingzhi', 2), amount('ginseng')], 0, 2, 85, 5],
  ['revive', 1, [amount('ginseng', 2), amount('snowLotus')], 50, 3, 75, 8],
  ['antidote', 2, [amount('fleeceflower')], 0, 1, 95, 2],
  ['fullHeal', 1, [amount('fleeceflower', 2), amount('snowLotus')], 50, 3, 80, 6],
  ['lesserLongevityPill', 1, [amount('ginseng'), amount('fleeceflower')], 100, 2, 85, 5],
  [
    'longevityPill',
    1,
    [amount('ginseng', 3), amount('snowLotus', 2), stone('light', 1)],
    500,
    5,
    70,
    15
  ],
  [
    'greaterLongevityPill',
    1,
    [amount('ginseng', 6), amount('snowLotus', 4), essence('dragon', 2)],
    3000,
    10,
    60,
    40
  ],
  [
    'myriadLongevityPill',
    1,
    [
      essence('deity', 3),
      essence('dragon', 3),
      amount('ginseng', 10),
      amount('snowLotus', 10),
      demonCore(2)
    ],
    20000,
    20,
    50,
    120,
    true
  ],
  [
    'breakthroughPill',
    1,
    [essence('celestial', 1), amount('ginseng', 2), demonCore(1)],
    500,
    4,
    75,
    10
  ],
  [
    'awakeningPill',
    1,
    [
      essence('dragon', 1),
      stone('electric', 1),
      stone('light', 1),
      amount('ginseng', 2),
      demonCore(1)
    ],
    1000,
    6,
    65,
    20
  ],
  [
    'humanFormPill',
    1,
    [essence('spirit', 2), essence('humanoid', 2), amount('snowLotus', 3), demonCore(2)],
    5000,
    12,
    55,
    50,
    true
  ],
  ['mutationStone', 1, [essence('aberration', 2), stone('dark', 1)], 1000, 8, 60, 25],
  [
    'heartDew',
    1,
    [amount('snowLotus', 2), stone('fairy', 1), amount('lingzhi', 2)],
    1000,
    7,
    65,
    20
  ],
  [
    'heavenSpiritFruit',
    1,
    [amount('lingzhi', 2), amount('ginseng'), stone('grass', 1)],
    200,
    3,
    80,
    6
  ],
  ['tigerBoneFruit', 1, [essence('beast', 2), amount('lingzhi', 2)], 300, 5, 70, 12],
  ['windSpiritGrass', 1, [essence('avian', 2), amount('lingzhi', 2)], 300, 5, 70, 12],
  [
    'enlightenmentTea',
    1,
    [amount('fleeceflower', 2), amount('lingzhi'), stone('psychic', 1)],
    200,
    4,
    80,
    8
  ],
  ['gatherSpiritPill', 1, [demonCore(2), amount('lingzhi', 2)], 500, 6, 70, 15]
]

// Luyện khí ở Thợ rèn (station "smithing", cấp luyện khí riêng): yêu đan bất kỳ ra đá rèn.
const SMITHING_RECIPES = [
  ['enhanceStone', 5, [demonCore(1)], 0, 1, 95, 3],
  ['refiningStone', 1, [demonCore(2)], 300, 1, 85, 6]
]

// Tụ Linh Đan: EXP như Kẹo EXP (addExp theo tầng cao nhất, docs/rules/exp-candy.md).
add(
  {
    id: 'gatherSpiritPill',
    category: 'consumable',
    price: 60000,
    use: 'field',
    target: 'ally',
    effects: [{ type: 'addExp', params: { baseExp: 15000 } }]
  },
  'Tụ Linh Đan',
  'Spirit Gathering Pill'
)

const itemNames = { vi: read(`${DATA}/i18n/vi/items.json`), en: read(`${DATA}/i18n/en/items.json`) }
const toRecipe =
  (station) =>
  ([id, count, inputs, money, minLevel, successChance, exp, scroll]) => {
    if (scroll) {
      add(
        {
          id: `recipeScroll${capitalized(id)}`,
          category: 'recipeScroll',
          price: 5000,
          recipeId: id
        },
        `Đan Phương: ${itemNames.vi[id]}`,
        `Recipe: ${itemNames.en[id]}`
      )
    }
    return {
      id: station === 'smithing' ? `smith${capitalized(id)}` : id,
      ...(station === 'smithing' ? { station } : {}),
      output: amount(id, count),
      inputs,
      money,
      minLevel,
      successChance,
      exp,
      ...(scroll ? { scroll: true } : {})
    }
  }
const recipes = [...RECIPES.map(toRecipe('alchemy')), ...SMITHING_RECIPES.map(toRecipe('smithing'))]
write(`${DATA}/recipes.json`, recipes)

const ids = new Set(newItems.map((item) => item.id))
const items = read(`${DATA}/items.json`).filter((item) => !ids.has(item.id))
write(`${DATA}/items.json`, [...items, ...newItems])
for (const language of ['vi', 'en']) {
  const path = `${DATA}/i18n/${language}/items.json`
  write(path, { ...read(path), ...names[language] })
}

const balance = read(`${DATA}/balance.json`)
balance.alchemy = {
  expBase: 10,
  expPower: 2,
  levelBonusPercent: 1,
  initialPlots: 2,
  plotBasePrice: 5000,
  plotPriceGrowth: 2,
  raceEssenceItemIds,
  elementStoneItemIds,
  essenceChance: 4,
  stoneChance: 4,
  wildDrops: HERBS.map(([id]) => ({ itemId: id, chance: 1.5 })),
  bossDrops: newItems
    .filter((item) => item.category === 'recipeScroll')
    .map((item) => ({ itemId: item.id, chance: 2 }))
}
write(`${DATA}/balance.json`, balance)

// Kỹ năng đồng hành tỉ lệ luyện đan cho race plant (thay EXP +10% tạm; docs/rules/partner-skills.md).
const partnerSkills = read(`${DATA}/partnerSkills.json`)
const plant = partnerSkills.find((skill) => skill.id === 'photosynthesis')
plant.effects = [{ type: 'alchemySuccessPercent', params: { percent: 10 } }]
write(`${DATA}/partnerSkills.json`, partnerSkills)
for (const [language, name] of [
  ['vi', 'Linh Thảo Tinh Luyện'],
  ['en', 'Herbal Refining']
]) {
  const path = `${DATA}/i18n/${language}/partnerSkills.json`
  write(path, { ...read(path), photosynthesis: name })
}
