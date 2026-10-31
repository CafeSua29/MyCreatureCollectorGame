/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập linh thực (docs/rules/cooking.md) vào src/data: món ăn `dish` (items.json + i18n), công thức nấu
// ăn (recipes.json, station "cooking") kể cả 25 Bạc Hà Tính Cách (mint<Tính cách>, natures.md) và mồi
// dụ (category `bait`, recruit.md), khóa
// config `cooking` và món ăn cho dưỡng dục (`imprint.foods`) ở balance.json. Số tạm Claude đặt (chủ
// project giao). Chạy lại được (ghi đè mục của chính nó), chạy **sau** alchemy-import.mjs /
// element-cores-import.mjs (alchemy-import ghi lại cả recipes.json):
// node scripts/data-import/cooking-import.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const DATA = 'src/data'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const capitalized = (id) => `${id[0].toUpperCase()}${id.slice(1)}`

const amount = (itemId, count = 1) => ({ itemId, count })
const percent = (type, value) => ({ type, params: { percent: value } })
const stat = (value, statName) => ({
  type: 'statPercent',
  params: statName ? { percent: value, stat: statName } : { percent: value }
})

/**
 * Món ăn: [id, vi, en, giá, số trận, hiệu ứng, công thức { count, inputs, money, minLevel, %, exp }].
 * Nguyên liệu: dược liệu / linh thạch / tinh phách (alchemy.md), Linh Quả / Linh Mật (cửa hàng).
 */
const DISHES = [
  [
    'spiritRiceCongee',
    'Linh Mễ Chúc',
    'Spirit Rice Congee',
    60,
    10,
    [stat(5)],
    {
      count: 2,
      inputs: [amount('lingzhi'), amount('spiritFruit', 2)],
      minLevel: 1,
      chance: 95,
      exp: 3
    }
  ],
  [
    'heartBondCake',
    'Đồng Tâm Bánh',
    'Heart Bond Cake',
    120,
    20,
    [percent('affinityGainPercent', 50)],
    {
      count: 1,
      inputs: [amount('spiritHoney', 2), amount('spiritFruit', 2)],
      minLevel: 2,
      chance: 90,
      exp: 4
    }
  ],
  [
    'fireDragonSoup',
    'Hỏa Long Thang',
    'Fire Dragon Soup',
    150,
    10,
    [stat(10, 'attack')],
    {
      count: 1,
      inputs: [amount('essenceDragon'), amount('spiritStoneFire'), amount('ginseng')],
      minLevel: 3,
      chance: 85,
      exp: 6
    }
  ],
  [
    'mysticTortoiseBroth',
    'Huyền Quy Canh',
    'Mystic Tortoise Broth',
    150,
    10,
    [stat(10, 'defense'), stat(10, 'spDefense')],
    {
      count: 1,
      inputs: [amount('essenceReptile'), amount('spiritStoneWater'), amount('fleeceflower')],
      minLevel: 3,
      chance: 85,
      exp: 6
    }
  ],
  [
    'galeChaserCake',
    'Truy Phong Bánh',
    'Gale Chaser Cake',
    150,
    10,
    [stat(10, 'speed')],
    {
      count: 1,
      inputs: [amount('essenceAvian'), amount('spiritStoneFlying'), amount('lingzhi')],
      minLevel: 3,
      chance: 85,
      exp: 6
    }
  ],
  [
    'beastLureCake',
    'Dụ Thú Cao',
    'Beast Lure Cake',
    150,
    15,
    [percent('catchRatePercent', 20)],
    {
      count: 1,
      inputs: [amount('spiritFruit', 2), amount('spiritHoney'), amount('snowLotus')],
      minLevel: 4,
      chance: 85,
      exp: 6
    }
  ],
  [
    'hundredFlowerCake',
    'Bách Hoa Cao',
    'Hundred Flower Cake',
    200,
    15,
    [percent('expPercent', 20)],
    {
      count: 1,
      inputs: [amount('snowLotus'), amount('spiritHoney'), amount('lingzhi', 2)],
      minLevel: 5,
      chance: 80,
      exp: 8
    }
  ],
  [
    'goldenFishFeast',
    'Kim Ngư Yến',
    'Golden Fish Feast',
    200,
    15,
    [percent('moneyPercent', 25)],
    {
      count: 1,
      inputs: [amount('essenceAquatic', 2), amount('ginseng')],
      money: 200,
      minLevel: 5,
      chance: 80,
      exp: 8
    }
  ],
  [
    'treasureSeekerSoup',
    'Tầm Bảo Thang',
    'Treasure Seeker Soup',
    200,
    15,
    [percent('dropRatePercent', 25)],
    {
      count: 1,
      inputs: [amount('essenceBeast'), amount('fleeceflower'), amount('ginseng')],
      minLevel: 5,
      chance: 80,
      exp: 8
    }
  ],
  [
    'eightTreasureFeast',
    'Bát Trân Yến',
    'Eight Treasure Feast',
    800,
    20,
    [stat(10), percent('expPercent', 10), percent('moneyPercent', 10)],
    {
      count: 1,
      inputs: [
        amount('lingzhi', 2),
        amount('ginseng', 2),
        amount('snowLotus', 2),
        amount('fleeceflower', 2),
        { groupId: 'demonCore', count: 1 }
      ],
      money: 500,
      minLevel: 10,
      chance: 70,
      exp: 20
    }
  ]
]

