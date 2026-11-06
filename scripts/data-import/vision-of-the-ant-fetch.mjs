/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quái The Vision Of The Ant từ file modding chính thức modifyGame/monsterStats.txt của game đã cài (tên,
// level, HP / MP / STR / DEX / INT / KON). Boss mang tên riêng bị loại. Bậc theo level, chỉ số giữ dáng
// của game. Hệ game không ghi: đoán theo tên. Tiến hóa khi tên dạng sau bắt đầu bằng tên dạng trước
// (Svalax → Svalaxus). Chạy: node scripts/data-import/vision-of-the-ant-fetch.mjs, rồi
// species-batch-import.mjs sources/visionOfTheAnt.json. Luật ở content-sources-real.md mục "The Vision Of The Ant".

import { readFileSync } from 'node:fs'
import { STEAM_COMMON, statsAtTier } from './game-files/gameFiles.mjs'
import { guessRace } from './raceGuess.mjs'
import { existingSpecies, writeSource } from './sourceHelpers.mjs'
import { guessElements } from './smallSources.mjs'

const STATS_FILE = `${STEAM_COMMON}/The Vision Of The Ant/modifyGame/monsterStats.txt`
/** Nhân vật độc nhất (boss cốt truyện, tên riêng): không lấy (HP hàng nghìn, không phải quái thường). */
const UNIQUE = new Set(['Ruby', 'Zargas', 'Impa', 'Leo', 'Yoggoth', 'Ahriman', 'Natas'])
/** Level tiến hóa (game gốc tiến hóa giữa các vùng level 3–4 và 7–8). */
const EVOLVE_LEVEL = 16
const tierOf = (level) =>
  level <= 3 ? 'small' : level <= 8 ? 'medium' : level <= 14 ? 'peak' : 'large'

const rows = []
for (const line of readFileSync(STATS_FILE, 'utf8').split('\n')) {
  const match = /^(\w+)\s*\{([^}]*)\}/.exec(line)
  if (!match || UNIQUE.has(match[1])) continue
  const [level, hp, , str, dex, int, kon] = match[2].split(',').map(Number)
  rows.push({ name: match[1], level, hp, str, dex, int, kon })
}
if (rows.length < 50) throw new Error(`Chỉ đọc được ${rows.length} quái`)

const names = rows.map((row) => row.name)
const existing = existingSpecies('visionOfTheAnt')
const species = rows.map(({ name, level, hp, str, dex, int, kon }) => {
  const tier = tierOf(level)
  return {
    name,
    elements: guessElements(name),
    raceId: existing.get(name.toLowerCase())?.raceId ?? guessRace([name], null) ?? 'mythicBeast',
    tier,
    // STR = công, KON = thủ, INT = đặc công, DEX = tốc độ; đặc thủ lấy trung bình INT / KON.
    stats: statsAtTier(
      { hp, attack: str, defense: kon, spAttack: int, spDefense: (int + kon) / 2, speed: dex },
      tier
    ),
    category: `Level ${level} monster`,
    evolutions: names
      .filter((other) => other !== name && other.startsWith(name))
      .map((other) => ({ name: other, level: EVOLVE_LEVEL }))
  }
})
// Tên chính thức thay tên người chơi gõ trong guide (Shelwale, Skultor...): bỏ tên cũ, cập nhật chỉ số thật.
writeSource('visionOfTheAnt', {
  source: 'visionOfTheAnt',
  origin: 'fantasy',
  prune: true,
  update: { stats: true, catchRate: true, evolutions: 'add' },
  species
})
