/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải quái Monster Rancher (monsterrancher.fandom.com: mọi trang Category:Monsters dùng {{Monster}})
// thành sources/monsterRancher.json. Giống gốc (main breed) có `element`; giống phụ có
// `breed = [[Gốc]] / [[Phụ]]` và lấy hệ / race theo hai giống. Chạy:
// node scripts/data-import/monster-rancher-fetch.mjs (cần mạng), rồi species-batch-import.mjs.

import { guessRace } from './raceGuess.mjs'
import {
  categoryMembers,
  existingSpecies,
  infoboxParams,
  pagesWikitext,
  plainText,
  writeSource,
  wikiApi
} from './sourceHelpers.mjs'

const api = wikiApi('https://monsterrancher.fandom.com/api.php')
const ELEMENT = {
  fire: 'fire',
  water: 'water',
  wind: 'flying',
  earth: 'ground',
  plant: 'grass',
  light: 'light',
  dark: 'dark',
  lightning: 'electric',
  ice: 'ice',
  metal: 'steel',
  poison: 'poison'
}
const TYPE_ELEMENT = { mecha: 'steel', fanciful: 'fairy', beast: 'normal', spirit: 'ghost' }

// Trang "(Anime)" / "(Manga)" là nhân vật có tên riêng trong phim / truyện (luật loại trừ).
const titles = (await categoryMembers(api, 'Monsters')).filter((t) => !/\((Anime|Manga)\)/.test(t))
const texts = await pagesWikitext(api, titles)
const existing = existingSpecies('monsterRancher')

const linkNames = (value) => [...String(value).matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1].trim())
const quoteOf = (wikitext) => /\|\s*"([^"\n]{20,})"/.exec(wikitext)?.[1]

const main = new Map()
const subs = []
for (const [title, wikitext] of texts) {
  const start = wikitext.search(/\{\{Monster\b/)
  if (start < 0) continue
  const params = infoboxParams(wikitext.slice(start, start + 1500))
  if (params.element && !params.breed) {
    const elements = plainText(params.element)
      .toLowerCase()
      .split(/[^a-z]+/)
      .map((e) => ELEMENT[e])
      .filter(Boolean)
    const type = plainText(params.type ?? '').toLowerCase()
    if (TYPE_ELEMENT[type]) elements.push(TYPE_ELEMENT[type])
    const firstSentence = plainText(
      wikitext.slice(wikitext.indexOf("'''"), wikitext.indexOf("'''") + 400)
    )
    main.set(title, {
      name: title,
      elements: [...new Set(elements)].slice(0, 2),
      raceId:
        existing.get(title.toLowerCase())?.raceId ??
        guessRace([title, firstSentence.split('.')[0]], 'mythicBeast'),
      tier: 'small',
      flavor: quoteOf(wikitext)
    })
  } else if (params.breed) {
    const [base, sub] = linkNames(params.breed)
    const own = plainText(params.element ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .map((e) => ELEMENT[e])
      .filter(Boolean)
    if (base) subs.push({ name: title, base, sub, own, flavor: quoteOf(wikitext) })
  }
}
const species = [...main.values()].map((m) => ({
  ...m,
  elements: m.elements.length ? m.elements : ['normal']
}))
const excluded = []
for (const s of subs) {
  const base = main.get(s.base)
  // Giống gốc không có trang giống gốc (trang game / địa danh): vẫn nhập, hệ theo trang, race đoán.
  const second = main.get(s.sub)?.elements[0]
  const baseElements = base?.elements ?? []
  const elements = s.own.length
    ? [...new Set(s.own)].slice(0, 2)
    : [...new Set([baseElements[0], second].filter(Boolean))]
  species.push({
    name: s.name,
    elements: elements.length ? elements : ['normal'],
    raceId:
      existing.get(s.name.toLowerCase())?.raceId ??
      base?.raceId ??
      guessRace([s.name], 'mythicBeast'),
    tier: s.base === s.sub ? 'small' : 'medium',
    category: `${s.base} Breed`,
    flavor: s.flavor
  })
}
writeSource('monsterRancher', { source: 'monsterRancher', origin: 'fantasy', species, excluded })
