/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Quái BioKept từ game đã cài (game-files/extract.py): BoxMonsterTable + BosMonsterTable (id, level, chỉ
// số). Game hiển thị tên theo id nên tên tiếng Anh dựng từ id (sửa lỗi gõ của id: scrop → scorpion...).
// Bỏ vật thể (quặng, đá quý, rương), mục kỹ năng và biến thể đánh số (dog1–6, minner_1–4), người có vai
// riêng. "super_x" là bản mạnh của x: tiến hóa của x. Bậc theo level, chỉ số giữ dáng game. Chạy:
// node scripts/data-import/biokept-fetch.mjs, rồi species-batch-import.mjs sources/biokept.json. Luật ở
// content-sources-real.md mục "BioKept".

import { readDumpJson, statsAtTier } from './game-files/gameFiles.mjs'
import { writeSource } from './sourceHelpers.mjs'

/** Loại quái trong bảng: 7 = vật thể, 10 = mục kỹ năng. */
const NON_CREATURE_TYPES = new Set([7, 10])
const EXCLUDED = new Set([
  'heal_chest',
  'blue_crystal',
  'blacksmith',
  'mountain_thief',
  'universe_police'
])
const NUMBERED_VARIANT = /^(dogd|minner_d)$/
/** Mục kỹ năng trong bảng quái (normal_atk, fire_heal...). */
const SKILL_ENTRY = /_(atk|def|heal)$/
const WORD_FIX = { scrop: 'scorpion', posion: 'poison', minner: 'miner', sting: 'stinger' }
/** Từ trong id → hệ (thứ tự là ưu tiên). */
const ELEMENT_WORDS = [
  ['fire', 'fire'],
  ['ice', 'ice'],
  ['light', 'light'],
  ['shadow', 'dark'],
  ['black', 'dark'],
  ['mental', 'psychic'],
  ['posion', 'poison'],
  ['green', 'poison'],
  ['ghost', 'ghost'],
  ['skeleton', 'ghost'],
  ['death', 'ghost'],
  ['mech', 'steel'],
  ['jelly', 'water'],
  ['octopus', 'water'],
  ['squid', 'water'],
  ['crocodile', 'water'],
  ['frog', 'water'],
  ['sting', 'bug'],
  ['mosquito', 'bug'],
  ['scrop', 'bug'],
  ['spider', 'bug'],
  ['dove', 'flying'],
  ['spirit', 'fairy'],
  ['forest', 'grass'],
  ['nature', 'grass']
]
/** Từ trong id → race (thứ tự là ưu tiên). */
const RACE_WORDS = [
  ['spider_woman', 'insectfolk'],
  ['frog', 'anuran'],
  ['snake', 'serpent'],
  ['scrop', 'arachnid'],
  ['spider', 'arachnid'],
  ['sting', 'hymenopteran'],
  ['mosquito', 'neopteron'],
  ['wolf', 'canid'],
  ['dog', 'canid'],
  ['dove', 'bird'],
  ['monkey', 'primate'],
  ['crocodile', 'crocodilian'],
  ['spirit', 'elementalSpirit'],
  ['ghost', 'ghost'],
  ['deathgod', 'ghost'],
  ['skeleton', 'skeleton'],
  ['mech', 'machine'],
  ['jelly', 'cnidarian'],
  ['octopus', 'cephalopod'],
  ['squid', 'cephalopod'],
  ['guard', 'human'],
  ['minner', 'dwarf'],
  ['forest_guardian', 'tree'],
  ['nature_mother', 'natureSpirit'],
  ['spiker', 'wildBeast']
]
const tierOf = (level) =>
  level <= 15 ? 'small' : level <= 30 ? 'medium' : level <= 45 ? 'peak' : 'large'
const nameOf = (id) =>
  id
    .split('_')
    .map((word) => WORD_FIX[word] ?? word)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
const pickWord = (table, id) => table.find(([word]) => id.includes(word))?.[1]

const monsters = new Map()
for (const table of ['biokept/BosMonsterTable.txt', 'biokept/BoxMonsterTable.txt'])
  for (const monster of readDumpJson(table))
    if (
      !NON_CREATURE_TYPES.has(monster.monster_type) &&
      !EXCLUDED.has(monster.name) &&
      !NUMBERED_VARIANT.test(monster.name) &&
      !SKILL_ENTRY.test(monster.name) &&
      !monster.name.startsWith('gemstone') &&
      !monsters.has(monster.name)
    )
      monsters.set(monster.name, monster)

const species = [...monsters.values()].map((monster) => {
  const id = monster.name
  const raceId = pickWord(RACE_WORDS, id)
  if (!raceId) throw new Error(`Chưa đặt race cho ${id} (thêm vào RACE_WORDS)`)
  const superId = `super_${id}`
  const level = Math.max(1, monster.level)
  const tier = id.startsWith('super_') ? 'large' : tierOf(level)
  return {
    name: nameOf(id),
    elements: [pickWord(ELEMENT_WORDS, id) ?? 'normal'],
    raceId,
    tier,
    stats: statsAtTier(
      {
        hp: Math.sqrt(monster.base_hp),
        attack: Math.sqrt(monster.base_attack),
        defense: Math.sqrt(monster.base_defense + 1),
        spAttack: Math.sqrt(monster.base_attack),
        spDefense: Math.sqrt(monster.base_defense + 1),
        speed: Math.sqrt(monster.base_speed + 1)
      },
      tier
    ),
    category: `Level ${monster.level} creature`,
    evolutions: monsters.has(superId) ? [{ name: nameOf(superId), level: 32 }] : []
  }
})
writeSource('biokept', { source: 'biokept', origin: 'fantasy', species })
