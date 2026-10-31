/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải quái Monster Sanctuary (monster-sanctuary.fandom.com: bảng Template:Monsters + mục "Bio" của
// từng trang) thành sources/monsterSanctuary.json. Chạy: node scripts/data-import/monster-sanctuary-fetch.mjs
// (cần mạng), rồi species-batch-import.mjs sources/monsterSanctuary.json.

import { guessRace } from './raceGuess.mjs'
import {
  existingSpecies,
  infoboxParams,
  pagesWikitext,
  plainText,
  wikiApi,
  writeSource
} from './sourceHelpers.mjs'

const api = wikiApi('https://monster-sanctuary.fandom.com/api.php')
const TYPE_ELEMENT = {
  dragon: 'dragon',
  spirit: 'ghost',
  plant: 'grass',
  insect: 'bug',
  construct: 'steel',
  demon: 'dark',
  aquatic: 'water',
  bird: 'flying',
  slime: 'poison',
  occult: 'psychic',
  mage: 'psychic',
  warrior: 'fighting',
  goblin: 'dark',
  beast: 'normal'
}
/** Loại quái → race (thứ tự là ưu tiên khi quái có nhiều loại). */
const TYPE_RACE = [
  ['dragon', 'westernDragon'],
  ['bird', 'bird'],
  ['insect', 'insectoid'],
  ['aquatic', 'fish'],
  ['plant', 'flower'],
  ['slime', 'slime'],
  ['construct', 'golem'],
  ['goblin', 'goblin'],
  ['demon', 'fiend'],
  ['spirit', 'natureSpirit'],
  ['beast', 'wildBeast'],
  ['occult', 'eldritch']
]
const ATTACK_ELEMENT = {
  fire: 'fire',
  water: 'water',
  wind: 'flying',
  earth: 'ground',
  neutral: 'normal'
}
const TIER_TOTAL = { small: 290, medium: 420, peak: 520, large: 560, mythic: 630 }
/** Số thứ tự trong Bestiary ≤ này là quái khu đầu (bậc nhỏ). */
const EARLY_NUMBER = 20

const body = await api({ action: 'parse', page: 'Template:Monsters', prop: 'wikitext' })
const table = body?.parse?.wikitext?.['*'] ?? ''
const blocks = [...table.matchAll(/\n\|([^=\n|]+)=\s*\n\{\{Monster([\s\S]*?)\n\}\}/g)].filter(
  (m) => m[1].trim() !== 'Name' && m[1].trim() !== 'TEST'
)
const texts = await pagesWikitext(
  api,
  blocks.map((m) => m[1].trim())
)
const existing = existingSpecies('monsterSanctuary')
const species = blocks.map((m) => {
  const name = m[1].trim()
  const p = infoboxParams(m[2])
  const types = [p.type1, p.type2, p.type3].filter(Boolean).map((t) => t.toLowerCase())
  const attacks = [p.atk1, p.atk2].filter(Boolean).map((a) => a.toLowerCase())
  const elements = [
    ...types.map((t) => TYPE_ELEMENT[t]),
    ...attacks.map((a) => ATTACK_ELEMENT[a])
  ].filter(Boolean)
  const number = Number(p.num) || 0
  const tier =
    p.special === 'champion' ? 'peak' : number > 0 && number <= EARLY_NUMBER ? 'small' : 'medium'
  const n = (key) => Number(p[key]) || 1
  const shape = {
    hp: n('health'),
    attack: n('atk'),
    defense: n('def'),
    spAttack: n('mag'),
    spDefense: (n('def') + n('mag')) / 2,
    speed: n('mana')
  }
  const sum = Object.values(shape).reduce((a, b) => a + b, 0)
  const stats = Object.fromEntries(
    Object.entries(shape).map(([k, v]) => [
      k,
      Math.max(1, Math.round((v * TIER_TOTAL[tier]) / sum))
    ])
  )
  const bio = /===\s*Bio\s*===\s*\n([^\n]+)/.exec(texts.get(name) ?? '')?.[1]
  return {
    name,
    elements: [...new Set(elements)].slice(0, 2).length
      ? [...new Set(elements)].slice(0, 2)
      : ['normal'],
    raceId:
      existing.get(name.toLowerCase())?.raceId ??
      guessRace([name], null) ??
      TYPE_RACE.find(([type]) => types.some((t) => t.includes(type)))?.[1] ??
      'mythicBeast',
    stats,
    tier,
    catchRate: tier === 'peak' ? 20 : tier === 'small' ? 60 : 40,
    category: types.length
      ? `${types.map((t) => t[0].toUpperCase() + t.slice(1)).join(' ')} Monster`
      : undefined,
    flavor: bio ? plainText(bio) : undefined
  }
})
writeSource('monsterSanctuary', {
  source: 'monsterSanctuary',
  origin: 'fantasy',
  update: { elements: true, stats: true },
  species
})
