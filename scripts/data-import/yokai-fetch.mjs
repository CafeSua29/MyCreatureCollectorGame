/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải Yo-kai (yokaiwatch.fandom.com: mọi trang dùng {{yo-kai}}, cả game chính lẫn game phụ) thành
// sources/yokaiWatch.json. Chạy:
// node scripts/data-import/yokai-fetch.mjs (cần mạng), rồi species-batch-import.mjs sources/yokaiWatch.json.

import {
  existingSpecies,
  infoboxParams,
  pageCategories,
  pagesWikitext,
  plainText,
  unifyChainRaces,
  wikiApi,
  writeSource
} from './sourceHelpers.mjs'

const api = wikiApi('https://yokaiwatch.fandom.com/api.php')

/** Thuộc tính → hệ chính; bộ tộc → hệ phụ. */
const ATTRIBUTE = {
  fire: 'fire',
  water: 'water',
  lightning: 'electric',
  earth: 'ground',
  ice: 'ice',
  wind: 'flying',
  drain: 'dark',
  restoration: 'light'
}
const TRIBE = {
  brave: 'fighting',
  mysterious: 'psychic',
  tough: 'rock',
  charming: 'fairy',
  heartful: 'light',
  shady: 'dark',
  eerie: 'ghost',
  slippery: 'poison',
  wicked: 'dark',
  wandroid: 'steel'
}
/** Rank → bậc chỉ số. */
const RANK_TIER = {
  E: 'small',
  D: 'small',
  C: 'medium',
  B: 'medium',
  A: 'peak',
  S: 'large',
  SS: 'mythic',
  Z: 'mythic',
  SSS: 'mythic'
}
/** Bộ tộc của Diêm Vương (Enma): người cai trị có tên riêng, dạng người (luật loại trừ). */
const EXCLUDED_TRIBES = new Set(['enma'])

async function templatePages() {
  const titles = []
  let cont
  do {
    const body = await api({
      action: 'query',
      list: 'embeddedin',
      eititle: 'Template:Yo-kai',
      eilimit: '500',
      einamespace: '0',
      ...(cont ? { eicontinue: cont } : {})
    })
    titles.push(...(body?.query?.embeddedin ?? []).map((p) => p.title))
    cont = body?.continue?.eicontinue
  } while (cont)
  return titles
}

/** {{stats|…|HP|Str|Spr|Def|Spd|level = 99}} đầu tiên → dáng chỉ số. */
function statShape(wikitext) {
  const match =
    /\{\{stats\|[^}]*?\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*level\s*=\s*99/i.exec(
      wikitext
    )
  if (!match) return null
  const [hp, strength, spirit, defense, speed] = match.slice(1).map(Number)
  // HP của Yo-kai cao gấp khoảng hai lần các chỉ số khác: chia đôi cho cùng thang.
  return {
    hp: hp / 2,
    attack: strength,
    defense,
    spAttack: spirit,
    spDefense: (defense + spirit) / 2,
    speed
  }
}

/** Chuẩn hóa dáng chỉ số về tổng của bậc. */
function scaleTo(shape, total) {
  const sum = Object.values(shape).reduce((a, b) => a + b, 0)
  return Object.fromEntries(
    Object.entries(shape).map(([k, v]) => [k, Math.max(1, Math.round((v * total) / sum))])
  )
}
const TIER_TOTAL = { small: 290, medium: 420, peak: 520, large: 560, mythic: 630 }

const titles = await templatePages()
const texts = await pagesWikitext(api, titles)
const categories = await pageCategories(api, [...texts.keys()])
/**
 * Category "<nhóm> Characters" thuộc chính loạt Yo-kai Watch (giới tính, anime, Jam, Shadowside, truyện
 * gốc của Puni Puni...). Category "<nhóm> Characters" khác là nhân vật collab mượn từ tác phẩm khác
 * (Hololive, Re:Zero, Inuyasha, Level-5 Crossover...) và "Humans" là loài người có tên: luật loại trừ
 * nhân vật độc nhất.
 */
const OWN_CHARACTER_CATEGORIES = new Set([
  'Characters',
  'Male Characters',
  'Female Characters',
  'Gender Neutral Characters',
  'Humanoid Characters',
  'Deceased Characters',
  'Scrapped Characters',
  'Anime Characters',
  'Main Anime Characters',
  'Jam Characters',
  'Shadowside Characters',
  'Punigami no Yami Characters',
  'Ginga Watch Characters',
  'Half-Demon Dragon Slayer Characters',
  'Half-Demon Dragon Slayer 2 Characters'
])
// Dạng Jibanyan hóa trang theo collab (Chocobonyan, Terminyanator...) là Yo-kai, không phải nhân vật
// của tác phẩm khác: giữ.
const isBorrowedCharacter = (title) =>
  !/nyan/i.test(title) &&
  (categories.get(title) ?? []).some(
    (c) =>
      c === 'Humans' ||
      (/ Characters$/.test(c.replace(/_/g, ' ')) &&
        !OWN_CHARACTER_CATEGORIES.has(c.replace(/_/g, ' ')))
  )
const existing = existingSpecies('yokaiWatch')
const excluded = []
const species = []
for (const [title, wikitext] of texts) {
  const start = wikitext.search(/\{\{yo-kai/i)
  if (start < 0) continue
  const params = infoboxParams(wikitext.slice(start, start + 4000))
  const name = plainText(params.name || title)
  const tribe = (params.tribe ?? '').toLowerCase().trim()
  if (isBorrowedCharacter(title)) {
    excluded.push({ name, reason: 'nhân vật có tên riêng mượn từ tác phẩm khác / loài người' })
    continue
  }
  if (EXCLUDED_TRIBES.has(tribe)) {
    excluded.push({ name, reason: 'bộ tộc Enma (người cai trị dạng người có tên riêng)' })
    continue
  }
  const attribute = (params.attribute ?? '').toLowerCase().replace(/[^a-z]/g, '')
  const rank = (
    /rank\s*=\s*([A-Z]+)/.exec(wikitext.slice(start, start + 4000))?.[1] ??
    params['rank-yk'] ??
    'C'
  ).trim()
  const elements = [ATTRIBUTE[attribute], TRIBE[tribe]].filter(Boolean)
  const tier = RANK_TIER[rank] ?? 'medium'
  const shape = statShape(wikitext)
  const evolutions = [
    ...wikitext.matchAll(/evolves? into \[\[([^\]|]+)(?:\|[^\]]*)?\]\][^.\n]{0,60}?level (\d+)/gi)
  ].map((m) => ({ name: plainText(m[1]), level: Number(m[2]) }))
  const quote = /\{\{medallium\|[^|]*\|([^}]*)\}\}/.exec(wikitext)?.[1]
  species.push({
    name,
    elements: elements.length ? [...new Set(elements)] : ['normal'],
    raceId: 'yokai',
    ...(shape ? { stats: scaleTo(shape, TIER_TOTAL[tier]) } : { tier }),
    tier,
    evolutions,
    category: tribe ? `${tribe[0].toUpperCase()}${tribe.slice(1)} Yo-kai` : undefined,
    flavor: quote ? plainText(quote).replace(/^[“"]|[”"]$/g, '') : undefined
  })
}
species.sort((a, b) => a.name.localeCompare(b.name))
unifyChainRaces(species, existing)
writeSource('yokaiWatch', {
  source: 'yokaiWatch',
  origin: 'fantasy',
  update: { evolutions: 'add' },
  prune: true,
  species,
  excluded
})