const names = { vi: {}, en: {} }
const newItems = []
const newRecipes = []
for (const [id, vi, en, price, battles, effects, recipe] of DISHES) {
  newItems.push({ id, category: 'dish', price, effects, battles })
  names.vi[id] = vi
  names.en[id] = en
  newRecipes.push({
    id,
    station: 'cooking',
    output: amount(id, recipe.count),
    inputs: recipe.inputs,
    money: recipe.money ?? 0,
    minLevel: recipe.minLevel,
    successChance: recipe.chance,
    exp: recipe.exp
  })
}

// Bạc Hà Tính Cách: 2 dược liệu theo chỉ số tăng của tính cách + 1 Linh Mật; tính cách trung tính
// (không tăng / giảm) dùng 1 Linh Chi + 1 Nhân Sâm.
const HERB_BY_STAT = {
  attack: 'ginseng',
  defense: 'fleeceflower',
  spAttack: 'lingzhi',
  spDefense: 'snowLotus',
  speed: 'spiritFruit'
}
for (const nature of read(`${DATA}/natures.json`)) {
  const herbs = nature.up
    ? [amount(HERB_BY_STAT[nature.up], 2)]
    : [amount('lingzhi'), amount('ginseng')]
  const id = `mint${capitalized(nature.id)}`
  newRecipes.push({
    id,
    station: 'cooking',
    output: amount(id),
    inputs: [...herbs, amount('spiritHoney')],
    money: 0,
    minLevel: 3,
    successChance: 85,
    exp: 5
  })
}

// Mồi dụ: mồi khẩu vị = 1 tinh phách của race khẩu vị đầu + 1 Linh Quả (ra 2); mồi chung theo sức
// mạnh: thu phục ≤ 50% như Mồi Dụ Thú, còn lại như Linh Mồi.
const cookRecipe = ({ id, count, inputs, minLevel }) => ({
  id,
  station: 'cooking',
  output: amount(id, count),
  inputs,
  money: 0,
  minLevel,
  successChance: 90,
  exp: 3
})
for (const bait of read(`${DATA}/items.json`).filter((item) => item.category === 'bait')) {
  const favorite = bait.favoriteRaceIds?.[0]
  if (favorite) {
    const inputs = [amount(`essence${capitalized(favorite)}`), amount('spiritFruit')]
    newRecipes.push(cookRecipe({ id: bait.id, count: 2, inputs, minLevel: 2 }))
  } else if (bait.recruitPercent <= 50) {
    const inputs = [amount('essenceBeast'), amount('spiritFruit')]
    newRecipes.push(cookRecipe({ id: bait.id, count: 2, inputs, minLevel: 1 }))
  } else {
    const inputs = [amount('essenceBeast'), amount('spiritHoney'), amount('ginseng')]
    newRecipes.push(cookRecipe({ id: bait.id, count: 1, inputs, minLevel: 4 }))
  }
}

const recipeIds = new Set(newRecipes.map((recipe) => recipe.id))
const recipes = read(`${DATA}/recipes.json`).filter((recipe) => !recipeIds.has(recipe.id))
write(`${DATA}/recipes.json`, [...recipes, ...newRecipes])

const itemIds = new Set(newItems.map((item) => item.id))
const items = read(`${DATA}/items.json`).filter((item) => !itemIds.has(item.id))
write(`${DATA}/items.json`, [...items, ...newItems])
for (const language of ['vi', 'en']) {
  const path = `${DATA}/i18n/${language}/items.json`
  write(path, { ...read(path), ...names[language] })
}

const balance = read(`${DATA}/balance.json`)
balance.cooking = { expBase: 3, expPower: 2, levelBonusPercent: 1 }
const CHEAP_DISHES = ['spiritRiceCongee', 'heartBondCake']
balance.imprint.foods = [
  ...balance.imprint.foods.filter((itemId) => !CHEAP_DISHES.includes(itemId)),
  ...CHEAP_DISHES
]
write(`${DATA}/balance.json`, balance)
