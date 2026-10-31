/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập số Fling (`flingPower`) và Natural Gift (`naturalGift { power, elementId }`) thật của Pokémon
// từ PokeAPI (items.csv, berries.csv) cho đồ cầm (`category: held`) cùng id camelCase trong
// src/data/items.json (docs/rules/pokemon-moves.md mục "Đồ cầm"). Chạy lại được (cần mạng).

import { readFileSync, writeFileSync } from 'node:fs'
import { fetchPokeApiCsv } from './pokeapi.mjs'

const ITEMS_PATH = new URL('../../src/data/items.json', import.meta.url)

/** Trạng thái khi bị ném bằng Fling (hàm của Showdown, ghi tay theo Bulbapedia). */
const FLING_STATUS = {
  flameOrb: 'burn',
  toxicOrb: 'badPoison',
  kingsRock: 'flinch',
  razorFang: 'flinch',
  lightBall: 'paralysis',
  poisonBarb: 'poison'
}

const camel = (identifier) =>
  identifier
    .split('-')
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join('')

const [itemRows, berryRows, typeRows] = await Promise.all([
  fetchPokeApiCsv('items'),
  fetchPokeApiCsv('berries'),
  fetchPokeApiCsv('types')
])
const typeById = new Map(typeRows.map((row) => [row.id, row.identifier]))
const giftByItemId = new Map(
  berryRows.map((row) => [
    row.item_id,
    { power: Number(row.natural_gift_power), elementId: typeById.get(row.natural_gift_type_id) }
  ])
)
const sourceById = new Map(itemRows.map((row) => [camel(row.identifier), row]))

const items = JSON.parse(readFileSync(ITEMS_PATH, 'utf8'))
let fling = 0
let gifts = 0
for (const item of items) {
  if (item.category !== 'held') continue
  delete item.flingPower
  delete item.naturalGift
  delete item.flingStatusId
  if (FLING_STATUS[item.id]) item.flingStatusId = FLING_STATUS[item.id]
  const row = sourceById.get(item.id)
  if (!row) continue
  const power = Number(row.fling_power)
  if (power > 0) {
    item.flingPower = power
    fling++
  }
  const gift = giftByItemId.get(row.id)
  if (gift && gift.power > 0 && gift.elementId) {
    item.naturalGift = gift
    gifts++
  }
}
writeFileSync(ITEMS_PATH, `${JSON.stringify(items, null, 2)}\n`)
console.log(`Fling: ${fling} món; Natural Gift: ${gifts} berry`)
