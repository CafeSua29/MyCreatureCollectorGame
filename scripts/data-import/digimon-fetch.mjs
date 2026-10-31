/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Chuyển scripts/data-import/digimon-source.json (digimon-source-fetch.mjs tải từ digi-api.com) thành
// file nguồn chuẩn hóa sources/digimon.json. Chạy: node scripts/data-import/digimon-fetch.mjs, rồi
// species-batch-import.mjs sources/digimon.json. Luật ở content-sources-more.md mục "Dữ liệu nguồn thật".

import { readFileSync } from 'node:fs'
import { DIGIMON_ALIASES } from './digimon-aliases.mjs'
import { digimonTypeRace, guessRace } from './raceGuess.mjs'
import { existingSpecies, writeSource } from './sourceHelpers.mjs'

const { digimon } = JSON.parse(
  readFileSync(new URL('./digimon-source.json', import.meta.url), 'utf8')
)

/** Cấp → bậc chỉ số (content-sources-more.md) và level tiến hóa tới cấp đó. */
const LEVELS = {
  'Baby I': { tier: 'baby', rank: 0, evolveAt: 1 },
  'Baby II': { tier: 'baby', rank: 1, evolveAt: 5 },
  Child: { tier: 'small', rank: 2, evolveAt: 10 },
  Adult: { tier: 'medium', rank: 3, evolveAt: 20 },
  Armor: { tier: 'medium', rank: 3, evolveAt: 20 },
  Hybrid: { tier: 'peak', rank: 4, evolveAt: 32 },
  Perfect: { tier: 'peak', rank: 4, evolveAt: 32 },
  Ultimate: { tier: 'large', rank: 5, evolveAt: 46 },
  Unknown: { tier: 'medium', rank: 3, evolveAt: 20 }
}
const DEFAULT_LEVEL = LEVELS.Unknown

/** Thuộc tính → kiểu chỉ số. */
const STYLE_BY_ATTRIBUTE = {
  Vaccine: 'balanced',
  Data: 'caster',
  Virus: 'bruiser',
  Free: 'fast',
  Variable: 'hunter'
}

/** Từ khóa trên type → hệ (thứ tự là ưu tiên). */
const TYPE_ELEMENTS = [
  [/dragon/i, 'dragon'],
  [/angel|holy|god man|seraph|cherub/i, 'light'],
  [/demon|evil|fallen|dark/i, 'dark'],
  [/undead|ghost|ghoul|skeleton/i, 'ghost'],
  [/machine|cyborg|android|armor|weapon|puppet|card/i, 'steel'],
  [/insect/i, 'bug'],
  [/bird/i, 'flying'],
  [/plant|vegetation|flower|fruit|food/i, 'grass'],
  [/fire|flame|lava/i, 'fire'],
  [/ice|snow/i, 'ice'],
  [/aquatic|sea|fish|mollusk|crustacean|amphibian|marine/i, 'water'],
  [/mineral|rock|stone|crystal/i, 'rock'],
  [/fairy|bewitching/i, 'fairy'],
  [/wizard|unknown|mutation|enhancement|unique/i, 'psychic'],
  [/warrior|knight|man\b/i, 'fighting'],
  [/poison|toxic/i, 'poison'],
  [/electric|thunder/i, 'electric'],
  [/reptile|dinosaur/i, 'fire'],
  [/beast|mammal|lesser|slime|animal/i, 'normal']
]
const FIELD_ELEMENTS = {
  'Nature Spirits': 'ground',
  'Deep Savers': 'water',
  'Nightmare Soldiers': 'dark',
  'Wind Guardians': 'flying',
  'Metal Empire': 'steel',
  'Virus Busters': 'light',
  "Dragon's Roar": 'dragon',
  'Jungle Troopers': 'bug',
  'Dark Area': 'ghost',
  Unknown: 'psychic'
}

/** Thần Olympus XII: thần dạng người có tên riêng (luật loại trừ ở content-data.md). */
const OLYMPUS =
  /^(Apollomon|Dianamon|Minervamon|Marsmon|Mercurymon|Neptunemon|Junomon|Ceresmon|Vulcanusmon|Venusmon|Jupitermon|Bacchusmon|Plutomon)/

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

function elementsOf(entry) {
  const result = []
  for (const type of entry.types) {
    const hit = TYPE_ELEMENTS.find(([pattern]) => pattern.test(type))
    if (hit && !result.includes(hit[1])) result.push(hit[1])
  }
  for (const field of entry.fields) {
    const element = FIELD_ELEMENTS[field]
    if (element && !result.includes(element)) result.push(element)
  }
  return result.length > 0 ? result.slice(0, 2) : ['normal']
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
