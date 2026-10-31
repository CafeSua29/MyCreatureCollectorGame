/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập bậc chí mạng / chính xác / né của skill Pokémon (docs/rules/battle.md mục "Chí mạng", "Bậc
// trận"; dữ liệu ở docs/rules/content-mechanics.md mục "Dữ liệu chí mạng và chính xác / né"):
// - critStage (critRatio − 1 của Showdown) và alwaysCrit (willCrit) cho skill Pokémon đã có;
// - hiệu ứng đổi bậc chính xác / né (PokeAPI move_meta_stat_changes) cho skill Pokémon đã có;
// - nhập lại các chiêu trước đây bỏ vì chưa có bậc chính xác / né / chí mạng (Sand Attack, Double
//   Team, Focus Energy...), learnset level-up thế hệ mới nhất như các đợt trước (content-mechanics.md).
// Skill game khớp move nguồn cùng tên, cùng hệ, cùng loại. Chạy lại được (xóa phần cũ rồi ghi lại).
// Chạy: node scripts/data-import/crit-accuracy-import.mjs rồi node scripts/data-import/zmove-import.mjs
// (Z-Power của chiêu mới) và npx prettier --write src/data

import fs from 'node:fs'
import path from 'node:path'
import { fetchShowdown, showdownId } from './showdown.mjs'
import { fetchPokeApiCsv, isPokemonSpecies, pokemonMatcher } from './pokeapi.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const dataDir = path.join(root, 'src/data')
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
const write = (file, value) =>
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2) + '\n')

const fetchShowdownMoves = () => fetchShowdown('moves.js')

const kebab = (id) => id.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase()

/** stat_id của PokeAPI → chỉ số có bậc trận của game. */
const POKEAPI_STATS = {
  2: 'attack',
  3: 'defense',
  4: 'spAttack',
  5: 'spDefense',
  6: 'speed',
  7: 'accuracy',
  8: 'evasion'
}
/** Chỉ số do script này quản lý (bậc khác đã nhập từ trước). */
const MANAGED_STATS = ['accuracy', 'evasion']
/** move_targets của PokeAPI nhắm chính quái dùng (đổi bậc lên `self`). */
const SELF_TARGETS = ['user', 'users-field', 'user-and-allies', 'entire-field', 'user-or-ally']
/** move_meta_categories: đòn gây sát thương rồi tăng bậc quái dùng. */
const DAMAGE_RAISE = 'damage+raise'

// ---------- chiêu nhập lại: [id, en, vi, skill] (số theo Pokémon thế hệ mới nhất có chiêu) ----------

const stage = (who, stat, delta, chance) => ({
  type: 'statStage',
  params: { who, stat, delta, ...(chance ? { chance } : {}) }
})
const status = (id, elementId, extra) => ({
  id,
  elementId,
  category: 'status',
  power: 0,
  accuracy: 100,
  target: 'enemy',
  effects: [],
  priority: 0,
  ...extra
})
const NEW_MOVES = [
  [
    'sandAttack',
    'Sand Attack',
    'Ném cát',
    status('sandAttack', 'ground', { effects: [stage('target', 'accuracy', -1)] })
  ],
  [
    'smokescreen',
    'Smokescreen',
    'Màn khói',
    status('smokescreen', 'normal', { effects: [stage('target', 'accuracy', -1)] })
  ],
  [
    'flash',
    'Flash',
    'Chớp sáng',
    status('flash', 'normal', { effects: [stage('target', 'accuracy', -1)] })
  ],
  [
    'kinesis',
    'Kinesis',
    'Uốn cong',
    status('kinesis', 'psychic', { accuracy: 80, effects: [stage('target', 'accuracy', -1)] })
  ],
  [
    'doubleTeam',
    'Double Team',
    'Ảnh phân thân',
    status('doubleTeam', 'normal', { target: 'self', effects: [stage('self', 'evasion', 1)] })
  ],
  [
    'minimize',
    'Minimize',
    'Thu nhỏ',
    status('minimize', 'normal', { target: 'self', effects: [stage('self', 'evasion', 2)] })
  ],
  [
    'sweetScent',
    'Sweet Scent',
    'Hương ngọt',
    status('sweetScent', 'normal', {
      target: 'allEnemies',
      effects: [stage('target', 'evasion', -2)]
    })
  ],
  // Focus Energy: +2 bậc chí mạng tới khi rời sân; đã có thì không có tác dụng.
  [
    'focusEnergy',
    'Focus Energy',
    'Tập trung khí',
    status('focusEnergy', 'normal', {
      target: 'self',
      spell: { after: [{ do: 'focus', to: 'self', stages: 2 }] }
    })
  ],
  [
    'karateChop',
    'Karate Chop',
    'Chặt karate',
    {
      id: 'karateChop',
      elementId: 'fighting',
      category: 'physical',
      power: 50,
      accuracy: 100,
      target: 'enemy',
      effects: [],
      priority: 0,
      critStage: 1
    }
  ]
]

