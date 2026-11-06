/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập nội dung Portals of Phereon (content-sources-real.md mục "Portals of Phereon"). Các bước:
//   node scripts/data-import/phereon-import.mjs element   (hệ Nấm: hệ, đồ theo hệ, skill, trạng thái, minion)
//   node scripts/data-import/phereon-fetch.mjs; species-batch-import.mjs sources/portalsOfPhereon.json
//   node scripts/data-import/phereon-import.mjs traits    (passive, special trait, gen → trait; tinh chất)
//   node scripts/data-import/phereon-import.mjs skills    (skill chủ động)
//   node scripts/data-import/phereon-import.mjs systems   (luyện thể, tinh chất, số cân bằng)
//   node scripts/data-import/phereon-import.mjs species   (ability, chiêu Nấm của loài vừa nhập)
// Chạy lại được: mục đã có thì ghi đè đúng id của script, không đụng dữ liệu khác.

import { readFileSync, writeFileSync } from 'node:fs'

import {
  addElementContent,
  addNames,
  addSkills,
  addStatuses,
  dataFile,
  readJson,
  writeJson
} from './element-common.mjs'
import { readDumpJson } from './game-files/gameFiles.mjs'
import {
  ADULT_TRIGGERS,
  GENES,
  MINIONS,
  PASSIVES,
  RESCUED_GENES,
  RESCUED_PASSIVES,
  SPECIAL_TRAITS,
  STATUSES,
  TRIGGERS,
  TRIGGER_LABELS
} from './phereon/conversions.mjs'
import { REJECTED_SKILLS, SOURCE_ROWS, convertSkill } from './phereon/skills.mjs'
import { BALANCE, ESSENCES, REFINEMENTS } from './phereon/systems.mjs'

const SOURCE = 'portalsOfPhereon'
const LABEL = 'Portals of Phereon'

// ---------- Hệ Nấm ----------

const FUNGAL = {
  id: 'fungal',
  suffix: 'Fungal',
  vi: 'Nấm',
  viTitle: 'Nấm',
  en: 'Fungal',
  divineSkills: ['sporeBurst', 'mycelialCrush'],
  workPercents: { farming: 50 }
}
// Gốc không có bảng khắc hệ (kháng theo loại sát thương; Fungal đánh hệ Độc): chọn theo chủ đề nấm: phân
// hủy cỏ / đất / nước; sợ lửa, băng, ánh sáng.
const EFFECTIVENESS = {
  fungal: {
    grass: 2,
    ground: 2,
    water: 2,
    fire: 0.5,
    steel: 0.5,
    poison: 0.5,
    flying: 0.5,
    fungal: 0.5
  },
  fire: { fungal: 2 },
  ice: { fungal: 2 },
  light: { fungal: 2 },
  grass: { fungal: 0.5 },
  water: { fungal: 0.5 },
  ground: { fungal: 0.5 },
  electric: { fungal: 0.5 },
  dark: { fungal: 0.5 }
}
const attack = (id, category, power, fields = {}) => ({
  id,
  elementId: 'fungal',
  category,
  power,
  accuracy: 100,
  target: 'enemy',
  effects: [],
  priority: 0,
  ...(category === 'physical' ? { contact: true } : {}),
  ...fields
})
const applySpore = (chance) => [
  { type: 'applyStatus', params: { statusId: 'spored', ...(chance ? { chance } : {}) } }
]
// Skill gốc của hệ Nấm (SporeStrike, FungalArmor, FungalShift, FungalFlight, SporeBurst, FungalMissiles...).
const FUNGAL_SKILLS = [
  [
    attack('sporeTouch', 'physical', 40, { effects: applySpore(20) }),
    'Chạm bào tử',
    'Spore Touch',
    1
  ],
  [
    attack('sporeStrike', 'physical', 70, { effects: applySpore(30) }),
    'Đòn bào tử',
    'Spore Strike',
    14
  ],
  [
    attack('fungalMissiles', 'special', 25, { hits: { min: 2, max: 5 } }),
    'Đạn nấm',
    'Fungal Missiles',
    8
  ],
  [
    attack('sporeBurst', 'special', 90, { target: 'allEnemies', effects: applySpore(30) }),
    'Bùng bào tử',
    'Spore Burst',
    38
  ],
  [attack('fungalFlight', 'physical', 80), 'Lượn sợi nấm', 'Fungal Flight', 26],
  [
    attack('mycelialCrush', 'physical', 120, { recoilPercent: 25 }),
    'Nghiền sợi nấm',
    'Mycelial Crush',
    46
  ],
  [
    {
      id: 'fungalArmor',
      elementId: 'fungal',
      category: 'status',
      power: 0,
      accuracy: 100,
      target: 'self',
      effects: [{ type: 'statStage', params: { who: 'self', stat: 'defense', delta: 2 } }],
      priority: 0,
      snatchable: true
    },
    'Giáp nấm',
    'Fungal Armor',
    18
  ],
  [
    {
      id: 'sporeCloud',
      elementId: 'fungal',
      category: 'status',
      power: 0,
      accuracy: 90,
      target: 'allEnemies',
      effects: applySpore(),
      priority: 0,
      reflectable: true
    },
    'Mây bào tử',
    'Spore Cloud',
    22
  ]
]
// Chiêu game cần theo hệ: chiêu Max, Z-Move (như ba hệ Cassette Beasts).
const maxMove = {
  ...attack('maxSpores', 'physical', 100),
  contact: undefined,
  effects: [{ type: 'sideStatStage', params: { side: 'foe', stats: ['accuracy'], delta: -1 } }],
  maxMove: 'max',
  alwaysHits: true
}
const zMove = {
  ...attack('myriadBloom', 'physical', 100),
  contact: undefined,
  zMove: 'z',
  alwaysHits: true
}

