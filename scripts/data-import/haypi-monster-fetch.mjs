/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải quái Haypi Monster (haypi-monster.fandom.com: mọi trang trong các category độ hiếm, có
// {{Template:Monster}}) thành sources/haypiMonster.json. Wiki là của dòng Haypi Monster (bản gốc), nguồn
// danh sách duy nhất cho series (gồm Haypi Monster 3). Chạy: node scripts/data-import/haypi-monster-fetch.mjs
// (cần mạng), rồi species-batch-import.mjs sources/haypiMonster.json. Luật ở content-sources-real.md mục "Haypi Monster".

import { guessRace } from './raceGuess.mjs'
import {
  categoryMembers,
  existingSpecies,
  pageCategories,
  pagesWikitext,
  plainText,
  unifyChainRaces,
  wikiApi,
  writeSource
} from './sourceHelpers.mjs'

const api = wikiApi('https://haypi-monster.fandom.com/api.php')
const RARITY_CATEGORIES = {
  'Common monsters': { tier: 'small', catchRate: 70 },
  'Uncommon monsters': { tier: 'medium', catchRate: 60 },
  'Rare Monsters': { tier: 'medium', catchRate: 40 },
  'Epic monsters': { tier: 'peak', catchRate: 20 },
  'Epic Monsters': { tier: 'peak', catchRate: 20 },
  'Synthesis-obtained monsters': { tier: 'peak', catchRate: 20 },
  'Legendary monsters': { tier: 'mythic', catchRate: 5 }
}
/** Category hệ của wiki → hệ game. */
const ELEMENT_CATEGORIES = {
  Earth: 'ground',
  Plant: 'grass',
  Water: 'water',
  Fire: 'fire',
  Electric: 'electric',
  Ghost: 'ghost',
  Psychic: 'psychic',
  Ice: 'ice',
  Fighting: 'fighting',
  Lava: 'fire'
}

const byTitle = new Map()
for (const [category, rarity] of Object.entries(RARITY_CATEGORIES)) {
  for (const title of await categoryMembers(api, category)) {
    // Độ hiếm cao hơn thắng khi một trang nằm trong nhiều category.
    const old = byTitle.get(title)
    if (!old || old.catchRate > rarity.catchRate) byTitle.set(title, rarity)
  }
}
const titles = [...byTitle.keys()]
const texts = await pagesWikitext(api, titles)
const categories = await pageCategories(api, titles)
const existing = existingSpecies('haypiMonster')

/** "[[Chimp]] - lvl 1" ở các trường first / second / third... của infobox → [tên, level]. */
function stagesOf(text) {
  const stages = []
  for (const match of text.matchAll(
    /\|\s*(?:first|second|third|fourth|fifth)\s*=\s*\[\[([^\]|]+)[^\]]*\]\]\s*-\s*lvl\s*(\d+)/gi
  ))
    stages.push([match[1].trim(), Number(match[2])])
  return stages
}

const species = []
const excluded = []
for (const title of titles) {
  const text = texts.get(title)
  // Trang quái chưa viết (chưa có infobox) vẫn là một quái của game: lấy theo độ hiếm / category.
  if (text === undefined || title === 'More') {
    excluded.push({ name: title, reason: 'không phải trang quái' })
    continue
  }
  const elements = (categories.get(title) ?? []).map((c) => ELEMENT_CATEGORIES[c]).filter(Boolean)
  const flavorLine = /^''([^'\n][^\n]*?)''\s*$/m.exec(text)?.[1]
  const flavor = flavorLine ? plainText(flavorLine) : undefined
  const stages = stagesOf(text)
  const index = stages.findIndex(([name]) => name.toLowerCase() === title.toLowerCase())
  const next = index >= 0 ? stages[index + 1] : undefined
  const rarity = byTitle.get(title)
  species.push({
    name: title,
    elements: elements.length > 0 ? [...new Set(elements)].slice(0, 2) : ['normal'],
    raceId:
      existing.get(title.toLowerCase())?.raceId ??
      guessRace([title, flavor], null) ??
      'mythicBeast',
    tier: rarity.tier,
    catchRate: rarity.catchRate,
    evolutions: next && byTitle.has(next[0]) ? [{ name: next[0], level: next[1] }] : [],
    flavor
  })
}
// Race của chuỗi lấy theo dạng đầu (đứng trước trong danh sách): tên dạng sau dễ trùng từ khóa khác
// ("Champ" là quái hồ Champ trong khi cả chuỗi là tinh tinh).
const evolvedNames = new Set(
  species.flatMap((s) => (s.evolutions ?? []).map((e) => e.name.toLowerCase()))
)
unifyChainRaces(
  [...species].sort(
    (a, b) => evolvedNames.has(a.name.toLowerCase()) - evolvedNames.has(b.name.toLowerCase())
  ),
  existing
)
writeSource('haypiMonster', { source: 'haypiMonster', origin: 'fantasy', species, excluded })