// ---------- chạy ----------

const [showdown, moves, meta, statChanges, targets, metaCategories, pokemonRows, versionGroups] =
  await Promise.all([
    fetchShowdownMoves(),
    fetchPokeApiCsv('moves'),
    fetchPokeApiCsv('move_meta'),
    fetchPokeApiCsv('move_meta_stat_changes'),
    fetchPokeApiCsv('move_targets'),
    fetchPokeApiCsv('move_meta_categories'),
    fetchPokeApiCsv('pokemon'),
    fetchPokeApiCsv('version_groups')
  ])
const types = await fetchPokeApiCsv('types')
const damageClasses = { 1: 'status', 2: 'physical', 3: 'special' }
const typeName = Object.fromEntries(types.map((t) => [t.id, t.identifier]))
const targetName = Object.fromEntries(targets.map((t) => [t.id, t.identifier]))
const categoryName = Object.fromEntries(metaCategories.map((c) => [c.id, c.identifier]))
const metaOf = new Map(meta.map((m) => [m.move_id, m]))
const changesOf = new Map()
for (const row of statChanges) {
  if (!changesOf.has(row.move_id)) changesOf.set(row.move_id, [])
  changesOf.get(row.move_id).push(row)
}
const moveByKebab = new Map(moves.map((m) => [m.identifier, m]))
const report = {
  critStage: [],
  alwaysCrit: [],
  accuracyEffects: [],
  skippedTargetMismatch: [],
  newMoves: [],
  learnsets: {}
}

/** Move PokeAPI cùng tên, cùng hệ, cùng loại với skill game; không có = null. */
function pokeApiMove(skill) {
  const move = moveByKebab.get(kebab(skill.id))
  if (!move) return null
  const sameType = typeName[move.type_id] === skill.elementId
  return sameType && damageClasses[move.damage_class_id] === skill.category ? move : null
}

/** Hiệu ứng đổi bậc chính xác / né của move PokeAPI theo đúng game gốc. */
function accuracyEffects(move) {
  const moveMeta = metaOf.get(move.id)
  const chance = Number(moveMeta?.stat_chance ?? 0)
  const damaging = move.damage_class_id !== '1'
  const self = damaging
    ? categoryName[moveMeta?.meta_category_id] === DAMAGE_RAISE
    : SELF_TARGETS.includes(targetName[move.target_id])
  return (changesOf.get(move.id) ?? [])
    .map((row) => ({ stat: POKEAPI_STATS[row.stat_id], delta: Number(row.change) }))
    .filter(({ stat }) => MANAGED_STATS.includes(stat))
    .map(({ stat, delta }) =>
      stage(self ? 'self' : 'target', stat, delta, chance > 0 && chance < 100 ? chance : undefined)
    )
}

