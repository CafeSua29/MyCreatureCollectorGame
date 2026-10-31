// Tải Yaoling (Yaoling: Mythical Journey; bảng "List" của trang Yaolings trên yaoling.wiki.gg) thành
// sources/yaoling.json. Bảng theo thứ tự chuỗi tiến hóa: dòng có "Level N" tiến hóa thành dòng thường
// kế tiếp; dạng quỷ (Demon) cần Evolution Crystal (game này chưa có) nên là loài riêng. Hệ theo loại
// sát thương trong mô tả kỹ năng. Chạy: node scripts/data-import/yaoling-fetch.mjs (cần mạng).

import { guessRace } from './raceGuess.mjs'
import { plainText, wikiApi, writeSource } from './sourceHelpers.mjs'

const api = wikiApi('https://yaoling.wiki.gg/api.php')
/** Loại sát thương của game gốc → hệ. */
const DAMAGE_ELEMENT = [
  [/fire damage/i, 'fire'],
  [/frost damage/i, 'ice'],
  [/lightning damage/i, 'electric'],
  [/wind damage/i, 'flying'],
  [/poison damage/i, 'poison'],
  [/darkness damage/i, 'dark'],
  [/piercing damage/i, 'normal'],
  [/slash(ing)? damage/i, 'steel'],
  [/concussive damage/i, 'fighting'],
  [/heal|restor/i, 'light']
]
const STAGE_TIER = ['small', 'medium', 'peak', 'large']

const body = await api({ action: 'parse', page: 'Yaolings', prop: 'wikitext' })
const text = body?.parse?.wikitext?.['*'] ?? ''
const rows = text
  .split(/\n\|-\s*\n/)
  .slice(1)
  .map((row) =>
    row
      .split('\n')
      .filter((line) => line.startsWith('|'))
      .map((line) => line.slice(1).trim())
  )
  .filter((cells) => cells.length >= 7 && /^\d+$/.test(cells[0]))

const species = []
let stage = 0
let previous = null
for (const cells of rows) {
  const [, nameCell, , , description, evolution] = cells
  const isDemon = /\[\[Demon\]\]/.test(nameCell)
  const name = plainText(nameCell.replace(/\(\[\[Demon\]\]\)/, '')).trim()
  const elements = DAMAGE_ELEMENT.filter(([pattern]) => pattern.test(description)).map(([, e]) => e)
  if (!isDemon) stage = previous?.level ? stage + 1 : 0
  const tier = isDemon ? 'large' : STAGE_TIER[Math.min(stage, 2)]
  const entry = {
    name,
    elements: elements.length ? [...new Set(elements)].slice(0, 2) : ['normal'],
    raceId: guessRace([name], 'mythicBeast'),
    tier,
    evolutions: [],
    category: isDemon ? 'Demon Yaoling' : 'Yaoling'
  }
  // Dòng trước có "Level N" thì tiến hóa thành dòng này (dạng quỷ không nối, cần crystal).
  if (!isDemon && previous?.level) previous.entry.evolutions.push({ name, level: previous.level })
  if (!isDemon) {
    const level = Number(/Level\s*(\d+)/i.exec(evolution)?.[1] ?? 0)
    previous = { entry, level }
  }
  species.push(entry)
}
// Cả chuỗi chung race của dạng đầu.
for (const entry of species) {
  for (const evolution of entry.evolutions) {
    const target = species.find((s) => s.name === evolution.name)
    if (target) target.raceId = entry.raceId
  }
}
writeSource('yaoling', {
  source: 'yaoling',
  origin: 'fantasy',
  update: { evolutions: 'add' },
  species
})