function addMinions() {
  const minions = readJson('minions.json')
  const names = { vi: {}, en: {} }
  for (const [minion, vi, en] of MINIONS) {
    names.vi[minion.id] = vi
    names.en[minion.id] = en
    const at = minions.findIndex((entry) => entry.id === minion.id)
    if (at >= 0) minions[at] = minion
    else minions.push(minion)
  }
  writeJson('minions.json', minions)
  addNames('minions', names)
}

function importElement() {
  addMinions()
  addStatuses(STATUSES)
  addSkills([
    ...FUNGAL_SKILLS.map(([skill, vi, en]) => [skill, vi, en]),
    [maxMove, 'Max Bào tử', 'Max Spores'],
    [zMove, 'Vạn Nấm Trổ Hoa', 'Myriad Bloom']
  ])
  addElementContent([FUNGAL], EFFECTIVENESS)
  console.log('hệ Nấm xong; chạy tiếp element-reactions-import.mjs')
}

// ---------- Passive, special trait, gen → trait ----------

const PASSIVE_TYPES = [
  'onMove',
  'onTurnStart',
  'onTurnEnd',
  'onAttack',
  'onDeath',
  'onFuck',
  'onGettingFucked',
  'Always',
  'onGettingAttacked',
  'onSeduce',
  'onGettingSeduced',
  'CombatStart',
  'CombatEnd',
  'Global'
]
const spaced = (id) => id.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
const camel = (id) => id[0].toLowerCase() + id.slice(1).replace(/_/g, '')
const isConverted = (entry) => entry && !entry.reject && !entry.defer
const allPassives = { ...PASSIVES, ...RESCUED_PASSIVES }
// Kiểu kích hoạt không có "bên kia": hiệu ứng nhắm mục tiêu của gốc đổi sang một địch ngẫu nhiên.
const NO_OTHER = new Set(['onMove', 'onTurnStart', 'onTurnEnd', 'CombatStart', 'Always'])
const withoutOther = (effects) =>
  JSON.parse(JSON.stringify(effects).replaceAll('"to":"other"', '"to":"randomFoe"'))

const targetsOther = (entry) => /"(to|from)":"other"/.test(JSON.stringify(entry.effects))
// Kiểu kích hoạt khi không loài nào mang: theo mô tả gốc nếu quy đổi ghi `trigger`, không thì đoán.
const defaultTrigger = (entry) =>
  entry.trigger ?? (targetsOther(entry) ? 'onAttack' : 'CombatStart')

function hooksOf(entry, trigger) {
  if (entry.hooks) return entry.hooks
  const effects = NO_OTHER.has(trigger) ? withoutOther(entry.effects) : entry.effects
  return TRIGGERS[trigger](effects)
}

/** Trait của một passive theo kiểu kích hoạt (hook cố định thì một trait chung). */
const passiveTraitId = (name, trigger, entry) =>
  entry.hooks
    ? `${camel(name)}Phereon`
    : `${camel(name)}${trigger[0].toUpperCase()}${trigger.slice(1)}Phereon`

const creatures = () => {
  const source = JSON.parse(
    readFileSync(new URL('./sources/portalsOfPhereon.json', import.meta.url), 'utf8')
  )
  const key = (name) => name.replace(/[^A-Za-z]/g, '').toLowerCase()
  const wanted = new Set(source.species.map((entry) => key(entry.name)))
  return readDumpJson('phereon.json').characters.filter(
    (row) => wanted.has(key(row.species)) || row.species === 'LoveSpider'
  )
}

