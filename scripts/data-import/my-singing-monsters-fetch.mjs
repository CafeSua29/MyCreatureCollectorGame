// Tải quái My Singing Monsters (mysingingmonsters.fandom.com: các category quái gốc + Wublin, Celestial,
// Dipster, Titansoul; không lấy bản Rare / Epic chỉ khác màu) thành sources/mySingingMonsters.json. Chạy:
// node scripts/data-import/my-singing-monsters-fetch.mjs (cần mạng), rồi
// species-batch-import.mjs sources/mySingingMonsters.json. Luật ở content-sources-real.md mục "My Singing Monsters".

import { guessRace } from './raceGuess.mjs'
import {
  categoryMembers,
  existingSpecies,
  infoboxParams,
  pagesWikitext,
  plainText,
  wikiApi,
  writeSource
} from './sourceHelpers.mjs'

const api = wikiApi('https://mysingingmonsters.fandom.com/api.php')
/** Nguyên tố My Singing Monsters → hệ game (nguyên tố không có hệ tương ứng thì bỏ qua). */
const ELEMENTS = {
  plant: 'grass',
  cold: 'ice',
  air: 'flying',
  water: 'water',
  earth: 'ground',
  fire: 'fire',
  light: 'light',
  psychic: 'psychic',
  faerie: 'fairy',
  bone: 'ghost',
  plasma: 'electric',
  electricity: 'electric',
  shadow: 'dark',
  mech: 'steel',
  crystal: 'glass',
  poison: 'poison',
  legendary: 'dragon',
  mythical: 'fairy',
  celestial: 'light',
  dipster: 'normal',
  titansoul: 'rock',
  // Nguyên tố Paironormal (ma quái): Control / Hoax / Ruin / Depths.
  control: 'psychic',
  hoax: 'ghost',
  ruin: 'dark',
  depths: 'water',
  dream: 'psychic'
}
/** Lớp mà nguyên tố là tên mùa / không có nguyên tố (Seasonal, Primordial) → hệ theo lớp. */
const CLASS_ELEMENTS = {
  'core seasonal': ['fairy'],
  'aux. seasonal': ['fairy'],
  primordial: ['dragon'],
  paironormal: ['ghost']
}
/** Lớp quái → bậc cố định; lớp không có ở đây thì bậc theo số nguyên tố. */
const CLASS_TIER = {
  legendary: 'large',
  werdo: 'large',
  mythical: 'mythic',
  celestial: 'mythic',
  titansoul: 'mythic',
  primordial: 'peak',
  wublin: 'peak',
  dipster: 'peak',
  seasonal: 'peak',
  'core seasonal': 'peak',
  'aux. seasonal': 'peak',
  shugafam: 'peak',
  supernatural: 'peak',
  paironormal: 'peak'
}
const TIER_BY_ELEMENT_COUNT = ['small', 'small', 'medium', 'peak', 'large', 'large']

/** Category gom đủ quái (mỗi category chỉ phủ một phần; bản Rare / Epic lọc theo tiền tố tên). */
const CATEGORIES = [
  'Common Monsters',
  'Instrumental Monsters',
  'Vocalist Monsters',
  'Celestials',
  'Wublin Island',
  'Dipsters',
  'Titansouls',
  'Shugabush Island'
]
/** Trang tổng hợp một nhóm quái (có infobox của nhóm), không phải một quái. */
const GROUP_PAGES = new Set(['Wublins', 'Glowbes', 'Dipsters', 'Shugafam', 'Werdos', 'Celestials'])
/** Celestial con lớn lên thành dạng "Adult X" (level như tiến hóa bậc 2 của game). */
const ADULT_LEVEL = 30

const titles = [
  ...new Set((await Promise.all(CATEGORIES.map((c) => categoryMembers(api, c)))).flat())
].filter((title) => !/^(Rare|Epic) |^Monster Names|\//.test(title))
const texts = await pagesWikitext(api, titles)
const existing = existingSpecies('mySingingMonsters')

const species = []
const excluded = []
for (const title of titles) {
  const text = texts.get(title)
  const box = text ? /\{\{Infobox[ _]Monster([\s\S]*?)\n\}\}/i.exec(text) : null
  if (!box) {
    excluded.push({ name: title, reason: 'không có infobox quái' })
    continue
  }
  const p = infoboxParams(box[1])
  const rawElements = ['element1', 'element2', 'element3', 'element4', 'element5']
    .map((key) => plainText(p[key] ?? '').toLowerCase())
    .filter(Boolean)
  const elements = [...new Set(rawElements.map((e) => ELEMENTS[e]).filter(Boolean))]
  // "Fire Monsters{{!}}Fire" → "fire"
  const monsterClass = plainText((p.class ?? '').split('{{!}}').pop()).toLowerCase()
  const bio = /\{\{Quote\|([^|]+)\|Monster Bio\}\}/.exec(text)?.[1]
  const flavor = bio ? plainText(bio) : undefined
  // Trang nhóm (Dipsters, Shugafam, Wublins, Glowbes...) cũng có infobox: không có lớp, hoặc tên là
  // tên nhóm số nhiều.
  if (!monsterClass || GROUP_PAGES.has(title)) {
    excluded.push({ name: title, reason: 'trang nhóm, không phải một quái' })
    continue
  }
  if (elements.length === 0 && CLASS_ELEMENTS[monsterClass])
    elements.push(...CLASS_ELEMENTS[monsterClass])
  species.push({
    name: title,
    elements: elements.length > 0 ? elements.slice(0, 2) : ['normal'],
    raceId:
      existing.get(title.toLowerCase())?.raceId ??
      guessRace([title, flavor], null) ??
      'mythicBeast',
    tier:
      CLASS_TIER[monsterClass] ??
      TIER_BY_ELEMENT_COUNT[Math.min(rawElements.length, TIER_BY_ELEMENT_COUNT.length - 1)],
    evolutions: titles.includes(`Adult ${title}`)
      ? [{ name: `Adult ${title}`, level: ADULT_LEVEL }]
      : [],
    category: monsterClass
      ? `${monsterClass[0].toUpperCase()}${monsterClass.slice(1)} Monster`
      : undefined,
    flavor
  })
}
writeSource('mySingingMonsters', {
  source: 'mySingingMonsters',
  origin: 'fantasy',
  // Bỏ loài không còn trong file (trang nhóm Wublins / Glowbes từng bị nhập nhầm).
  prune: true,
  species,
  excluded
})