const newIds = new Set(NEW_MOVES.map(([id]) => id))
const skills = read('skills.json').filter((skill) => !newIds.has(skill.id))
for (const skill of skills) {
  if (skill.maxMove || skill.zMove) continue
  delete skill.critStage
  delete skill.alwaysCrit
  const sd = showdown[showdownId(skill.id)]
  const move = pokeApiMove(skill)
  if (!move) continue
  skill.effects = skill.effects.filter(
    (e) => !(e.type === 'statStage' && MANAGED_STATS.includes(e.params.stat))
  )
  // Skill game nhắm phe mình mà chiêu gốc hạ bậc địch (Defog của game nhắm self): bỏ, ghi báo cáo.
  const onOwnSide = ['self', 'ally', 'allAllies'].includes(skill.target)
  const all = accuracyEffects(move)
  const added = onOwnSide ? all.filter((e) => e.params.who === 'self') : all
  if (added.length < all.length) report.skippedTargetMismatch.push(skill.id)
  if (added.length > 0) {
    skill.effects.push(...added)
    report.accuracyEffects.push(skill.id)
  }
  if (skill.power > 0 && sd) {
    if (sd.willCrit) {
      skill.alwaysCrit = true
      report.alwaysCrit.push(skill.id)
    } else if (sd.critRatio > 1) {
      skill.critStage = sd.critRatio - 1
      report.critStage.push(skill.id)
    }
  }
}

// Learnset: level-up ở thế hệ mới nhất có level-up của loài; chiêu không loài nào còn học ở thế hệ
// đó thì lấy thế hệ gần nhất mà loài còn học chiêu đó (như "Dữ liệu chiêu sân Pokémon còn lại").
const pokemonMoves = await fetchPokeApiCsv('pokemon_moves')
const vgOrder = Object.fromEntries(versionGroups.map((vg) => [vg.id, Number(vg.order)]))
const levelUp = new Map()
for (const row of pokemonMoves) {
  if (row.pokemon_move_method_id !== '1') continue
  if (!levelUp.has(row.pokemon_id)) levelUp.set(row.pokemon_id, [])
  levelUp.get(row.pokemon_id).push(row)
}
const match = pokemonMatcher(pokemonRows)
const species = read('species.json')
const rowsOf = (entry) => {
  const own = levelUp.get(match(entry.id)?.id ?? '')
  if (own?.length) return own
  const base = entry.formOf ? match(entry.formOf) : null
  return base ? (levelUp.get(base.id) ?? []) : []
}
const newMoveIds = Object.fromEntries(
  NEW_MOVES.map(([id]) => [moveByKebab.get(kebab(id))?.id, id]).filter(([moveId]) => moveId)
)
const latestOf = (rows) =>
  rows.reduce((best, row) => Math.max(best, vgOrder[row.version_group_id]), -1)
const plan = new Map()
for (const entry of species.filter(isPokemonSpecies)) {
  const rows = rowsOf(entry)
  const latest = latestOf(rows)
  for (const [moveId, skillId] of Object.entries(newMoveIds)) {
    const learned = rows.filter((row) => row.move_id === moveId)
    if (learned.length === 0) continue
    const inLatest = learned.filter((row) => vgOrder[row.version_group_id] === latest)
    const fallbackVg = latestOf(learned)
    const fallback = learned.filter((row) => vgOrder[row.version_group_id] === fallbackVg)
    plan.set(`${entry.id}|${skillId}`, { entry, skillId, inLatest, fallback })
  }
}
const learnersInLatest = new Set(
  [...plan.values()].filter((p) => p.inLatest.length > 0).map((p) => p.skillId)
)
for (const entry of species) {
  if (entry.learnset) entry.learnset = entry.learnset.filter((e) => !newIds.has(e.skillId))
}
for (const { entry, skillId, inLatest, fallback } of plan.values()) {
  const rows = learnersInLatest.has(skillId) ? inLatest : fallback
  if (rows.length === 0) continue
  const level = Math.max(1, Math.min(...rows.map((row) => Number(row.level))))
  entry.learnset.push({ level, skillId })
  entry.learnset.sort((a, b) => a.level - b.level)
  report.learnsets[skillId] = (report.learnsets[skillId] ?? 0) + 1
}
write('species.json', species)