/**
 * Độ hiếm gen gốc → loại trait: common → positive (gen xấu → negative); rare / legendary / special → rare
 * (special của gốc chỉ có qua sự kiện; game cho mọi kết quả có cơ hội nên để ở nhóm hiếm).
 */
const COMMON_GENES = new Set(['Consistent', 'Strong', 'Heavy', 'Intelligent', 'Resilient', 'Fast'])
const geneKind = (name, entry) =>
  entry.kind === 'negative' ? 'negative' : COMMON_GENES.has(name) ? 'positive' : 'rare'

/** Trait do script này sinh (passive / gen / special Phereon, trait của tinh chất). */
const isOwnTraitId = (id) => id.endsWith('Phereon') || /^essence.*Trait$/.test(id)

function importTraits() {
  const traits = readJson('traits.json').filter((trait) => !isOwnTraitId(trait.id))
  const namesVi = readJson('i18n/vi/traits.json')
  const namesEn = readJson('i18n/en/traits.json')
  // Xóa tên của lần nhập trước (id theo kiểu kích hoạt có thể đổi giữa các lần chạy).
  for (const table of [namesVi, namesEn]) {
    for (const id of Object.keys(table)) if (isOwnTraitId(id)) delete table[id]
  }
  const taken = new Set(traits.map((trait) => trait.id))
  const takenNames = new Set(traits.map((trait) => (namesEn[trait.id] ?? trait.id).toLowerCase()))
  const add = (id, kind, hooks, name, suffix) => {
    if (taken.has(id)) return
    taken.add(id)
    traits.push({ id, kind, hooks })
    const en = suffix ? `${name} (${suffix[1]})` : name
    const vi = suffix ? `${name} (${suffix[0]})` : name
    const clash = takenNames.has(en.toLowerCase())
    takenNames.add(en.toLowerCase())
    namesEn[id] = clash ? `${en} [${LABEL}]` : en
    namesVi[id] = clash ? `${vi} [${LABEL}]` : vi
  }
  const counts = { passive: 0, special: 0, gene: 0, skipped: 0 }
  // Passive theo kiểu kích hoạt loài đang mang.
  const used = new Map()
  for (const row of creatures()) {
    for (const [typeIndex, name] of row.passives) {
      const trigger = PASSIVE_TYPES[typeIndex]
      if (ADULT_TRIGGERS.has(trigger) || !TRIGGERS[trigger]) continue
      used.set(`${name}@${trigger}`, [name, trigger])
    }
  }
  for (const [name, trigger] of used.values()) {
    const entry = allPassives[name]
    if (!isConverted(entry)) continue
    add(
      passiveTraitId(name, trigger, entry),
      'rare',
      hooksOf(entry, trigger),
      spaced(name),
      entry.hooks ? null : TRIGGER_LABELS[trigger]
    )
    counts.passive++
  }
  // Passive không loài nào mang: kiểu kích hoạt mặc định.
  const usedNames = new Set([...used.values()].map(([name]) => name))
  for (const [name, entry] of Object.entries(allPassives)) {
    if (!isConverted(entry)) {
      counts.skipped++
      continue
    }
    if (usedNames.has(name)) continue
    const trigger = entry.hooks ? 'Always' : defaultTrigger(entry)
    add(
      passiveTraitId(name, trigger, entry),
      'rare',
      hooksOf(entry, trigger),
      spaced(name),
      entry.hooks ? null : TRIGGER_LABELS[trigger]
    )
    counts.passive++
  }
  for (const [name, hooks] of Object.entries(SPECIAL_TRAITS)) {
    if (!Array.isArray(hooks)) {
      counts.skipped++
      continue
    }
    add(`${camel(name)}TraitPhereon`, 'rare', hooks, spaced(name))
    counts.special++
  }
  for (const [name, entry] of Object.entries({ ...GENES, ...RESCUED_GENES })) {
    if (!isConverted(entry)) {
      counts.skipped++
      continue
    }
    add(`${camel(name)}GenePhereon`, geneKind(name, entry), entry.hooks, `${spaced(name)} Gene`)
    counts.gene++
  }
  // Trait tạm của tinh chất trong trận: kind boss (không tung ngẫu nhiên, không chiếm ô).
  for (const [essence, vi, en, hooks] of ESSENCES) {
    if (!hooks) continue
    const id = essence.effect.traitId
    traits.push({ id, kind: 'boss', hooks })
    namesVi[id] = `${vi} (Tinh chất)`
    namesEn[id] = `${en} (Essence)`
  }
  writeJson('traits.json', traits)
  writeJson('i18n/vi/traits.json', namesVi)
  writeJson('i18n/en/traits.json', namesEn)
  console.log('trait', counts)
}

