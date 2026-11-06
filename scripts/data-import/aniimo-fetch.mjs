/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải Aniimo từ wiki chính thức (wiki.aniimo.com: dữ liệu Aniilog nhúng trong __NUXT_DATA__ của trang
// chủ) thành sources/aniimo.json: tên, hệ, giai đoạn tiến hóa, mô tả. Tiến hóa suy từ thứ tự Aniilog
// (giai đoạn 1 mở chuỗi, giai đoạn sau nối vào dạng gần nhất ở giai đoạn trước, nhiều nhánh cùng giai
// đoạn là nhiều hướng). Chạy: node scripts/data-import/aniimo-fetch.mjs (cần mạng), rồi
// species-batch-import.mjs sources/aniimo.json. Luật ở content-sources-real.md mục "Aniimo".

import { guessRace } from './raceGuess.mjs'
import { existingSpecies, unifyChainRaces, writeSource } from './sourceHelpers.mjs'

const HEADERS = { 'User-Agent': 'Mozilla/5.0 creature-collector-data-import/1.0' }
const ELEMENTS = {
  'attributes-fire': 'fire',
  'attributes-water': 'water',
  'attributes-grass': 'grass',
  'attributes-wind': 'flying',
  'attributes-electric': 'electric',
  'attributes-ice': 'ice',
  'attributes-rock': 'rock',
  'attributes-dark': 'dark',
  'attributes-holy': 'light'
}
/** Giai đoạn → bậc và level tiến hóa tới giai đoạn đó. */
const STAGES = {
  1: { tier: 'small', level: 1 },
  2: { tier: 'medium', level: 16 },
  3: { tier: 'peak', level: 32 }
}

const html = await (await fetch('https://wiki.aniimo.com/', { headers: HEADERS })).text()
const raw = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1]
if (!raw) throw new Error('Không thấy __NUXT_DATA__ trên wiki.aniimo.com')
const data = JSON.parse(raw)
/** Dữ liệu Nuxt dạng phẳng: giá trị là chỉ số vào mảng gốc (mảng thì giải từng phần tử). */
const resolve = (i) => {
  const value = data[i]
  return Array.isArray(value) ? value.map(resolve) : value
}
const entries = []
const seen = new Set()
for (const value of data) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('entryId' in value)) continue
  const name = resolve(value.name)
  if (seen.has(name)) continue
  seen.add(name)
  entries.push({
    name,
    stage: Number(resolve(value.currentStage)) || 1,
    elements: [resolve(value.attributes)]
      .flat()
      .map((a) => ELEMENTS[a])
      .filter(Boolean),
    flavor: resolve(value.description)
  })
}

// Tiến hóa: mỗi dạng giai đoạn > 1 nối vào dạng gần nhất phía trước có giai đoạn thấp hơn.
const evolutions = new Map()
for (let i = 0; i < entries.length; i++) {
  const entry = entries[i]
  if (entry.stage <= 1) continue
  for (let j = i - 1; j >= 0 && entries[j].stage <= entry.stage; j--) {
    if (entries[j].stage < entry.stage) {
      const list = evolutions.get(entries[j].name) ?? []
      list.push({ name: entry.name, level: STAGES[entry.stage]?.level ?? 32 })
      evolutions.set(entries[j].name, list)
      break
    }
  }
}
const existing = existingSpecies('aniimo')
const species = entries.map((entry) => ({
  name: entry.name,
  elements: entry.elements.length > 0 ? [...new Set(entry.elements)].slice(0, 2) : ['normal'],
  raceId:
    existing.get(entry.name.toLowerCase())?.raceId ??
    guessRace([entry.name, entry.flavor], null) ??
    'mythicBeast',
  tier: STAGES[entry.stage]?.tier ?? 'peak',
  evolutions: evolutions.get(entry.name) ?? [],
  flavor: entry.flavor
}))
unifyChainRaces(species, existing)
writeSource('aniimo', { source: 'aniimo', origin: 'fantasy', species })
