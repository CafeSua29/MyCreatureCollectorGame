/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Tải quái Creature Clicker thành sources/creatureClicker.json. Nguồn đủ tên là danh sách thành tựu
// Steam (JSON nhúng trong trang achievements): 15 họ quái hoang ("Raise a X"), mỗi họ 3 nấc ascend
// ("Ascend your X" / "Ascend to a X"), 4 rồng khởi đầu, quái biến thể ("Own a X"), raid boss tên chung
// ("Defeat The X"; boss tên riêng như Qan'Xar bị loại theo luật nhân vật độc nhất), ong DLC, lá bài
// Forest Deck. Bậc của dạng hoang theo vùng level trên gallery thevideogamedatabase.fandom.com, mỗi nấc
// ascend lên một bậc. Hệ đoán theo tên dạng + tên họ. Steam hay ngắt kết nối: truyền đường dẫn file
// trang đã lưu làm tham số đầu thì đọc file đó. Chạy:
// node scripts/data-import/creature-clicker-fetch.mjs [trang-achievements.html] (cần mạng), rồi
// species-batch-import.mjs sources/creatureClicker.json. Luật ở content-sources-real.md mục "Creature Clicker".

import { guessRace } from './raceGuess.mjs'
import { existingSpecies, wikiApi, writeSource } from './sourceHelpers.mjs'
import { guessElements, loadSteamAchievements } from './smallSources.mjs'

const APP_ID = 529240
/** Trang đầy đủ có hơn 700 thành tựu; ít hơn nghĩa là tải thiếu. */
const MIN_ACHIEVEMENTS = 500
const TIER_ORDER = ['small', 'medium', 'peak', 'large', 'mythic']
/** Level ascend tới nấc 1 / 2 / 3 (game ascend bằng soul stone của boss mỗi 12 level vùng). */
const ASCEND_LEVELS = [16, 32, 48]
/**
 * Biến thể → họ (thành tựu không ghi họ; suy theo đuôi tên giống dạng ascend của họ: -evis của phượng
 * hoàng, -hoof / -mane của nai, Tyran- của raptor, Rat- / -astere của chuột, -ana của cóc, Stego- của
 * ankylo, -net của ong, karasu = quạ của diều hâu). Biến thể là nhánh ascend cuối thay cho dạng cuối.
 */
const VARIANT_FAMILY = {
  Voltevis: 'phoenix',
  Glacevis: 'phoenix',
  Cinderhoof: 'deer',
  Frostmane: 'deer',
  Ignitiorant: 'raptor',
  Tyranakurao: 'raptor',
  Ratasha: 'rat',
  Catastere: 'rat',
  Malana: 'toad',
  Malinawa: 'toad',
  Stegoberg: 'ankylo',
  Sakkarasu: 'hawk',
  Tronet: 'wasp'
}
/** Họ không có thành tựu "Raise" (vùng Sarak Desert): tên dạng hoang theo gallery fandom. */
const WILD_WITHOUT_RAISE = { raptor: 'Raptor', rockgolem: 'Rock Golem', ankylo: 'Ankylo' }
/**
 * Hệ đặt tay khi từ khóa đoán sai theo nghĩa tên (Glace- = băng, Volt- = điện, Igni- = lửa, Cinder- =
 * tro lửa, Chaos / Corrupted = bóng tối; "Ignitiorant" chứa "ant" nên bị đoán ra côn trùng).
 */
const ELEMENT_OVERRIDES = {
  'Chaos Dragon': ['dark', 'dragon'],
  Glacevis: ['ice', 'flying'],
  Voltevis: ['electric', 'flying'],
  Infernevis: ['fire', 'flying'],
  Ignitiorant: ['fire', 'dragon'],
  Cinderhoof: ['fire'],
  'Corrupted Phoenix': ['dark', 'fire'],
  'Corrupted Swarm': ['dark', 'bug'],
  'Corrupted Scorpion': ['dark', 'bug'],
  'Corrupted Bat': ['dark', 'flying'],
  'Corrupted Cactara': ['dark', 'grass'],
  'Corrupted Ent': ['dark', 'grass'],
  'Corrupted Octopus': ['dark', 'water'],
  'Chaos Imp': ['dark']
}
/** Biến thể huyền thoại (thành tựu "Legendary Malinawa"). */
const LEGENDARY = new Set(['Malinawa'])

async function loadAchievements() {
  const list = await loadSteamAchievements(APP_ID, process.argv[2])
  if (list.length < MIN_ACHIEVEMENTS)
    throw new Error(`Chỉ đọc được ${list.length} thành tựu, trang tải không đủ`)
  return list
}

