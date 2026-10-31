/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Đoán race của loài mới theo từ khóa (cùng bảng với races-split.mjs: Digimon, bổ sung, chung), dùng
// cho các script *-fetch.mjs của đợt "Dữ liệu nguồn thật" (content-sources-more.md).

import { KEYWORDS } from './races-classify.mjs'
import { DIGIMON_KEYWORDS, DIGIMON_TYPE_RACE, EXTRA_KEYWORDS } from './races-extra.mjs'

// Race cũ trùng id nhóm đã đổi id khi tách race (như RENAMED của races-split.mjs).
const RENAMED = {
  shapeshifter: 'changeling',
  demon: 'fiend',
  elemental: 'elementalSpirit',
  aberration: 'eldritch'
}
const renamed = (raceId) => (raceId ? (RENAMED[raceId] ?? raceId) : raceId)
const clean = (words) => words.filter((w) => w.startsWith('-') || !w.includes('-'))
const TABLE = [
  ...Object.entries(DIGIMON_KEYWORDS).map(([raceId, words]) => [raceId, clean(words)]),
  ...Object.entries(EXTRA_KEYWORDS).map(([raceId, words]) => [raceId, clean(words)]),
  ...KEYWORDS.map(([raceId, words]) => [raceId, clean(words)])
]

/** Chữ → các từ thường (tách cả camelCase), kèm số nhiều bỏ "s" và cặp từ ghép. */
export function wordsOf(text) {
  const words = String(text)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
  const singular = words.filter((w) => w.length > 3 && w.endsWith('s')).map((w) => w.slice(0, -1))
  return [...words, ...singular, ...words.slice(1).map((w, i) => words[i] + w)]
}

/** Race đầu tiên trong bảng khớp một từ (mẫu "-x" khớp đuôi từ); không khớp thì null. */
export function keywordRace(words) {
  for (const [raceId, patterns] of TABLE) {
    for (const p of patterns) {
      const hit = p.startsWith('-') ? words.some((w) => w.endsWith(p.slice(1))) : words.includes(p)
      if (hit) return renamed(raceId)
    }
  }
  return null
}

/** Race từ type Digimon (bảng chính thức trước, rồi từ khóa trên chữ của type). */
export function digimonTypeRace(types) {
  for (const type of types) if (DIGIMON_TYPE_RACE[type]) return renamed(DIGIMON_TYPE_RACE[type])
  for (const type of types) {
    const race = keywordRace(wordsOf(type))
    if (race) return race
  }
  return null
}

/** Thứ tự đoán: từng nhóm chữ theo độ tin cậy (tên, phân loại, mô tả), rồi race mặc định. */
export function guessRace(textGroups, fallback) {
  for (const text of textGroups) {
    if (!text) continue
    const race = keywordRace(wordsOf(text))
    if (race) return race
  }
  return renamed(fallback)
}