// Chiêu mới không loài nào học bằng level-up (kể cả thế hệ cũ) thì không nhập (như Happy Hour).
const kept = NEW_MOVES.filter(([id]) => report.learnsets[id] > 0)
report.newMoves = kept.map(([id]) => id)
report.noLearners = NEW_MOVES.filter(([id]) => !report.learnsets[id]).map(([id]) => id)
write('skills.json', [...skills, ...kept.map(([, , , skill]) => skill)])
for (const language of ['en', 'vi']) {
  const texts = read(`i18n/${language}/skills.json`)
  for (const [id, en, vi] of NEW_MOVES) {
    if (report.newMoves.includes(id)) texts[id] = language === 'en' ? en : vi
    else delete texts[id]
  }
  write(`i18n/${language}/skills.json`, texts)
}

// Đồ cầm không tiêu hao tăng bậc chí mạng (docs/rules/equipment.md mục "Đồ cầm"): Razor Claw +1
// (mọi loài; vẫn là đồ cầm tiến hóa của Sneasel), Leek +2 (dòng Farfetch'd), Lucky Punch +2 (Chansey).
// Scope Lens đã là trang bị (% chí mạng theo bậc hiếm) nên giữ nguyên.
const CRIT_HELD_ITEMS = [
  { id: 'razorClaw', en: 'Razor Claw', vi: 'Vuốt sắc', stages: 1, price: 500 },
  {
    id: 'leek',
    en: 'Leek',
    vi: 'Tỏi tây',
    stages: 2,
    price: 300,
    speciesIds: ['farfetchd', 'farfetchdGalar', 'sirfetchd']
  },
  {
    id: 'luckyPunch',
    en: 'Lucky Punch',
    vi: 'Găng may mắn',
    stages: 2,
    price: 300,
    speciesIds: ['chansey']
  }
]
const items = read('items.json')
for (const def of CRIT_HELD_ITEMS) {
  const old = items.find((item) => item.id === def.id)
  const item = {
    id: def.id,
    category: 'held',
    price: old?.price ?? def.price,
    shop: true,
    shopWeight: old?.shopWeight ?? 1,
    ...(old?.fixedPrice ? { fixedPrice: true } : {}),
    hooks: [{ type: 'critStage', params: { stages: def.stages } }],
    persistent: true,
    ...(def.speciesIds ? { speciesIds: def.speciesIds } : {})
  }
  if (old) items[items.indexOf(old)] = item
  else items.push(item)
}
write('items.json', items)
for (const language of ['en', 'vi']) {
  const texts = read(`i18n/${language}/items.json`)
  for (const def of CRIT_HELD_ITEMS) texts[def.id] ??= def[language]
  write(`i18n/${language}/items.json`, texts)
}

// Super Luck: +1 bậc chí mạng như Pokémon (trước đây +100% tỉ lệ).
const traits = read('traits.json')
const superLuck = traits.find((trait) => trait.id === 'superLuck')
if (superLuck) superLuck.hooks = [{ type: 'critStage', params: { stages: 1 } }]
write('traits.json', traits)

fs.writeFileSync(
  path.join(root, 'scripts/data-import/crit-accuracy-report.json'),
  JSON.stringify(report, null, 2) + '\n'
)
console.log(
  `critStage ${report.critStage.length}, alwaysCrit ${report.alwaysCrit.length}, ` +
    `chính xác / né ${report.accuracyEffects.length}, chiêu mới ${report.newMoves.length}, ` +
    `learnset ${JSON.stringify(report.learnsets)}`
)