/** Gallery fandom: tên dạng hoang → level đầu tiên của vùng nó xuất hiện. */
async function zoneLevels() {
  const api = wikiApi('https://thevideogamedatabase.fandom.com/api.php')
  const body = await api({ action: 'parse', page: 'Creature_Clicker', prop: 'wikitext' })
  const levels = new Map()
  let level = 1
  for (const line of (body?.parse?.wikitext?.['*'] ?? '').split('\n')) {
    const area = /^===.*\(Levels (\d+)/.exec(line)
    if (area) level = Number(area[1])
    const match = /\|\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/.exec(line)
    if (match && !levels.has(match[1])) levels.set(match[1], level)
  }
  return levels
}

const achievements = await loadAchievements()
const levels = await zoneLevels()
const existing = existingSpecies('creatureClicker')
const species = []
const shift = (tier, steps) =>
  TIER_ORDER[Math.min(TIER_ORDER.indexOf(tier) + steps, TIER_ORDER.length - 1)]
const describe = (pattern) =>
  achievements.map((a) => ({ key: a.key, match: pattern.exec(a.text) })).filter((a) => a.match)
function add(entry, familyName) {
  if (species.some((s) => s.name === entry.name)) return
  const raceSource =
    existing.get(familyName.toLowerCase())?.raceId ??
    species.find((s) => s.name === familyName && s.raceId !== 'mythicBeast')?.raceId
  species.push({
    elements: ELEMENT_OVERRIDES[entry.name] ?? guessElements(entry.name, familyName),
    raceId:
      existing.get(entry.name.toLowerCase())?.raceId ??
      raceSource ??
      guessRace([entry.name, familyName], null) ??
      'mythicBeast',
    evolutions: [],
    ...entry
  })
}

// Họ quái: dạng hoang (petraising) + 3 nấc ascend; rồng khởi đầu chỉ có dạng lớn dần, không ascend.
const families = new Map()
for (const { key, match } of describe(/^Raise an? (.+?)\s+to Level 1$/)) {
  const family = /petraising_([a-z]+)001$/.exec(key)?.[1]
  if (family) families.set(family, { wild: match[1], forms: [] })
}
for (const { key, match } of describe(/^Ascend (?:your|to an?) (.+)$/)) {
  const found = /ascend_([a-z]+)0(\d)$/.exec(key)
  if (!found) continue
  if (!families.has(found[1])) {
    const wild = WILD_WITHOUT_RAISE[found[1]]
    if (!wild)
      throw new Error(`Chưa biết dạng hoang của họ ${found[1]} (thêm vào WILD_WITHOUT_RAISE)`)
    families.set(found[1], { wild, forms: [] })
  }
  families.get(found[1]).forms[Number(found[2]) - 1] = match[1]
}
const finalForm = new Map()
for (const [family, { wild, forms }] of families) {
  const base = levels.has(wild)
    ? TIER_ORDER[levels.get(wild) < 24 ? 0 : levels.get(wild) < 48 ? 1 : 2]
    : 'small'
  const chain = [wild, ...forms]
  chain.forEach((name, stage) =>
    add(
      {
        name,
        tier: shift(base, stage),
        category: stage === 0 ? 'Wild creature' : `Ascension ${stage}`,
        evolutions: chain[stage + 1]
          ? [{ name: chain[stage + 1], level: ASCEND_LEVELS[stage] }]
          : []
      },
      wild
    )
  )
  if (forms.length > 1) finalForm.set(family, { parent: chain.at(-2), wild, tier: shift(base, 3) })
}

// Biến thể: nhánh ascend cuối thay cho dạng cuối của họ; "Nightcrest X" (thử thách trung thành) từ X.
for (const { key, match } of describe(/^Own an? (.+)$/)) {
  if (!key.startsWith('ach_variationascend')) continue
  const name = match[1].trim()
  const family = finalForm.get(VARIANT_FAMILY[name])
  if (!family) throw new Error(`Chưa biết họ của biến thể ${name} (thêm vào VARIANT_FAMILY)`)
  add(
    { name, tier: LEGENDARY.has(name) ? 'mythic' : family.tier, category: 'Variant' },
    family.wild
  )
  species
    .find((s) => s.name === family.parent)
    .evolutions.push({ name, level: ASCEND_LEVELS.at(-1) })
}
for (const { match } of describe(/^Unlock (Nightcrest .+?)\s*$/)) {
  const base = match[1].replace(/^Nightcrest /, '')
  const parent = species.find((s) => s.name === base)
  if (!parent) throw new Error(`Không thấy dạng gốc của ${match[1]}`)
  add({ name: match[1], tier: parent.tier, category: 'Loyalty variant' }, base)
  parent.evolutions.push({ name: match[1], level: ASCEND_LEVELS.at(-1) })
}

// Raid boss tên chung ("Defeat The X"), ong DLC ("Farm 10 X"), lá bài Forest Deck.
for (const { match } of describe(/^Defeat The (.+)$/))
  add({ name: match[1], tier: 'large', category: 'Raid boss' }, match[1])
for (const { match } of describe(/^Farm 10 (.+?) Wasps$/))
  add({ name: `${match[1]} Wasp`, tier: 'small', category: 'Farm wasp' }, `${match[1]} Wasp`)
for (const { match } of describe(/^Unlock The Platinum (.+) Card$/))
  add({ name: match[1], tier: 'small', category: 'Forest Deck card' }, match[1])

// Lần nhập đầu (gallery) chỉ có dạng hoang: thêm hướng ascend cho chúng.
writeSource('creatureClicker', {
  source: 'creatureClicker',
  origin: 'fantasy',
  update: { evolutions: 'add' },
  species
})