// ---------- Luyện thể, tinh chất, số cân bằng ----------

/** Vị trí kết thúc của object bắt đầu ở `start` (dấu { ), bỏ qua chuỗi. */
function objectEnd(text, start) {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return i + 1
  }
  throw new Error('object không đóng')
}

/** Đặt `key` trong object `parent` cấp đầu (null = gốc): có thì thay giá trị, chưa có thì thêm. */
function setObjectKey(text, parent, key, value) {
  const body = JSON.stringify(value)
  const scopeStart =
    parent === null ? text.indexOf('{') : text.indexOf('{', text.indexOf(`"${parent}": {`))
  const scopeEnd = objectEnd(text, scopeStart)
  const at = text.indexOf(`"${key}": {`, scopeStart)
  if (at >= 0 && at < scopeEnd) {
    const start = text.indexOf('{', at)
    return text.slice(0, start) + body + text.slice(objectEnd(text, start))
  }
  const close = scopeEnd - 1
  return `${text.slice(0, close).trimEnd()},\n"${key}": ${body}\n${text.slice(close)}`
}

function importSystems() {
  writeJson(
    'bodyRefinements.json',
    REFINEMENTS.map(([id, partId, tags, hooks, costMultiplier]) => ({
      id,
      partId,
      tags,
      hooks,
      costMultiplier
    }))
  )
  writeJson(
    'essences.json',
    ESSENCES.map(([essence]) => essence)
  )
  for (const [language, index] of [
    ['vi', 5],
    ['en', 6]
  ]) {
    writeJson(
      `i18n/${language}/bodyRefinements.json`,
      Object.fromEntries(REFINEMENTS.map((entry) => [entry[0], entry[index]]))
    )
  }
  for (const [language, index] of [
    ['vi', 1],
    ['en', 2]
  ]) {
    writeJson(
      `i18n/${language}/essences.json`,
      Object.fromEntries(ESSENCES.map((entry) => [entry[0].id, entry[index]]))
    )
  }
  // Số cân bằng: chỉ thay đúng các khóa của script, không ghi lại cả balance.json.
  const file = dataFile('balance.json')
  let text = readFileSync(file, 'utf8')
  text = setObjectKey(text, 'zones', 'portals', BALANCE.portals)
  if (!/"spring":\s*10,\s*"hive"/.test(text)) {
    text = text.replace(
      /("stepWeights":\s*\{\s*"battle":\s*55,[^}]*"spring":\s*10)/,
      '$1, "hive": 0, "gather": 0'
    )
  }
  for (const key of ['bodyRefinement', 'hatchery', 'essences']) {
    text = setObjectKey(text, null, key, BALANCE[key])
  }
  JSON.parse(text)
  writeFileSync(file, text)
  console.log('luyện thể', REFINEMENTS.length, 'tinh chất', ESSENCES.length)
}

// ---------- Skill chủ động ----------

const skillId = (sourceId) => `${camel(sourceId)}Phereon`

function importSkills() {
  const skills = readJson('skills.json').filter((skill) => !skill.id.endsWith('Phereon'))
  const namesVi = readJson('i18n/vi/skills.json')
  const namesEn = readJson('i18n/en/skills.json')
  for (const table of [namesVi, namesEn]) {
    for (const id of Object.keys(table)) if (id.endsWith('Phereon')) delete table[id]
  }
  const taken = new Set(
    [...Object.values(namesVi), ...Object.values(namesEn)].map((n) => n.toLowerCase())
  )
  const counts = { skills: 0, rejected: 0, unknown: [] }
  for (const row of SOURCE_ROWS) {
    if (REJECTED_SKILLS[row.id]) {
      counts.rejected++
      continue
    }
    const skill = convertSkill(row)
    if (!skill) {
      counts.unknown.push(row.id)
      continue
    }
    const id = skillId(row.id)
    skills.push({ id, ...JSON.parse(JSON.stringify(skill)) })
    const base = spaced(row.id)
    const name = taken.has(base.toLowerCase()) ? `${base} (${LABEL})` : base
    taken.add(name.toLowerCase())
    namesVi[id] = name
    namesEn[id] = name
    counts.skills++
  }
  if (counts.unknown.length)
    throw new Error(`Skill không nhận ra hiệu ứng: ${counts.unknown.join(', ')}`)
  writeJson('skills.json', skills)
  writeJson('i18n/vi/skills.json', namesVi)
  writeJson('i18n/en/skills.json', namesEn)
  console.log('skill', counts.skills, 'không nhập', counts.rejected)
}

