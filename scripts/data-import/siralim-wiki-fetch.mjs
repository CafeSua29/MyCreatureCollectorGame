/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Bổ sung loài Siralim Ultimate còn thiếu (thêm ở các bản cập nhật sau bộ CSV đã nhập; xem mục "Dữ liệu
// Siralim Ultimate" ở content-sources-more.md) từ siralimultimate.wiki.gg (Category:Creatures, infobox
// {{Creature infobox}}) thành sources/siralimExtra.json. Quy đổi như lần nhập đầu: Health → hp, Attack →
// công, Intelligence → đặc công, Defense → thủ và đặc thủ, Speed → tốc độ, × 3,6; Godspawn / Demigod ×
// thêm 1,2. Chạy: node scripts/data-import/siralim-wiki-fetch.mjs (cần mạng), rồi
// species-batch-import.mjs sources/siralimExtra.json. Luật ở content-sources-real.md mục "Siralim Ultimate (bổ sung)".

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

const api = wikiApi('https://siralimultimate.wiki.gg/api.php')
const STAT_SCALE = 3.6
const DEITY_SCALE = 1.2
const DEITY_RACES = new Set(['godspawn', 'demigod'])
/**
 * Nhân vật độc nhất (luật đầu content-data.md): 8 loài đã loại ở lần nhập đầu và nhân vật có tên riêng
 * thêm ở bản sau (Dr. Concocto, Furious Frank, Sir Roquefort, Loki, Grom'met).
 */
const UNIQUE = new Set([
  'zantai',
  'pandora',
  'apollinaire',
  'pumking',
  'davey',
  'greybeard',
  'the bearon',
  'the first spawn',
  'dr. concocto',
  'furious frank',
  'sir roquefort',
  'loki',
  'grom’met',
  "grom'met"
])
/** Race Siralim là vật / máy / nguyên tố → không giới tính (như lần nhập đầu). */
const GENDERLESS_RACES = new Set([
  'golem',
  'construct',
  'clockwork',
  'automaton',
  'slime',
  'concoction',
  'robodomi',
  'effigy',
  'marionette',
  'cataclysm',
  'mimic'
])
/** Race Siralim mới (chưa có loài nào trong game để lấy theo) → race game. */
const NEW_SIRALIM_RACES = {
  marionette: 'livingObject',
  effigy: 'livingObject',
  eggxotic: 'livingObject',
  robodomi: 'machine',
  cataclysm: 'elementalSpirit',
  spacecat: 'felid',
  lucanian: 'insectfolk',
  mireling: 'anuran',
  spelljuggler: 'human',
  underdweller: 'beastfolk',
  calumnier: 'beastfolk',
  denizen: 'merfolk'
}
/** Elementasaur theo từng loài khủng long gốc của tên. */
const ELEMENTASAUR_RACE = [
  [/brockiosaurus|vinosaurus/i, 'sauropod'],
  [/guanodon|ancloudysaur|triflaratops/i, 'ornithischian'],
  [/windactyl/i, 'pterosaur'],
  [/nychus|raptor|rex/i, 'theropod']
]
/** Class → hệ (lần nhập đầu): Chaos = Lửa, Death = Ma, Life = Ánh sáng, Nature = Cỏ, Sorcery = Tâm linh. */
const CLASS_ELEMENT = {
  chaos: 'fire',
  death: 'ghost',
  life: 'light',
  nature: 'grass',
  sorcery: 'psychic'
}
/** Từ khóa trong tên → hệ (ưu tiên trước hệ của race / class, như lần nhập đầu). */
const NAME_ELEMENTS = [
  [/fire|flame|inferno|ember|volcanic|scorch|magma|burn/i, 'fire'],
  [/frost|ice|glacial|snow|freez/i, 'ice'],
  [/thunder|storm|lightning|spark|electr/i, 'electric'],
  [/shadow|dark|night|nightmare/i, 'dark'],
  [/holy|celestial|solar|sola|light|illumin/i, 'light'],
  [/poison|toxic|venom|rot\b|pandemic|plague/i, 'poison'],
  [/ocean|sea|water|tide|benthic|aqua/i, 'water'],
  [/stone|rock|terra|earth|brock/i, 'rock'],
  [/sky|wind|breez|cloud|air/i, 'flying'],
  [/spectral|ghost|haunt|grave|soul/i, 'ghost'],
  [/astral|cosmic|space|lunar|luna/i, 'psychic'],
  [/iron|steel|metal|mech|robo/i, 'steel'],
  [/dragon|draconic|wyrm/i, 'dragon'],
  [/nuclear|explosive/i, 'fire']
]

const titles = (await categoryMembers(api, 'Creatures')).filter(
  (t) => !t.includes('/') && t !== 'Creatures'
)
const texts = await pagesWikitext(api, titles)
const existing = existingSpecies('siralim')
const known = new Set([...existing.keys()].map((name) => name.replace(/ \(siralim\)$/, '')))

const parsed = []
for (const title of titles) {
  const box = /\{\{Creature infobox([\s\S]*?)\n\}\}/i.exec(texts.get(title) ?? '')
  if (!box) continue
  const p = infoboxParams(box[1])
  parsed.push({ title, p, text: texts.get(title) ?? '' })
}

// Race / hệ đầu của loài mới theo loài đã có cùng race Siralim (lấy giá trị nhiều nhất).
const votes = (pick) => {
  const table = new Map()
  for (const { title, p } of parsed) {
    const sp = existing.get(title.toLowerCase()) ?? existing.get(`${title.toLowerCase()} (siralim)`)
    if (!sp) continue
    const race = (p.species ?? '').toLowerCase()
    const counts = table.get(race) ?? new Map()
    counts.set(pick(sp), (counts.get(pick(sp)) ?? 0) + 1)
    table.set(race, counts)
  }
  return (race) => [...(table.get(race) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}
const raceOfSiralimRace = votes((sp) => sp.raceId)
const elementOfSiralimRace = votes((sp) => sp.elementIds[0])

const species = []
const excluded = []
for (const { title, p, text } of parsed) {
  if (known.has(title.toLowerCase())) continue
  if (UNIQUE.has(title.toLowerCase())) {
    excluded.push({ name: title, reason: 'nhân vật độc nhất' })
    continue
  }
  const siralimRace = (p.species ?? '').toLowerCase()
  const isDeity = DEITY_RACES.has(siralimRace)
  const scale = STAT_SCALE * (isDeity ? DEITY_SCALE : 1)
  const n = (key) => Number(p[key]) || 1
  const stats = {
    hp: Math.round(n('health') * scale),
    attack: Math.round(n('attack') * scale),
    defense: Math.round(n('defense') * scale),
    spAttack: Math.round(n('intelligence') * scale),
    spDefense: Math.round(n('defense') * scale),
    speed: Math.round(n('speed') * scale)
  }
  const lore = /==\s*Lore\s*==\s*\n+([^\n]+)/.exec(text)?.[1]
  const flavor = lore ? plainText(lore) : undefined
  const fromName = NAME_ELEMENTS.find(([pattern]) => pattern.test(title))?.[1]
  const classElement = CLASS_ELEMENT[(p.class ?? '').toLowerCase().trim()]
  const elements = [
    ...new Set(
      [
        fromName,
        siralimRace === 'exotic' ? undefined : elementOfSiralimRace(siralimRace),
        classElement
      ].filter(Boolean)
    )
  ].slice(0, 2)
  species.push({
    // "Nightmare (Creature)": hậu tố phân biệt trang của wiki, không phải tên quái.
    name: title.replace(/ \(Creature\)$/, ''),
    elements: elements.length > 0 ? elements : ['normal'],
    raceId:
      (siralimRace === 'elementasaur'
        ? ELEMENTASAUR_RACE.find(([pattern]) => pattern.test(title))?.[1]
        : null) ??
      (siralimRace === 'exotic' ? null : raceOfSiralimRace(siralimRace)) ??
      NEW_SIRALIM_RACES[siralimRace] ??
      guessRace([title, flavor], null) ??
      'mythicBeast',
    stats,
    tier: isDeity ? 'large' : 'medium',
    catchRate: isDeity ? 12 : siralimRace === 'exotic' ? 20 : 40,
    ...(GENDERLESS_RACES.has(siralimRace) ? { genderless: true } : {}),
    category: p.species ? `${plainText(p.species)} ${plainText(p.class ?? '')}`.trim() : undefined,
    flavor
  })
}
writeSource('siralimExtra', { source: 'siralim', origin: 'fantasy', species, excluded })
