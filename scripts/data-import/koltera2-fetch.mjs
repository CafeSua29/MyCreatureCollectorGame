/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải 120 creature của Koltera 2 từ dữ liệu wiki cộng đồng (github.com/ardelato/k2-wiki,
// src/data/creatures.json, đối chiếu game v5.4) thành sources/koltera2.json. Chạy:
// node scripts/data-import/koltera2-fetch.mjs (cần mạng), rồi species-batch-import.mjs sources/koltera2.json.
// Luật ở content-sources-real.md mục "Koltera 2".

import { guessRace } from './raceGuess.mjs'
import { existingSpecies, fetchJson, writeSource } from './sourceHelpers.mjs'

const URL_CREATURES =
  'https://raw.githubusercontent.com/ardelato/k2-wiki/HEAD/src/data/creatures.json'
/** Hệ Koltera (4 hệ) → hệ game. */
const ELEMENTS = { Wind: 'flying', Earth: 'ground', Fire: 'fire', Water: 'water' }
/** Tier 0–5 của game (T1–T6) → bậc; tổng 6 chỉ số của bậc đó. */
const TIERS = ['small', 'small', 'medium', 'medium', 'peak', 'large']
const TIER_TOTAL = { small: 290, medium: 420, peak: 520, large: 560 }

const creatures = await fetchJson(URL_CREATURES)
if (!Array.isArray(creatures)) throw new Error('Không tải được creatures.json của k2-wiki')
const existing = existingSpecies('koltera2')
/** Wiki còn nhiều mô tả giữ chỗ chưa viết: không nhập làm chữ Dex. */
const realText = (text) => (text && !/^Placeholder/i.test(text) ? text : undefined)
const species = creatures.map((c) => {
  const flavor = realText(c.description)
  const tier = TIERS[c.tier] ?? 'medium'
  const s = c.stats
  // Koltera không có HP: sức bền (grit) làm cả HP lẫn thủ; trí (smarts) làm đặc công / đặc thủ.
  const shape = {
    hp: s.grit,
    attack: s.power,
    defense: s.grit,
    spAttack: s.smarts,
    spDefense: (s.smarts + s.grit) / 2,
    speed: s.agility
  }
  const sum = Object.values(shape).reduce((a, b) => a + b, 0)
  return {
    name: c.name,
    elements: [...new Set(c.types.map((t) => ELEMENTS[t]).filter(Boolean))].slice(0, 2),
    raceId:
      existing.get(c.name.toLowerCase())?.raceId ??
      guessRace([c.name, flavor], null) ??
      'mythicBeast',
    stats: Object.fromEntries(
      Object.entries(shape).map(([k, v]) => [
        k,
        Math.max(1, Math.round((v * TIER_TOTAL[tier]) / sum))
      ])
    ),
    tier,
    category: `T${c.tier + 1} ${c.types.join(' / ')} creature`,
    flavor
  }
})
writeSource('koltera2', { source: 'koltera2', origin: 'fantasy', species })