// ---------- Ability, learnset của loài ----------

/** Level học skill tùy chọn của gốc (gốc chọn ngẫu nhiên lúc sinh, game học dần theo level). */
const OPTIONAL_LEVEL_START = 10
const OPTIONAL_LEVEL_STEP = 6
/** Giữ skill sinh theo hệ thay cho đòn đánh thường của gốc. */
const GENERATED_KEPT = 2

function phereonLearnset(row, target, skillsById) {
  const known = (name) => {
    const id = skillId(name)
    return skillsById.has(id) ? id : null
  }
  const generated = target.learnset
    .filter(
      (learn) =>
        !learn.skillId.endsWith('Phereon') && (skillsById.get(learn.skillId)?.power ?? 0) > 0
    )
    .slice(0, GENERATED_KEPT)
  const guaranteed = row.guaranteedSkills.map(known).filter(Boolean)
  const optional = row.optionalSkills.map(known).filter(Boolean)
  const seen = new Set(generated.map((learn) => learn.skillId))
  const fresh = (id) => (seen.has(id) ? false : (seen.add(id), true))
  const learnset = [
    ...generated,
    ...guaranteed.filter(fresh).map((id) => ({ level: 1, skillId: id })),
    ...optional
      .filter(fresh)
      .map((id, i) => ({ level: OPTIONAL_LEVEL_START + i * OPTIONAL_LEVEL_STEP, skillId: id }))
  ].sort((a, b) => a.level - b.level)
  if (learnset.length > 0 && learnset[0].level !== 1) learnset[0] = { ...learnset[0], level: 1 }
  return learnset
}

function importSpecies() {
  const species = readJson('species.json')
  const traitIds = new Set(readJson('traits.json').map((trait) => trait.id))
  const skillsById = new Map(readJson('skills.json').map((skill) => [skill.id, skill]))
  const rows = new Map(
    creatures().map((row) => [row.species.replace(/[^A-Za-z]/g, '').toLowerCase(), row])
  )
  const key = (id) => id.toLowerCase()
  const fungalLearnset = FUNGAL_SKILLS.map(([skill, , , level]) => ({ level, skillId: skill.id }))
  const counts = { species: 0, abilities: 0, fungal: 0 }
  const namesEn = readJson('i18n/en/species.json')
  for (const target of species) {
    if (target.source !== SOURCE) continue
    const name = (namesEn[target.id] ?? target.id)
      .replace(/\s*\(.*\)$/, '')
      .replace(/[^A-Za-z]/g, '')
      .toLowerCase()
    const row =
      rows.get(name) ??
      rows.get(key(target.id)) ??
      (name === 'silkspider' ? rows.get('lovespider') : undefined)
    if (!row) continue
    counts.species++
    target.learnset = phereonLearnset(row, target, skillsById)
    const abilities = []
    for (const [typeIndex, passive] of row.passives) {
      const trigger = PASSIVE_TYPES[typeIndex]
      const entry = allPassives[passive]
      if (ADULT_TRIGGERS.has(trigger) || !TRIGGERS[trigger] || !isConverted(entry)) continue
      const id = passiveTraitId(passive, trigger, entry)
      if (traitIds.has(id) && !abilities.includes(id)) abilities.push(id)
    }
    for (const special of row.specialTraits) {
      const id = `${camel(special)}TraitPhereon`
      if (traitIds.has(id) && !abilities.includes(id)) abilities.push(id)
    }
    // Như mọi nguồn: 2 ô ability thường, ability kế là ô ẩn (abilities.md).
    if (abilities.length > 0) {
      target.abilities = abilities.slice(0, 2)
      if (abilities[2]) target.hiddenAbility = abilities[2]
      else delete target.hiddenAbility
      counts.abilities++
    }
    if (target.elementIds.includes('fungal')) {
      const known = new Set(target.learnset.map((learn) => learn.skillId))
      target.learnset = [
        ...target.learnset,
        ...fungalLearnset.filter((learn) => !known.has(learn.skillId))
      ].sort((a, b) => a.level - b.level)
      counts.fungal++
    }
  }
  writeJson('species.json', species)
  console.log(counts)
}

const STEPS = {
  element: importElement,
  traits: importTraits,
  skills: importSkills,
  systems: importSystems,
  species: importSpecies
}
const step = STEPS[process.argv[2]]
if (!step) throw new Error(`Bước: ${Object.keys(STEPS).join(' | ')}`)
step()
