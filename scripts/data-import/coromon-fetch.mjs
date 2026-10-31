// Tải Coromon (coromon.wiki.gg: trang Category:Coromon dùng {{CoromonPage}}) thành sources/coromon.json:
// hệ và tiến hóa theo level lấy từ câu mở đầu ("is a [[Ghost Type]] Coromon ... evolves into [[X]] at
// level N"), mô tả từ mục biology. Loài đã có chỉ được thêm hướng tiến hóa còn thiếu; loài thiếu (kể cả
// loài từng bỏ vì trùng tên loài khác, như Purrghast) được thêm. Chạy:
// node scripts/data-import/coromon-fetch.mjs (cần mạng), rồi species-batch-import.mjs sources/coromon.json.

import { guessRace } from './raceGuess.mjs'
import {
  categoryMembers,
  existingSpecies,
  pagesWikitext,
  plainText,
  unifyChainRaces,
  wikiApi,
  writeSource
} from './sourceHelpers.mjs'

const api = wikiApi('https://coromon.wiki.gg/api.php')
/** Hệ Coromon → hệ game. */
const TYPES = {
  normal: 'normal',
  fire: 'fire',
  water: 'water',
  ice: 'ice',
  electric: 'electric',
  magic: 'psychic',
  ghost: 'ghost',
  poison: 'poison',
  ground: 'ground',
  sand: 'ground',
  air: 'flying',
  foul: 'dark',
  dark: 'dark',
  heat: 'fire',
  cut: 'steel',
  fighting: 'fighting',
  crimsonite: 'dragon',
  dragon: 'dragon',
  wind: 'flying',
  insect: 'bug'
}
const STAGE_TIER = ['small', 'medium', 'peak']

// Trang dịch ("Cubzero/es") không phải loài.
const titles = (await categoryMembers(api, 'Coromon')).filter((t) => !t.includes('/'))
const texts = await pagesWikitext(api, titles)
const existing = existingSpecies('coromon')
const species = []
for (const [title, wikitext] of texts) {
  if (!/\{\{CoromonPage/i.test(wikitext)) continue
  const intro = /\|intro=\s*([\s\S]*?)\n\|/.exec(wikitext)?.[1] ?? ''
  const types = [...intro.matchAll(/\[\[(\w+) Type\]\]/g)].map((m) => TYPES[m[1].toLowerCase()])
  const evolutions = [
    ...intro.matchAll(/evolves into \[\[([^\]|]+)(?:\|[^\]]*)?\]\][^.]*?level (\d+)/gi)
  ].map((m) => ({ name: m[1].trim(), level: Number(m[2]) }))
  const hasPrevious = /evolves from \[\[/i.test(intro)
  const biology = /\|biology=\s*([^\n|]+)/.exec(wikitext)?.[1]
  species.push({
    name: title,
    elements: types.filter(Boolean).length ? [...new Set(types.filter(Boolean))] : ['normal'],
    raceId: existing.get(title.toLowerCase())?.raceId ?? guessRace([title], 'mythicBeast'),
    tier: STAGE_TIER[hasPrevious ? (evolutions.length ? 1 : 2) : 0],
    evolutions,
    flavor: biology ? plainText(biology) : undefined
  })
}
unifyChainRaces(species, existing)
writeSource('coromon', {
  source: 'coromon',
  origin: 'fantasy',
  update: { evolutions: 'add' },
  species
})
