/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải quái Summoners War: Sky Arena (summonerswar.fandom.com, Category:Monsters, trang "Họ (Hệ) - Tên
// thức tỉnh" có {{Infobox monster}}) thành sources/summonersWar.json. Mỗi biến thể hệ là một loài
// (như game gốc: Amazon Lửa và Amazon Nước là hai quái khác nhau), tên theo tên thức tỉnh. Không lấy
// nhân vật collab (Street Fighter, Cookie Run, Assassin's Creed, Witcher, Jujutsu Kaisen, Demon
// Slayer, Tekken: nhân vật độc nhất, content-data.md). Chạy: node scripts/data-import/summoners-war-fetch.mjs
// (cần mạng), rồi species-batch-import.mjs sources/summonersWar.json. Luật ở content-sources-real.md mục "Summoners War".

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

const api = wikiApi('https://summonerswar.fandom.com/api.php')
const ELEMENTS = { fire: 'fire', water: 'water', wind: 'flying', light: 'light', dark: 'dark' }
/** Sao gốc → bậc. */
const TIER_BY_STARS = { 1: 'small', 2: 'small', 3: 'medium', 4: 'peak', 5: 'large', 6: 'large' }
const TIER_TOTAL = { small: 290, medium: 420, peak: 520, large: 560 }
/** Hệ số quy chỉ số Summoners War (HP hàng nghìn, tốc độ ~100) về cùng dáng trước khi chia tổng của bậc. */
const SHAPE_SCALE = { hp: 1 / 14, attack: 1, defense: 1, speed: 4.5 }

/**
 * Họ không lấy ngoài trang Collaborations (luật nhân vật độc nhất, content-data.md): collab Chúa tể
 * những chiếc nhẫn và Tekken chưa ghi trên trang đó; Monkey King (Tôn Ngộ Không); thần có tên dạng
 * người / đầu thú thân người (Anubis, Horus, Indra).
 */
const EXCLUDED_FAMILIES = {
  aragorn: 'nhân vật collab (nhân vật độc nhất)',
  frodo: 'nhân vật collab (nhân vật độc nhất)',
  gandalf: 'nhân vật collab (nhân vật độc nhất)',
  gollum: 'nhân vật collab (nhân vật độc nhất)',
  legolas: 'nhân vật collab (nhân vật độc nhất)',
  gimli: 'nhân vật collab (nhân vật độc nhất)',
  galadriel: 'nhân vật collab (nhân vật độc nhất)',
  'nina williams': 'nhân vật collab (nhân vật độc nhất)',
  'monkey king': 'nhân vật độc nhất (Tôn Ngộ Không)',
  anubis: 'thần có tên dạng đầu thú thân người',
  horus: 'thần có tên dạng đầu thú thân người',
  indra: 'thần có tên dạng người'
}
/** Race theo họ khi đoán theo tên không ra hoặc ra sai (Battle Mammoth không phải bướm đêm). */
const FAMILY_RACE = {
  amazon: 'human',
  angelmon: 'angel',
  'super angelmon': 'angel',
  'king angelmon': 'angel',
  'arcane weapon': 'livingObject',
  'art master': 'human',
  assassin: 'human',
  asura: 'fiend',
  'battle mammoth': 'proboscid',
  bearman: 'beastfolk',
  'beast rider': 'human',
  'blade dancer': 'human',
  'cannon girl': 'human',
  'chakram dancer': 'human',
  daimon: 'fiend',
  devilmon: 'imp',
  'dice magician': 'human',
  'dokkaebi lord': 'oni',
  druid: 'human',
  'drunken master': 'human',
  'dual blade': 'human',
  duke: 'vampire',
  'elite magical archer': 'human',
  'elven ranger': 'elf',
  'exorcist association arbiter': 'human',
  'exorcist association conjurer': 'human',
  'exorcist association fighter': 'human',
  'exorcist association resolver': 'human',
  'forest keeper': 'tree',
  frankenstein: 'zombie',
  gladiatrix: 'human',
  'guardian of darkness': 'golem',
  'guardian of wind': 'golem',
  hacker: 'human',
  harg: 'wildBeast',
  'harp magician': 'human',
  harpu: 'fey',
  'hell lady': 'fiend',
  howl: 'canid',
  hypnomeow: 'felid',
  inferno: 'fiend',
  inugami: 'canid',
  joker: 'human',
  justice: 'angel',
  kai: 'human',
  'kung fu girl': 'human',
  'lightning emperor': 'human',
  'living armor': 'livingObject',
  'magic order elementalist': 'human',
  'magic order enchantress': 'human',
  'magic order guardian': 'human',
  'magic order swordsinger': 'human',
  'magical archer': 'human',
  'martial artist': 'human',
  minotauros: 'buffalo',
  'neostone agent': 'human',
  'neostone fighter': 'human',
  'occult girl': 'human',
  onimusha: 'human',
  onmyouji: 'human',
  oracle: 'human',
  paladin: 'human',
  pierrette: 'human',
  'poison master': 'human',
  puppeteer: 'human',
  'remains guardian': 'golem',
  robo: 'machine',
  'rune blacksmith': 'dwarf',
  sage: 'human',
  sandman: 'fey',
  'sea emperor': 'merfolk',
  'shadow claw': 'human',
  shadowcaster: 'human',
  shasha: 'fey',
  'sky dancer': 'human',
  'sky surfer': 'human',
  slayer: 'human',
  'sniper mk.i': 'machine',
  striker: 'human',
  'string master': 'human',
  'surprise box': 'mimic',
  sylphid: 'fey',
  taebaek: 'natureSpirit',
  taoist: 'human',
  'tomb warden': 'golem',
  totemist: 'human',
  undine: 'fey',
  unicorn: 'equid',
  vagabond: 'human',
  valkyrja: 'angel',
  viking: 'human',
  warbear: 'ursid',
  'weapon master': 'human'
}

const titles = await categoryMembers(api, 'Monsters')
const texts = await pagesWikitext(api, [...titles, 'Collaborations'])
const existing = existingSpecies('summonersWar')

/** Tên nhân vật collab: vế trái của "* Ryu / Striker" hoặc cả dòng nếu không có bản riêng của game. */
const collabNames = new Set(
  [...(texts.get('Collaborations') ?? '').matchAll(/^\*\s*([^/\n]+?)\s*(?:\/|$)/gm)].map((m) =>
    m[1].trim().toLowerCase()
  )
)
const isCollab = (family) => collabNames.has(family.toLowerCase())

const species = []
const excluded = []
const familyRace = new Map()
for (const title of titles) {
  const text = texts.get(title)
  const box = text ? /\{\{Infobox[ _]monster([\s\S]*?)\n\}\}/i.exec(text) : null
  if (!box) continue
  const p = infoboxParams(box[1])
  const family = plainText(p.name ?? '')
  const element = ELEMENTS[(p.element ?? '').toLowerCase().trim()]
  // Trang họ (không có hệ) chỉ là trang tổng hợp.
  if (!family || !element) continue
  if (isCollab(family) || EXCLUDED_FAMILIES[family.toLowerCase()]) {
    excluded.push({
      name: title,
      reason: EXCLUDED_FAMILIES[family.toLowerCase()] ?? 'nhân vật collab (nhân vật độc nhất)'
    })
    continue
  }
  const awakened = plainText(p['awakened name'] ?? '')
  const elementLabel = `${p.element.trim()[0].toUpperCase()}${p.element.trim().slice(1).toLowerCase()}`
  const name = awakened || `${elementLabel} ${family}`
  const stars = Number(/(\d)/.exec(p.stars ?? '')?.[1]) || 3
  const tier = TIER_BY_STARS[stars] ?? 'medium'
  const n = (key) => Number(String(p[key] ?? '').replace(/[^\d.]/g, '')) || 0
  const raw = {
    hp: n('awakened max hp') || n('unawakened max hp'),
    attack: n('awakened max atk') || n('unawakened max atk'),
    defense: n('awakened max def') || n('unawakened max def'),
    speed: n('awakened spd') || n('unawakened spd')
  }
  let stats
  if (raw.hp && raw.attack && raw.defense && raw.speed) {
    const shape = {
      hp: raw.hp * SHAPE_SCALE.hp,
      attack: raw.attack * SHAPE_SCALE.attack,
      defense: raw.defense * SHAPE_SCALE.defense,
      // Summoners War chỉ có một cặp công / thủ: dùng cho cả vật lý lẫn đặc biệt.
      spAttack: raw.attack * SHAPE_SCALE.attack,
      spDefense: raw.defense * SHAPE_SCALE.defense,
      speed: raw.speed * SHAPE_SCALE.speed
    }
    const sum = Object.values(shape).reduce((a, b) => a + b, 0)
    stats = Object.fromEntries(
      Object.entries(shape).map(([k, v]) => [
        k,
        Math.max(1, Math.round((v * TIER_TOTAL[tier]) / sum))
      ])
    )
  }
  if (!familyRace.has(family))
    familyRace.set(family, FAMILY_RACE[family.toLowerCase()] ?? guessRace([family], null))
  species.push({
    name,
    family,
    elements: [element],
    raceId: existing.get(name.toLowerCase())?.raceId ?? familyRace.get(family) ?? 'mythicBeast',
    ...(stats ? { stats } : {}),
    tier,
    category: `${elementLabel} ${family}`,
    flavor: p.type ? `${plainText(p.type)} type ${family}.` : undefined
  })
}

// Tên thức tỉnh trùng nhau giữa hai trang (bản cũ / bản làm lại) thì giữ trang đầu.
const seen = new Set()
const unique = species.filter((entry) => {
  const key = entry.name.toLowerCase()
  if (seen.has(key)) {
    excluded.push({ name: entry.name, reason: 'trùng tên thức tỉnh' })
    return false
  }
  seen.add(key)
  return true
})
writeSource('summonersWar', {
  source: 'summonersWar',
  origin: 'fantasy',
  // `family` chỉ dùng để gom race theo họ, không phải trường của file nguồn.
  species: unique.map((entry) => {
    const copy = { ...entry }
    delete copy.family
    return copy
  }),
  excluded
})
