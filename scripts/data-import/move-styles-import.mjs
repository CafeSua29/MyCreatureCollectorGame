/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Danh sách skill có thế mạnh / thế nhanh (docs/rules/move-styles.md): các chiêu Pokémon có trong
// Legends: Arceus (danh sách chính thức, xem LEGENDS_ARCEUS_MOVES; @pkmn/dex không có dữ liệu này).
// Chạy: node scripts/data-import/move-styles-import.mjs          (chỉ ghi báo cáo)
//       node scripts/data-import/move-styles-import.mjs --apply  (ghi `styles: true` vào skills.json)
// rồi npx prettier --write src/data. Chạy lại được (skill đã có `styles` giữ nguyên giá trị).

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const dataDir = path.join(root, 'src/data')
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
const reportPath = path.join(import.meta.dirname, 'move-styles-report.json')

/**
 * Mọi chiêu có trong Legends: Arceus (176 chiêu, tên tiếng Anh như game gốc). Nguồn: bảng chiêu của
 * Dittobase (dittobase.com/legends-arceus/moves), đối chiếu số lượng với Bisafans (2026-10-24).
 */
const LEGENDS_ARCEUS_MOVES = [
  'Absorb',
  'Acid Armor',
  'Acid Spray',
  'Aerial Ace',
  'Air Cutter',
  'Air Slash',
  'Ancient Power',
  'Aqua Jet',
  'Aqua Tail',
  'Astonish',
  'Aura Sphere',
  'Baby-Doll Eyes',
  'Barb Barrage',
  'Bite',
  'Bitter Malice',
  'Bleakwind Storm',
  'Blizzard',
  'Brave Bird',
  'Bubble',
  'Bug Buzz',
  'Bulk Up',
  'Bulldoze',
  'Bullet Punch',
  'Calm Mind',
  'Ceaseless Edge',
  'Charge Beam',
  'Chloroblast',
  'Close Combat',
  'Confusion',
  'Cross Poison',
  'Crunch',
  'Crush Grip',
  'Dark Pulse',
  'Dark Void',
  'Dazzling Gleam',
  'Dire Claw',
  'Double Hit',
  'Double-Edge',
  'Draco Meteor',
  'Dragon Claw',
  'Dragon Pulse',
  'Drain Punch',
  'Draining Kiss',
  'Earth Power',
  'Ember',
  'Energy Ball',
  'Esper Wing',
  'Extrasensory',
  'Fairy Wind',
  'False Swipe',
  'Fire Blast',
  'Fire Fang',
  'Fire Punch',
  'Flame Wheel',
  'Flamethrower',
  'Flare Blitz',
  'Flash Cannon',
  'Focus Energy',
  'Giga Impact',
  'Gust',
  'Head Smash',
  'Headlong Rush',
  'Hex',
  'Hidden Power',
  'High Horsepower',
  'Hurricane',
  'Hydro Pump',
  'Hyper Beam',
  'Hypnosis',
  'Ice Ball',
  'Ice Beam',
  'Ice Fang',
  'Ice Punch',
  'Ice Shard',
  'Icicle Crash',
  'Icy Wind',
  'Infernal Parade',
  'Iron Defense',
  'Iron Head',
  'Iron Tail',
  'Judgment',
  'Leaf Blade',
  'Leaf Storm',
  'Leafage',
  'Leech Life',
  'Liquidation',
  'Lunar Blessing',
  'Mach Punch',
  'Magical Leaf',
  'Magma Storm',
  'Megahorn',
  'Mimic',
  'Moonblast',
  'Mountain Gale',
  'Mud Bomb',
  'Mud-Slap',
  'Mystical Fire',
  'Mystical Power',
  'Nasty Plot',
  'Night Slash',
  'Octazooka',
  'Ominous Wind',
  'Outrage',
  'Overheat',
  'Petal Dance',
  'Pin Missile',
  'Play Rough',
  'Poison Gas',
  'Poison Jab',
  'Poison Powder',
  'Poison Sting',
  'Powder Snow',
  'Power Gem',
  'Power Shift',
  'Psychic',
  'Psycho Cut',
  'Psyshield Bash',
  'Quick Attack',
  'Raging Fury',
  'Recover',
  'Rest',
  'Roar of Time',
  'Rock Slide',
  'Rock Smash',
  'Rollout',
  'Roost',
  'Sandsear Storm',
  'Seed Flare',
  'Self-Destruct',
  'Shadow Ball',
  'Shadow Claw',
  'Shadow Force',
  'Shadow Sneak',
  'Shelter',
  'Silver Wind',
  'Slash',
  'Sleep Powder',
  'Sludge Bomb',
  'Snarl',
  'Soft-Boiled',
  'Spacial Rend',
  'Spark',
  'Spikes',
  'Splash',
  'Spore',
  'Springtide Storm',
  'Stealth Rock',
  'Steel Beam',
  'Stone Axe',
  'Stone Edge',
  'Struggle Bug',
  'Stun Spore',
  'Swift',
  'Swords Dance',
  'Tackle',
  'Take Heart',
  'Teleport',
  'Thunder',
  'Thunder Fang',
  'Thunder Punch',
  'Thunder Shock',
  'Thunder Wave',
  'Thunderbolt',
  'Tri Attack',
  'Triple Arrows',
  'Twister',
  'Venoshock',
  'Victory Dance',
  'Volt Tackle',
  'Water Pulse',
  'Wave Crash',
  'Wild Charge',
  'Wildbolt Storm',
  'Wood Hammer',
  'X-Scissor',
  'Zen Headbutt'
]

/** Id skill của project: camelCase từ tên tiếng Anh ("Double-Edge" → doubleEdge). */
const skillIdOf = (name) =>
  name
    .replace(/[^A-Za-z0-9 -]/g, '')
    .split(/[ -]+/)
    .map((word, i) =>
      i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('')

const skills = read('skills.json')
const comboIds = new Set(read('comboSkills.json').map((combo) => combo.id))
const byId = new Map(skills.map((skill) => [skill.id, skill]))

const matched = []
const missing = []
for (const name of LEGENDS_ARCEUS_MOVES) {
  const id = skillIdOf(name)
  const skill = byId.get(id)
  if (!skill || skill.maxMove || comboIds.has(id)) missing.push({ name, id })
  else matched.push({ name, id })
}

const apply = process.argv.includes('--apply')
if (apply) {
  for (const { id } of matched) {
    const skill = byId.get(id)
    skill.styles ??= true
  }
  fs.writeFileSync(path.join(dataDir, 'skills.json'), JSON.stringify(skills, null, 2) + '\n')
}

const report = {
  applied: apply,
  total: matched.length + missing.length,
  matched: matched.length,
  missing,
  skillIds: matched.map((entry) => entry.id)
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(
  `${apply ? 'Đã ghi' : 'Chưa ghi (thêm --apply)'}: ${matched.length} skill có thế, ` +
    `${missing.length} chiêu chưa có trong skills.json`
)
