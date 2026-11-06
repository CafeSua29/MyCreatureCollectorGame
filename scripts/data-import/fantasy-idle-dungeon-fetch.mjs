/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Jenin của Fantasy Idle Dungeon từ game đã cài (game-files/extract.py): RoleJson (nhóm, hệ số tăng trưởng)
// và LanguageJson (tên tiếng Anh). Bỏ nhóm 7 (nhân vật người chơi, không có tên). Bậc theo số id (trăm
// càng lớn xuất hiện càng muộn). Chỉ số giữ dáng tăng trưởng của game. Hệ game không ghi: đoán theo tên.
// Chạy: node scripts/data-import/fantasy-idle-dungeon-fetch.mjs, rồi
// species-batch-import.mjs sources/fantasyIdleDungeon.json. Luật ở content-sources-real.md mục "Fantasy Idle Dungeon".

import { readDumpJson, statsAtTier } from './game-files/gameFiles.mjs'
import { guessRace } from './raceGuess.mjs'
import { writeSource } from './sourceHelpers.mjs'
import { guessElements } from './smallSources.mjs'

const PLAYER_TYPE = 7
/** Nhóm của game → race dự phòng khi tên không đoán được (nhóm suy theo tên các Jenin trong nhóm). */
const TYPE_RACES = {
  1: 'wildBeast',
  2: 'mythicBeast',
  3: 'bird',
  4: 'flower',
  5: 'fey',
  6: 'beastfolk'
}
/** Trăm của id (1–8) → bậc. */
const TIER_BY_CENTURY = {
  1: 'small',
  2: 'small',
  3: 'medium',
  4: 'medium',
  5: 'peak',
  6: 'peak',
  7: 'large',
  8: 'large'
}

const englishOf = new Map(
  readDumpJson('fantasy-idle-dungeon/LanguageJson.json').map((row) => [row.id, row.en])
)
const species = readDumpJson('fantasy-idle-dungeon/RoleJson.json')
  .filter((role) => role.type !== PLAYER_TYPE)
  .map((role) => {
    const name = englishOf.get(role.name)
    if (!name) throw new Error(`Không có tên tiếng Anh của role ${role.id} (${role.name})`)
    const tier = TIER_BY_CENTURY[Math.floor(role.id / 100)] ?? 'large'
    // Hệ số tăng trưởng 1–5 của game cộng 1 để chỉ số thấp nhất không về 0.
    const grow = (value) => value + 1
    return {
      name,
      elements: guessElements(name),
      raceId: guessRace([name], null) ?? TYPE_RACES[role.type],
      tier,
      stats: statsAtTier(
        {
          hp: grow(role.hpGrow),
          attack: grow(role.atkGrow),
          defense: grow(role.armorGrow),
          spAttack: grow(role.apGrow),
          spDefense: grow(role.armorGrow),
          speed: grow(role.speedGrow)
        },
        tier
      ),
      category: 'Jenin'
    }
  })
writeSource('fantasyIdleDungeon', { source: 'fantasyIdleDungeon', origin: 'fantasy', species })
