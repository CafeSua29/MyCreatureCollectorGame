/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Chuyển scripts/data-import/digimon-source.json (digimon-source-fetch.mjs tải từ digi-api.com) thành
// file nguồn chuẩn hóa sources/digimon.json. Chạy: node scripts/data-import/digimon-fetch.mjs, rồi
// species-batch-import.mjs sources/digimon.json. Luật ở content-sources-more.md mục "Dữ liệu nguồn thật".

import { readFileSync } from 'node:fs'
import { DIGIMON_ALIASES } from './digimon-aliases.mjs'
import {
  DEFAULT_LEVEL,
  LEVELS,
  OLYMPUS,
  STYLE_BY_ATTRIBUTE,
  elementsOf
} from './digimon-shared.mjs'
import { digimonTypeRace, guessRace } from './raceGuess.mjs'
import { existingSpecies, writeSource } from './sourceHelpers.mjs'

const { digimon } = JSON.parse(
  readFileSync(new URL('./digimon-source.json', import.meta.url), 'utf8')
)

const norm = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
// Tên tiếng Anh thật (đúng hoa thường) của loài đã có.
const names = JSON.parse(
  readFileSync(new URL('../../src/data/i18n/en/species.json', import.meta.url), 'utf8')
)
/** Tên digi-api (chuẩn hóa) → loài đã có (tên lồng tiếng đổi qua DIGIMON_ALIASES). */
const existingByApiName = new Map()
for (const sp of existingSpecies('digimon').values()) {
  const enName = names[sp.id]
  existingByApiName.set(norm(DIGIMON_ALIASES[enName] ?? enName), sp)
}

/** "Metal Tyranomon" → "MetalTyranomon"; phần trong ngoặc giữ nguyên, cách một dấu cách. */
function displayName(apiName) {
  const match = /^([^(]*?)\s*(\(.*\))?$/.exec(apiName)
  const base = (match?.[1] ?? apiName).replace(/\s+/g, '')
  return match?.[2] ? `${base} ${match[2]}` : base
}

const levelOf = (entry) => entry.levels.map((l) => LEVELS[l]).find(Boolean) ?? DEFAULT_LEVEL

const excluded = []
const kept = digimon.filter((entry) => {
  if (OLYMPUS.test(entry.name.replace(/\s+/g, ''))) {
    excluded.push({ name: entry.name, reason: 'thần Olympus XII (thần dạng người có tên riêng)' })
    return false
  }
  return true
})

const apiNameToEntry = new Map(kept.map((entry) => [norm(entry.name), entry]))
const species = kept.map((entry) => {
  const level = levelOf(entry)
  const sp = existingByApiName.get(norm(entry.name))
  const name = sp ? names[sp.id] : displayName(entry.name)
  const evolutions = []
  for (const nextName of entry.nextEvolutions) {
    const next = apiNameToEntry.get(norm(nextName))
    if (!next) continue
    const nextLevel = levelOf(next)
    // Như game gốc: mọi hướng của digi-api, kể cả đổi chế độ cùng cấp (Dragon Mode → Fighter Mode);
    // chỉ bỏ hướng về cấp thấp hơn (thoái hóa). Hướng tạo vòng lặp bị bỏ lúc nhập.
    if (nextLevel.rank < level.rank) continue
    const target = existingByApiName.get(norm(next.name))
    evolutions.push({
      name: target ? names[target.id] : displayName(next.name),
      level: nextLevel.evolveAt
    })
  }
  return {
    name,
    elements: elementsOf(entry),
    // Race theo type của từng loài (game gốc đổi type khi tiến hóa thì race đổi theo).
    raceId: digimonTypeRace(entry.types) ?? sp?.raceId ?? guessRace([entry.name], 'eldritch'),
    tier: level.tier,
    style: STYLE_BY_ATTRIBUTE[entry.attributes[0]] ?? 'balanced',
    evolutions,
    category: entry.types[0] ? `${entry.types[0]} Digimon` : undefined,
    flavor: entry.description
      ? entry.description
          .split(/(?<=\.)\s/)
          .slice(0, 3)
          .join(' ')
      : undefined
  }
})
// Race theo từng loài (không gom theo chuỗi); loài đã có cũng đổi race theo type.
writeSource('digimon', {
  source: 'digimon',
  origin: 'fantasy',
  update: { race: true, evolutions: 'add' },
  species,
  excluded
})
