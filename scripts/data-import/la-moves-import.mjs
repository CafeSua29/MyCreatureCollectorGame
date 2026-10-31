/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập các chiêu Legends: Arceus còn thiếu mà hiệu ứng có sẵn làm được (bước 5h3, chủ project duyệt
// 2026-10-24; danh sách chiêu ở move-styles-import.mjs). Theo quy ước nhập Pokémon
// (docs/rules/content-sources.md): số theo bản chính (@pkmn/dex), phần cần cơ chế chưa có thì bỏ
// (lăn liên tiếp của Ice Ball, hạ accuracy của Mud Bomb). Draco Meteor, Steel Beam, Volt Tackle chỉ
// học qua tutor (không loài nào học bằng level): nhập skill, học qua sách kỹ năng, không thêm
// learnset (docs/rules/skill-books.md).
// Learnset: level học theo đời mới nhất có học bằng level (level 0 = 1), chỉ loài trùng id với dex.
// @pkmn/dex không phải dependency của project: cài vào thư mục tạm rồi truyền đường dẫn:
//   npm install @pkmn/dex --prefix <tạm>
//   node scripts/data-import/la-moves-import.mjs <tạm>/node_modules/@pkmn/dex/build/index.mjs
// rồi prettier + npm test. Chạy lại được (ghi đè skill / tên cùng id, không thêm learnset trùng).

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = new URL('../../', import.meta.url)
const path = (relative) => new URL(relative, root)
const readJson = (relative) => JSON.parse(readFileSync(path(relative), 'utf8'))
const writeJson = (relative, value) =>
  writeFileSync(path(relative), JSON.stringify(value, null, 2) + '\n', 'utf8')

const dexPath = process.argv[2]
if (!dexPath) throw new Error('Thiếu đường dẫn tới @pkmn/dex (xem đầu file)')
const { Dex } = await import(pathToFileURL(dexPath).href)

const selfStat = (stat, delta, chance) => ({
  type: 'statStage',
  params: { who: 'self', stat, delta, ...(chance === undefined ? {} : { chance }) }
})
const healSelf = { type: 'heal', params: { percent: 50 } }
const ALL_STATS = ['attack', 'defense', 'spAttack', 'spDefense', 'speed']

/** Chiêu nhập: hiệu ứng theo luật project; tên hiển thị vi / en. */
const MOVES = [
  {
    dex: 'Bubble',
    vi: 'Bong bóng',
    target: 'allEnemies',
    effects: [
      { type: 'statStage', params: { who: 'target', stat: 'speed', delta: -1, chance: 10 } }
    ]
  },
  { dex: 'Ice Ball', vi: 'Cầu băng', effects: [] },
  { dex: 'Mud Bomb', vi: 'Bom bùn', effects: [] },
  {
    dex: 'Ominous Wind',
    vi: 'Gió điềm gở',
    effects: ALL_STATS.map((stat) => selfStat(stat, 1, 10))
  },
  { dex: 'Recover', vi: 'Hồi phục', effects: [healSelf] },
  { dex: 'Roost', vi: 'Đậu nghỉ', effects: [healSelf] },
  { dex: 'Soft-Boiled', vi: 'Trứng luộc', effects: [healSelf] },
  { dex: 'Splash', vi: 'Vùng vẫy', effects: [] },
  // Chiêu tutor (học qua sách kỹ năng): Draco Meteor như Overheat, Steel Beam bỏ phần mất máu như
  // Mind Blown, Volt Tackle bỏ phản lực.
  { dex: 'Draco Meteor', vi: 'Mưa sao long tộc', effects: [selfStat('spAttack', -2)] },
  { dex: 'Steel Beam', vi: 'Tia thép', effects: [] },
  {
    dex: 'Volt Tackle',
    vi: 'Xung điện lao tới',
    effects: [{ type: 'applyStatus', params: { statusId: 'paralysis', chance: 10 } }]
  },
  {
    dex: 'Take Heart',
    vi: 'Lấy lại tinh thần',
    effects: [{ type: 'cureStatus', params: {} }, selfStat('spAttack', 1), selfStat('spDefense', 1)]
  }
]

/** Tên tiếng Anh → id camelCase của project (cùng cách đặt id lúc nhập). */
function toId(name) {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.:]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  return words
    .map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1)))
    .join('')
}

const CATEGORY = { Physical: 'physical', Special: 'special', Status: 'status' }

/** Skill của project từ chiêu dex: mục tiêu một địch / bản thân trừ khi ghi khác. */
function skillOf(move, entry) {
  const status = move.category === 'Status'
  return {
    id: toId(move.name),
    elementId: move.type.toLowerCase(),
    category: CATEGORY[move.category],
    power: status ? 0 : move.basePower,
    accuracy: move.accuracy === true ? 100 : move.accuracy,
    target: entry.target ?? (status ? 'self' : 'enemy'),
    effects: entry.effects,
    priority: move.priority
  }
}

/** Level học bằng level ở đời mới nhất có (dạng "9L30"); null = không học bằng level. */
function levelOf(sources) {
  let best = null
  for (const source of sources) {
    const match = /^(\d+)L(\d+)$/.exec(source)
    if (!match) continue
    const gen = Number(match[1])
    if (best === null || gen > best.gen) best = { gen, level: Math.max(1, Number(match[2])) }
  }
  return best?.level ?? null
}

const skills = readJson('src/data/skills.json')
const species = readJson('src/data/species.json')
const names = {
  vi: readJson('src/data/i18n/vi/skills.json'),
  en: readJson('src/data/i18n/en/skills.json')
}

const imported = []
for (const entry of MOVES) {
  const move = Dex.moves.get(entry.dex)
  if (!move.exists) throw new Error(`dex không có chiêu "${entry.dex}"`)
  const skill = skillOf(move, entry)
  const index = skills.findIndex((s) => s.id === skill.id)
  if (index >= 0) skills[index] = { ...skills[index], ...skill }
  else skills.push(skill)
  names.vi[skill.id] = entry.vi
  names.en[skill.id] = move.name
  imported.push({ id: skill.id, dexId: move.id, learners: [] })
}

const dexSpecies = {}
for (const s of Dex.species.all()) dexSpecies[toId(s.name)] ??= s
for (const monster of species) {
  const dex = dexSpecies[monster.id]
  if (!dex || !Array.isArray(monster.learnset)) continue
  const learnset = (await Dex.learnsets.get(dex.id))?.learnset ?? {}
  let changed = false
  for (const entry of imported) {
    const level = levelOf(learnset[entry.dexId] ?? [])
    if (level === null || monster.learnset.some((l) => l.skillId === entry.id)) continue
    monster.learnset.push({ level, skillId: entry.id })
    entry.learners.push(monster.id)
    changed = true
  }
  // Chỉ xếp lại learnset vừa thêm mục (theo level; cùng level giữ thứ tự cũ, mục mới cuối).
  if (changed) monster.learnset.sort((a, b) => a.level - b.level)
}

writeJson('src/data/skills.json', skills)
writeJson('src/data/species.json', species)
writeJson('src/data/i18n/vi/skills.json', names.vi)
writeJson('src/data/i18n/en/skills.json', names.en)
writeJson(
  'scripts/data-import/la-moves-report.json',
  imported.map(({ id, learners }) => ({ id, learners: learners.length, species: learners }))
)
console.log(imported.map(({ id, learners }) => `${id}: ${learners.length} loài`).join('\n'))
