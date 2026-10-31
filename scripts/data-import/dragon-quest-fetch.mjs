/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải quái Dragon Quest (dragonquest.fandom.com: trang dùng {{MonsterInfo}}) thành
// sources/dragonQuest.json. Họ quái → hệ chính / race; từ khóa trong tên → hệ phụ; bậc chỉ số theo vị
// trí của quái trong bestiary của game đầu tiên có bảng chỉ số. Chạy:
// node scripts/data-import/dragon-quest-fetch.mjs (cần mạng), rồi species-batch-import.mjs.

import { guessRace } from './raceGuess.mjs'
import {
  existingSpecies,
  infoboxParams,
  pagesWikitext,
  plainText,
  wikiApi,
  writeSource
} from './sourceHelpers.mjs'

const api = wikiApi('https://dragonquest.fandom.com/api.php')

/** Họ quái → [hệ, race mặc định]. */
const FAMILY = {
  slime: ['water', 'slime'],
  dragon: ['dragon', 'westernDragon'],
  nature: ['grass', 'natureSpirit'],
  plant: ['grass', 'flower'],
  beast: ['normal', 'wildBeast'],
  material: ['steel', 'livingObject'],
  demon: ['dark', 'fiend'],
  undead: ['ghost', 'zombie'],
  zombie: ['ghost', 'zombie'],
  bird: ['flying', 'bird'],
  bug: ['bug', 'insectoid'],
  aquatic: ['water', 'fish'],
  machine: ['steel', 'machine'],
  elemental: ['psychic', 'elementalSpirit'],
  humanoid: ['fighting', 'human'],
  inorganic: ['rock', 'golem']
}
/** Từ khóa trong tên → hệ phụ. */
const NAME_ELEMENTS = [
  [/fire|flame|blaze|magma|lava|inferno|ember|burn/i, 'fire'],
  [/ice|frost|snow|freez|chill|frigid|blizzard/i, 'ice'],
  [/thunder|volt|lightning|zap|storm/i, 'electric'],
  [/poison|venom|toxic|bubble/i, 'poison'],
  [/rock|stone|golem|boulder/i, 'rock'],
  [/metal|iron|steel|gold|silver|bronze/i, 'steel'],
  [/holy|angel|light|heal|sacred/i, 'light'],
  [/shadow|dark|hell|evil|night|doom/i, 'dark'],
  [/ghost|spirit|phantom|wraith|soul/i, 'ghost'],
  [/sea|water|aqua|tide|marine|squid|fish/i, 'water'],
  [/wind|sky|gust|cloud/i, 'flying'],
  [/earth|mud|sand|dirt/i, 'ground'],
  [/mage|magic|witch|wizard|psy/i, 'psychic']
]
const TIER_BY_RANK = [
  [0.25, 'small'],
  [0.55, 'medium'],
  [0.8, 'peak'],
  [0.95, 'large'],
  [1.01, 'mythic']
]
const TIER_TOTAL = { small: 290, medium: 420, peak: 520, large: 560, mythic: 630 }
/** Ma vương / nhân vật có tên riêng (luật loại trừ). Họ "???" cũng bị loại. */
const UNIQUE = new Set(
  [
    'Dragonlord',
    'Hargon',
    'Malroth',
    'Baramos',
    'Zoma',
    'Psaro',
    'Estark',
    'Mortamor',
    'Necrosaro',
    'Nimzo',
    'Murdaw',
    'Dhuran',
    'Orgodemir',
    'Dhoulmagus',
    'Rhapthorne',
    'Corvus',
    'Mordegon',
    'Calasmos',
    'Nera',
    'Rhapthorne',
    'Hades Condor',
    'Gwyn Dalf',
    'Grand Master Nokturnus'
  ].map((n) => n.toLowerCase())
)

async function templatePages() {
  const titles = []
  let cont
  do {
    const body = await api({
      action: 'query',
      list: 'embeddedin',
      eititle: 'Template:MonsterInfo',
      eilimit: '500',
      einamespace: '0',
      ...(cont ? { eicontinue: cont } : {})
    })
    titles.push(...(body?.query?.embeddedin ?? []).map((p) => p.title))
    cont = body?.continue?.eicontinue
  } while (cont)
  return titles
}

