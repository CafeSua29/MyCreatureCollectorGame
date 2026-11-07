/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Thêm vũ khí diệt race ("Dữ liệu trang bị và đồ cầm" ở docs/rules/content-mechanics.md) cho mọi race và
// nhóm race chưa có món nào nhắm tới (`damageVsRace` với đúng id đó), theo mẫu món diệt race có sẵn: giá,
// khoảng dòng chính lấy từ món diệt race đầu tiên trong items.json. Món mới chèn ngay sau món diệt race
// cuối cùng; món cũ giữ nguyên. Chạy: node scripts/data-import/race-slayers-import.mjs (chạy lại an toàn:
// race đã có món thì bỏ qua). Sau đó chạy equipment-drops-import.mjs để món mới vào danh sách rơi của map.

import fs from 'node:fs'
import path from 'node:path'
import { chunkOf, joinChunks, splitTopLevel } from './jsonChunks.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const readText = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
const readJson = (file) => JSON.parse(readText(file))
const writeText = (file, text) => fs.writeFileSync(path.join(root, file), text)

const raceGroups = readJson('src/data/raceGroups.json')
const races = readJson('src/data/races.json')
const raceNames = {
  vi: {
    ...readJson('src/data/i18n/vi/raceGroups.json'),
    ...readJson('src/data/i18n/vi/races.json')
  },
  en: {
    ...readJson('src/data/i18n/en/raceGroups.json'),
    ...readJson('src/data/i18n/en/races.json')
  }
}

const itemsText = readText('src/data/items.json')
const items = JSON.parse(itemsText)
const isSlayer = (item) =>
  item.category === 'equipment' && !item.unique && item.mainLine?.hook.type === 'damageVsRace'
const slayers = items.filter(isSlayer)
if (slayers.length === 0) throw new Error('items.json không có món diệt race mẫu')
const template = slayers[0]
const covered = new Set(slayers.flatMap((item) => item.mainLine.hook.params.raceIds))
const itemIds = new Set(items.map((item) => item.id))

/** Số ít không theo luật "bỏ s / ies → y / ches → ch". */
const IRREGULAR_SINGULARS = {
  Zombies: 'Zombie',
  Mantises: 'Mantis',
  Fungi: 'Fungus',
  Larvae: 'Larva'
}

/** Tên riêng cho race có tên trùng nhóm race của nó (món diệt nhóm đã dùng tên đó). */
const NAME_OVERRIDES = {
  changeling: { vi: 'Vũ khí diệt kẻ hoán hình', en: 'Changeling Slayer' },
  zombie: { vi: 'Vũ khí diệt thây ma' },
  elementalSpirit: { vi: 'Vũ khí diệt nguyên tố linh', en: 'Elemental Spirit Slayer' },
  eldritch: { vi: 'Vũ khí diệt tà dị', en: 'Eldritch Slayer' },
  fiend: { en: 'Fiend Slayer' }
}

// Nhóm race trước (rộng hơn), rồi race, theo thứ tự dữ liệu.
const targets = [...raceGroups, ...races].map((entry) => entry.id).filter((id) => !covered.has(id))
const added = targets.map((raceId) => {
  const id = `${raceId}Slayer`
  if (itemIds.has(id)) throw new Error(`Trùng id vật phẩm "${id}"`)
  return {
    id,
    category: 'equipment',
    price: template.price,
    mainLine: {
      ...template.mainLine,
      hook: { type: 'damageVsRace', params: { raceIds: [raceId] } }
    }
  }
})

if (added.length > 0) {
  const chunks = splitTopLevel(itemsText)
  const lastSlayer = items.findLastIndex(isSlayer)
  chunks.splice(lastSlayer + 1, 0, ...added.map(chunkOf))
  writeText('src/data/items.json', joinChunks(chunks))
}

// Tên: chỉ đặt cho món diệt race chưa có tên (tên món cũ giữ nguyên).
const allSlayers = [...slayers, ...added]
for (const lang of ['vi', 'en']) {
  const file = `src/data/i18n/${lang}/items.json`
  const names = readJson(file)
  for (const item of allSlayers) {
    if (names[item.id] !== undefined) continue
    names[item.id] = slayerName(lang, item.mainLine.hook.params.raceIds[0])
  }
  writeText(file, JSON.stringify(names, null, 2) + '\n')
}

/** Tên món diệt race: tên riêng nếu tên race trùng tên nhóm của nó, không thì theo tên race. */
function slayerName(lang, raceId) {
  const override = NAME_OVERRIDES[raceId]?.[lang]
  if (override) return override
  const raceName = raceNames[lang][raceId] ?? raceId
  return lang === 'vi'
    ? `Vũ khí diệt ${raceName.toLocaleLowerCase('vi')}`
    : `${singularName(raceName)} Slayer`
}

/** Tên tiếng Anh số ít từng từ ("Sharks & Rays" → "Shark & Ray"), như "Dragon Slayer" của món cũ. */
function singularName(name) {
  return name
    .split(' ')
    .map((word) => {
      if (IRREGULAR_SINGULARS[word]) return IRREGULAR_SINGULARS[word]
      if (word.endsWith('ches')) return word.slice(0, -2)
      if (word.endsWith('ies')) return word.slice(0, -3) + 'y'
      if (/[^s]s$/.test(word)) return word.slice(0, -1)
      return word
    })
    .join(' ')
}

console.log(`món diệt race có sẵn ${slayers.length}, thêm ${added.length}`)
