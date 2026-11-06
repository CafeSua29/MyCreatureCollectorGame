/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quái Void Monsters: Spring City Tales thành sources/voidMonsters.json. Tên chính thức và danh sách lấy từ
// www/data của game đã cài (Classes.json: quái theo nhóm rune, kể cả nhóm Dökkálfar / Ljósálfar của DLC;
// Enemies.json: boss). Loại rune, độ mạnh, tiến hóa, mô tả lấy từ guide Steam "The Monster List" (id
// 1308529858, đã bị Steam gỡ) qua bản lưu archive.org 2020-12-07. Game không có hệ kiểu Pokémon (chỉ có
// rune): hệ đoán theo tên + mô tả, rune ghi ở category. Chạy: node scripts/data-import/void-monsters-fetch.mjs
// (cần mạng), rồi species-batch-import.mjs sources/voidMonsters.json. Luật ở content-sources-real.md mục "Void Monsters".

import { readGameJson } from './game-files/gameFiles.mjs'
import { guessRace } from './raceGuess.mjs'
import { existingSpecies, writeSource } from './sourceHelpers.mjs'
import { guessElements, pageLines } from './smallSources.mjs'

const GUIDE =
  'https://web.archive.org/web/20201207004454id_/https://steamcommunity.com/sharedfiles/filedetails/?id=1308529858'
/** Tên người chơi gõ trong guide → tên chính thức của game. Khóa viết thường. */
const ALIASES = {
  wraithwaitt: 'Wraithwait',
  bateneye: 'Bataneye',
  wildsneeze: 'Wildesneeze',
  sporranhunt: 'Sporranhaunt',
  icecapper: 'Icecaper',
  'ramskewer deamon': 'Ramskewer Daemon'
}
/** Mục guide ghi trùng tên nhầm: Rubybooslay "Epic" của đền Ear là Wraithwaitt (bình luận của guide). */
const RENAMED_DUPLICATES = { 'Ear|Epic': 'Wraithwait' }
/** Quái chỉ có trong game, guide không ghi: tên → rune, bậc. Boss ở Enemies.json, còn lại ở Classes.json. */
const GAME_ONLY = {
  Lovecrunch: ['Ior', 'small'],
  Wisper: ['Ior', 'small'],
  Cubemist: ['Heagl', 'medium'],
  'Light Watcher': ['Ljósálfar', 'medium'],
  Sunndile: ['Ljósálfar', 'peak'],
  Phoenix: ['Ljósálfar', 'large'],
  Darkbit: ['Dökkálfar', 'small'],
  Dokflower: ['Dökkálfar', 'small'],
  Dokkalflower: ['Dökkálfar', 'medium'],
  Deathjaw: ['Dökkálfar', 'medium'],
  Poisonshroom: ['Dökkálfar', 'medium'],
  Deathwatch: ['Dökkálfar', 'peak'],
  Sharkness: ['Dökkálfar', 'large'],
  Treeshade: ['Boss', 'large'],
  Spidercano: ['Boss', 'large'],
  Bonedean: ['Boss', 'large'],
  Kalcbot: ['Boss', 'large']
}
/** Độ mạnh trong mô tả → bậc (thứ tự kiểm là ưu tiên). */
const STRENGTH_TIERS = [
  [/\bepic\b/i, 'large'],
  [/very strong/i, 'peak'],
  [/\bstrong\b/i, 'medium']
]
/** Level tiến hóa (guide không ghi level; game tiến hóa bằng vật phẩm khi quái đủ mạnh). */
const EVOLVE_LEVEL = 20

/** Thứ tự bậc: dạng tiến hóa luôn cao hơn dạng trước ít nhất một bậc. */
const TIER_ORDER = ['small', 'medium', 'peak', 'large', 'mythic']

const canonical = (name) => ALIASES[name.toLowerCase()] ?? name
const strengthTier = (about) =>
  STRENGTH_TIERS.find(([pattern]) => pattern.test(about))?.[1] ?? 'small'
function tierOf(entry, entries) {
  const own = TIER_ORDER.indexOf(entry.tier ?? strengthTier(entry.about))
  const parent = entries.find((e) => e.name === entry.from)
  const floor = parent ? TIER_ORDER.indexOf(tierOf(parent, entries)) + 1 : 0
  return TIER_ORDER[Math.min(Math.max(own, floor), TIER_ORDER.length - 1)]
}

/** Guide → [{ name, rune, about, from? }]: mỗi quái 3–4 dòng "Tên / Type: X / (Truth: Evolves from Y) / About: Z". */
function parseGuide(lines) {
  const entries = []
  for (let i = 1; i < lines.length; i++) {
    const type = /^Type:\s*(\w+)/.exec(lines[i])
    if (!type) continue
    const truth = /^Truth:\s*Evolves from (.+)$/.exec(lines[i + 1] ?? '')
    const aboutLine = lines[i + (truth ? 2 : 1)] ?? ''
    const about = aboutLine.startsWith('About:') ? aboutLine.slice(6).trim() : ''
    const rune = type[1].replace('Haegl', 'Heagl')
    let name = canonical(lines[i - 1])
    const renamed = RENAMED_DUPLICATES[`${rune}|${/\bepic\b/i.test(about) ? 'Epic' : ''}`]
    if (entries.some((e) => e.name === name)) {
      if (!renamed) continue
      name = renamed
    }
    entries.push({ name, rune, about, from: truth ? canonical(truth[1].trim()) : undefined })
  }
  return entries
}

const entries = parseGuide(await pageLines(GUIDE))
if (entries.length < 80) throw new Error(`Guide chỉ đọc được ${entries.length} quái, kiểm tra lại`)
const inGame = new Set(
  [
    ...readGameJson('Void Monsters/www/data/Classes.json'),
    ...readGameJson('Void Monsters/www/data/Enemies.json')
  ]
    .filter(Boolean)
    .map((row) => row.name.trim())
)
for (const [name, [rune, tier]] of Object.entries(GAME_ONLY)) {
  if (!inGame.has(name)) throw new Error(`Game không có ${name}`)
  entries.push({ name, rune, about: '', tier })
}
// "Sentrybot" là tên trong Enemies.json (Classes.json gõ nhầm "Setrybot").
const notInGame = entries.filter((entry) => !inGame.has(entry.name)).map((entry) => entry.name)
if (notInGame.length > 0) throw new Error(`Tên guide không có trong game: ${notInGame.join(', ')}`)

const existing = existingSpecies('voidMonsters')
const species = entries.map((entry) => ({
  name: entry.name,
  elements: guessElements(entry.name, entry.about),
  raceId:
    existing.get(entry.name.toLowerCase())?.raceId ??
    guessRace([entry.name], null) ??
    'mythicBeast',
  tier: tierOf(entry, entries),
  ...(entry.rune ? { category: `${entry.rune} rune` } : {}),
  ...(entry.about ? { flavor: entry.about } : {}),
  evolutions: entries
    .filter((other) => other.from === entry.name)
    .map((other) => ({ name: other.name, level: EVOLVE_LEVEL }))
}))
// Lần nhập đầu (thread) chỉ có tên: cập nhật bậc theo độ mạnh của guide và thêm tiến hóa.
writeSource('voidMonsters', {
  source: 'voidMonsters',
  origin: 'fantasy',
  // Tên chính thức thay tên người chơi gõ của lần nhập trước: bỏ mục tên cũ.
  prune: true,
  update: { stats: true, catchRate: true, evolutions: 'add' },
  species
})