/** Bảng chỉ số đầu tiên của trang ({{Dragon Quest…Monster|num=|HP=|…}}). */
function firstStatBlock(wikitext) {
  const match = /\{\{(DragonQuest[A-Za-z]*Monster)\s*\n/.exec(wikitext)
  if (!match) return null
  const p = infoboxParams(wikitext.slice(match.index, match.index + 2500))
  const n = (key) => Number(String(p[key] ?? '').match(/\d+/)?.[0] ?? 0)
  return {
    game: match[1],
    num: n('num'),
    hp: n('hp'),
    mp: n('mp'),
    attack: n('attack'),
    defense: n('defense'),
    agility: n('agility'),
    note: p.note && !/^none$/i.test(plainText(p.note)) ? plainText(p.note) : undefined
  }
}

const titles = await templatePages()
const texts = await pagesWikitext(api, titles)
const existing = existingSpecies('dragonQuest')
const raw = []
const excluded = []
for (const [title, wikitext] of texts) {
  const start = wikitext.search(/\{\{MonsterInfo/i)
  const params = infoboxParams(wikitext.slice(start, start + 1500))
  const name = plainText(params.name || title)
  const family = plainText((params.family ?? '').split('}}')[0]).toLowerCase()
  const intro = plainText(wikitext.slice(start, start + 2500))
  // Boss riêng của một game (không phải quái lặp lại) là cá thể có tên riêng.
  const isUniqueBoss =
    /is (a|an) (unique |optional |hidden )?boss/i.test(intro) && !/recurring/i.test(intro)
  if (family.includes('?') || UNIQUE.has(name.toLowerCase()) || isUniqueBoss) {
    excluded.push({ name, reason: 'ma vương / nhân vật có tên riêng (họ ???)' })
    continue
  }
  raw.push({ name, family, stats: firstStatBlock(wikitext) })
}
// Bậc theo vị trí trong bestiary của từng game (quái số lớn xuất hiện muộn, mạnh hơn).
const maxNum = new Map()
for (const r of raw)
  if (r.stats) maxNum.set(r.stats.game, Math.max(maxNum.get(r.stats.game) ?? 0, r.stats.num))
const species = raw.map((r) => {
  const [familyElement, familyRace] = FAMILY[r.family.split(/\s+/)[0]] ?? ['normal', 'mythicBeast']
  const nameElement = NAME_ELEMENTS.find(([pattern]) => pattern.test(r.name))?.[1]
  const rank =
    r.stats?.num && maxNum.get(r.stats.game) ? r.stats.num / maxNum.get(r.stats.game) : 0.5
  const tier = TIER_BY_RANK.find(([limit]) => rank < limit)[1]
  const entry = {
    name: r.name,
    elements: [...new Set([familyElement, nameElement].filter(Boolean))],
    raceId: existing.get(r.name.toLowerCase())?.raceId ?? guessRace([r.name], null) ?? familyRace,
    tier,
    category: r.family ? `${r.family[0].toUpperCase()}${r.family.slice(1)} family` : undefined,
    flavor: r.stats?.note
  }
  const s = r.stats
  // Chỉ dùng bảng đủ bốn chỉ số; dáng chỉ số pha 50% với dáng đều để quái cực đoan của game gốc
  // (slime kim loại: thủ hàng nghìn, máu vài điểm) không ra chỉ số 1.
  if (s && s.hp > 0 && s.attack > 0 && s.defense > 0 && s.agility > 0) {
    const raw = {
      hp: s.hp,
      attack: s.attack,
      defense: s.defense,
      spAttack: s.attack * 0.6 + s.mp * 0.4,
      spDefense: s.defense,
      speed: s.agility
    }
    const rawSum = Object.values(raw).reduce((a, b) => a + b, 0)
    const shape = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, 0.5 * (v / rawSum) + 0.5 / 6])
    )
    const sum = 1
    entry.stats = Object.fromEntries(
      Object.entries(shape).map(([k, v]) => [
        k,
        Math.max(1, Math.round((v * TIER_TOTAL[tier]) / sum))
      ])
    )
  }
  return entry
})
writeSource('dragonQuest', { source: 'dragonQuest', origin: 'fantasy', species, excluded })
