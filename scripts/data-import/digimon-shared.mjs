/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quy đổi Digimon dùng chung cho digimon-fetch.mjs (digi-api) và digimon-cs-fetch.mjs (Digimon Story:
// Cyber Sleuth): cấp → bậc, thuộc tính → kiểu chỉ số, type / field → hệ, luật loại thần Olympus XII.

/** Cấp → bậc chỉ số (content-sources-more.md) và level tiến hóa tới cấp đó. */
export const LEVELS = {
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
export const DEFAULT_LEVEL = LEVELS.Unknown

/** Thuộc tính → kiểu chỉ số. */
export const STYLE_BY_ATTRIBUTE = {
  Vaccine: 'balanced',
  Data: 'caster',
  Virus: 'bruiser',
  Free: 'fast',
  Variable: 'hunter'
}

/** Từ khóa trên type → hệ (thứ tự là ưu tiên). */
export const TYPE_ELEMENTS = [
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
export const FIELD_ELEMENTS = {
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
export const OLYMPUS =
  /^(Apollomon|Dianamon|Minervamon|Marsmon|Mercurymon|Neptunemon|Junomon|Ceresmon|Vulcanusmon|Venusmon|Jupitermon|Bacchusmon|Plutomon)/

/** Hệ theo type rồi field (tối đa 2), không có thì Thường. */
export function elementsOf(entry) {
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
