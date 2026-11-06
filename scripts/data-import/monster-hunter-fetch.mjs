/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải quái Monster Hunter còn thiếu từ các game phụ (Stories 1–3, Explore, Online), bản chính và crossover
// (monsterhunter.fandom.com: liên kết trên trang "<game>: Monsters" có {{Monster_Infobox}}) thành
// sources/monsterHunter.json. Quái đã có (cùng tên) chỉ bổ sung chữ Dex. Chạy:
// node scripts/data-import/monster-hunter-fetch.mjs (cần mạng), rồi species-batch-import.mjs.

import { guessRace } from './raceGuess.mjs'
import {
  existingSpecies,
  infoboxParams,
  pagesWikitext,
  plainText,
  wikiApi,
  writeSource
} from './sourceHelpers.mjs'

const api = wikiApi('https://monsterhunter.fandom.com/api.php')
const LIST_PAGES = [
  'MHST: Monsters',
  'MHST2: Monsters',
  'MHST3: Monsters',
  'MHXR: Monsters',
  'MHO: Monsters',
  // Bản chính: chỉ thêm được quái crossover (Behemoth, Leshen...) và quái bản chính còn thiếu.
  'MHW: Monsters',
  'MHWI: Monsters',
  'MHRise: Monsters',
  'MHRS: Monsters',
  'MHWilds: Monsters',
  'MHGU: Monsters',
  'MH4U: Monsters'
]

/** Lớp quái → [race, hệ theo lớp] (khớp cách đặt race của quái Monster Hunter cũ). */
const CLASS = {
  'flying wyvern': ['wyvern', 'dragon'],
  'bird wyvern': ['birdWyvern', 'flying'],
  'brute wyvern': ['bruteWyvern', 'ground'],
  'fanged wyvern': ['fangedWyvern', 'dark'],
  'piscine wyvern': ['piscineWyvern', 'water'],
  'snake wyvern': ['snakeWyvern', 'poison'],
  'elder dragon': ['elderDragon', 'dragon'],
  'fanged beast': ['fangedBeast', 'normal'],
  leviathan: ['leviathan', 'water'],
  carapaceon: ['carapaceon', 'rock'],
  neopteron: ['neopteron', 'bug'],
  temnoceran: ['arachnid', 'bug'],
  amphibian: ['anuran', 'water'],
  lynian: ['beastfolk', 'normal'],
  herbivore: ['wildBeast', 'normal'],
  fish: ['fish', 'water'],
  construct: ['golem', 'steel'],
  relict: ['ancientCreature', 'rock']
}
const ELEMENT = {
  fire: 'fire',
  water: 'water',
  thunder: 'electric',
  ice: 'ice',
  dragon: 'dragon',
  poison: 'poison',
  blast: 'fire',
  sleep: 'psychic',
  paralysis: 'electric'
}

async function linksOf(page) {
  const body = await api({ action: 'parse', page, prop: 'links' })
  return (body?.parse?.links ?? []).filter((l) => l.ns === 0).map((l) => l['*'])
}

const existing = existingSpecies('monsterHunter')
const candidates = new Set()
for (const page of LIST_PAGES) for (const title of await linksOf(page)) candidates.add(title)
const texts = await pagesWikitext(api, [...candidates])
const species = []
const excluded = []
for (const [title, wikitext] of texts) {
  const start = wikitext.search(/\{\{\s*Monster[_ ]Infobox/i)
  if (start < 0) continue
  const p = infoboxParams(wikitext.slice(start, start + 2500))
  const name = plainText(p.name || title).replace(/}+$/, '')
  const type = plainText(p['monster type'] ?? '')
    .toLowerCase()
    .split('(')[0]
    .trim()
  // Lớp "???" / không rõ (Gore Magala, Estrellian...): vẫn nhập, race đoán theo tên.
  const [raceId, classElement] = CLASS[type] ?? [guessRace([name], 'mythicBeast'), null]
  const elementText = plainText(p.element ?? '').trim()
  // Gốc ghi "None" = quái không nguyên tố (non-elemental): không hệ (data.md mục "Loài không hệ").
  // Quái có nguyên tố ghi bằng template lồng `{{Element|...}}` mà infoboxParams chưa đọc được nên
  // chỉ còn hệ theo lớp (docs/roadmap/biome-content.md mục "Monster Hunter").
  const nonElemental = /^none$/i.test(elementText)
  const elements = nonElemental
    ? []
    : [
        ...elementText
          .toLowerCase()
          .split(/[^a-z]+/)
          .map((e) => ELEMENT[e]),
        classElement
      ].filter(Boolean)
  const size = plainText(p['monster size'] ?? '').toLowerCase()
  const tier = type === 'elder dragon' ? 'large' : size.includes('small') ? 'small' : 'peak'
  const physiology = /==\s*Physiology\s*==\s*\n+([^\n=][^\n]+)/.exec(wikitext)?.[1]
  species.push({
    name,
    elements: nonElemental ? [] : elements.length ? [...new Set(elements)].slice(0, 2) : ['normal'],
    raceId: existing.get(name.toLowerCase())?.raceId ?? raceId,
    tier,
    category: type.replace(/\b\w/g, (c) => c.toUpperCase()),
    flavor: physiology ? plainText(physiology) : undefined
  })
}
writeSource('monsterHunter', { source: 'monsterHunter', origin: 'fantasy', species, excluded })
