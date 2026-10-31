/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Nhập spell / ability / passive Total War: WARHAMMER III vào dữ liệu game (quyết định ở mục
// "Dữ liệu Total War: WARHAMMER III" của docs/rules/content-sources-more.md).
// Chạy: node scripts/data-import/tww3-import.mjs
// Đầu vào: tww3-source.json (danh sách nguồn), tww3-names-vi.json (tên tiếng Việt).
// Ghi: src/data/{skills,traits,species}.json, src/data/i18n/{vi,en}/{skills,traits}.json,
// scripts/data-import/traits-planned.json, scripts/data-import/tww3-report.json.
// Chạy lại an toàn: id đã nhập (theo report lần trước) thì bỏ qua, learnset không nhân đôi.
// Ngẫu nhiên tất định theo md5(speciesId|skillId), không dùng Math.random.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '../../src/data')

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
/** Ghi JSON 2 dấu cách (src/data chạy prettier sau, giữ định dạng hiện có). */
const writeJson = (path, value, indent = 2) =>
  writeFileSync(path, JSON.stringify(value, null, indent) + '\n')

const source = readJson(join(here, 'tww3-source.json'))
const namesVi = readJson(join(here, 'tww3-names-vi.json'))
const reportPath = join(here, 'tww3-report.json')
const previous = existsSync(reportPath) ? readJson(reportPath) : null

const skills = readJson(join(dataDir, 'skills.json'))
const traits = readJson(join(dataDir, 'traits.json'))
const species = readJson(join(dataDir, 'species.json'))
const races = readJson(join(dataDir, 'races.json'))
const fieldEffects = readJson(join(dataDir, 'fieldEffects.json'))
const plannedPath = join(here, 'traits-planned.json')
const plannedTraits = readJson(plannedPath)
const text = {}
for (const lang of ['vi', 'en']) {
  for (const kind of ['skills', 'traits']) {
    text[`${lang}/${kind}`] = readJson(join(dataDir, `i18n/${lang}/${kind}.json`))
  }
}

const report = {
  counts: {},
  skippedSummons: [],
  reusedSkills: [],
  renamedIds: [],
  plannedEffects: {},
  droppedTokens: [],
  variants: [],
  sameAsExisting: [],
  plannedTraits: {},
  newPlannedHookTypes: [],
  verifyName: [],
  effectGuessed: [],
  unlearnedSkills: [],
  createdSkillIds: [],
  createdTraitIds: [],
  learnset: { warhammer: 0, others: 0, fallback: 0 }
}

const md5 = (value) => createHash('md5').update(value).digest('hex')
const normalizeName = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const fail = (message) => {
  throw new Error(message)
}

// ---------- Bảng archetype (docs: "Bảng archetype") ----------

const ARCHETYPES = {
  direct: {
    category: 'special',
    target: 'enemy',
    power: [60, 85, 110, 130],
    accuracy: [100, 95, 90, 90]
  },
  missile: {
    category: 'special',
    target: 'enemy',
    power: [20, 25, 30, 35],
    accuracy: [100, 100, 100, 100]
  },
  drain: {
    category: 'special',
    target: 'enemy',
    power: [55, 75, 95, 110],
    accuracy: [100, 100, 100, 100]
  },
  aoe: {
    category: 'special',
    target: 'allEnemies',
    power: [50, 70, 90, 110],
    accuracy: [100, 95, 90, 85]
  },
  wind: {
    category: 'special',
    target: 'allEnemies',
    power: [50, 70, 90, 110],
    accuracy: [100, 95, 90, 85]
  },
  breath: {
    category: 'special',
    target: 'allEnemies',
    power: [45, 65, 85, 100],
    accuracy: [100, 100, 100, 100]
  },
  vortex: {
    category: 'special',
    target: 'allEnemies',
    power: [60, 80, 100, 120],
    accuracy: [90, 90, 90, 90]
  },
  melee: {
    category: 'physical',
    target: 'enemy',
    power: [70, 90, 120, 140],
    accuracy: [100, 95, 90, 90]
  },
  meleeAoe: {
    category: 'physical',
    target: 'allEnemies',
    power: [55, 75, 95, 115],
    accuracy: [100, 95, 90, 90]
  },
  shot: {
    category: 'physical',
    target: 'enemy',
    power: [65, 85, 110, 130],
    accuracy: [95, 95, 95, 95]
  },
  finisher: {
    category: 'physical',
    target: 'enemy',
    power: [80, 100, 130, 150],
    accuracy: [85, 85, 85, 85]
  },
  hex: { category: 'status', target: 'enemy', power: [0, 0, 0, 0], accuracy: [90, 90, 90, 90] },
  hexAll: {
    category: 'status',
    target: 'allEnemies',
    power: [0, 0, 0, 0],
    accuracy: [85, 85, 85, 85]
  },
  buff: { category: 'status', target: 'self', power: [0, 0, 0, 0], accuracy: [100, 100, 100, 100] },
  // Mục tiêu allAllies đã có: buff / hồi máu cả quái dùng và đồng đội (thay cho plannedEffects).
  buffTeam: {
    category: 'status',
    target: 'allAllies',
    power: [0, 0, 0, 0],
    accuracy: [100, 100, 100, 100]
  },
  ward: { category: 'status', target: 'self', power: [0, 0, 0, 0], accuracy: [100, 100, 100, 100] },
  stealth: {
    category: 'status',
    target: 'self',
    power: [0, 0, 0, 0],
    accuracy: [100, 100, 100, 100]
  },
  heal: { category: 'status', target: 'self', power: [0, 0, 0, 0], accuracy: [100, 100, 100, 100] },
  healTeam: {
    category: 'status',
    target: 'allAllies',
    power: [0, 0, 0, 0],
    accuracy: [100, 100, 100, 100]
  }
}

/** Hiệu ứng mặc định theo archetype khi hint không ghi phần đó. */
const DEFAULTS = {
  missile: { hits: { min: 2, max: 5 } },
  drain: { drain: 50 },
  hex: { tgt: 'atk-1' },
  hexAll: { tgt: 'atk-1' },
  buff: { self: 'atk+1' },
  buffTeam: { self: 'atk+1' },
  ward: { self: 'def+1,sd+1', plan: ['damageReduction'] },
  stealth: { self: 'spe+2', plan: ['evasion'] },
  finisher: { plan: ['bonusVsLowHp'] },
  heal: { heal: [25, 35, 50, 50] },
  healTeam: { heal: [20, 25, 35, 35] }
}

const LEVEL_BY_TIER = [14, 24, 36, 44]

const STAT_ALIASES = {
  atk: 'attack',
  def: 'defense',
  sa: 'spAttack',
  sd: 'spDefense',
  spe: 'speed',
  hp: 'hp'
}

/** "atk+1,def-2" → [{ stat: 'attack', delta: 1 }, ...]. */
function parseStatList(value, where) {
  return value.split(',').map((part) => {
    const match = /^(atk|def|sa|sd|spe|hp)([+-]\d+(?:\.\d+)?)$/.exec(part.trim())
    if (!match) fail(`${where}: chỉ số sai "${part}"`)
    return { stat: STAT_ALIASES[match[1]], delta: Number(match[2]) }
  })
}

/** "atk+10,def-5" → { attack: 10, defense: -5 }. */
const statPercent = (value, where) =>
  Object.fromEntries(parseStatList(value, where).map(({ stat, delta }) => [stat, delta]))

const tokensOf = (hint) =>
  (hint ?? '')
    .split(';')
    .map((token) => token.trim())
    .filter(Boolean)

// ---------- Spell / ability → skill ----------

const enSkillName = text['en/skills']
const previousSkillIds = new Set(previous?.createdSkillIds ?? [])
/** Tên đã chuẩn hóa → id skill có sẵn trước đợt nhập này (để dùng lại). */
const existingByName = new Map(
  skills
    .filter((skill) => !previousSkillIds.has(skill.id))
    .map((skill) => [normalizeName(enSkillName[skill.id] ?? ''), skill.id])
)

/** Mọi spell / ability kèm nhóm (id lore với spell, faction với ability) và các phe dùng. */
const entries = [
  ...source.lores.flatMap((lore) =>
    lore.spells.map((spell) => ({ ...spell, group: lore.id, factions: lore.users }))
  ),
  ...source.abilities.map((ability) => ({
    ...ability,
    group: ability.faction,
    factions: [ability.faction]
  }))
]

/** id nguồn → id skill trong game (kể cả skill dùng lại). */
const finalSkillId = {}
/** Skill TWW3 mới (không tính dùng lại): id game → mục nguồn. */
const tww3Skills = new Map()

function buildEffects(entry, skill, tokens, where) {
  const defaults = DEFAULTS[entry.archetype] ?? {}
  const effects = []
  const plans = [...(defaults.plan ?? [])]
  const has = (name) => tokens.some((token) => token.split(':')[0] === name)
  const damaging = skill.power > 0
  const statTokens = [
    ...(has('self') ? [] : defaults.self ? [`self:${defaults.self}`] : []),
    ...(has('tgt') ? [] : defaults.tgt ? [`tgt:${defaults.tgt}`] : [])
  ]
  const allTokens = [...statTokens, ...tokens]
  if (!has('drain') && defaults.drain) allTokens.push(`drain:${defaults.drain}`)
  for (const token of allTokens) {
    const [name, ...rest] = token.split(':')
    const value = rest.join(':')
    switch (name) {
      case 'self':
        // Skill nhắm mọi địch chạy hiệu ứng self hai lần (giới hạn đã biết): bỏ, ghi report.
        if (skill.target === 'allEnemies') {
          report.droppedTokens.push({
            skillId: skill.id,
            token,
            reason: 'self trên skill allEnemies'
          })
          break
        }
        for (const { stat, delta } of parseStatList(value, where)) {
          // allAllies: quái dùng nằm trong mục tiêu nên dùng who "target" cho cả hai.
          const who = skill.target === 'allAllies' ? 'target' : 'self'
          effects.push({ type: 'statStage', params: { who, stat, delta } })
        }
        break
      case 'tgt':
        for (const { stat, delta } of parseStatList(value, where)) {
          effects.push({
            type: 'statStage',
            params: { who: 'target', stat, delta, ...(damaging ? { chance: 30 } : {}) }
          })
        }
        break
      case 'status': {
        const [statusId, chance] = rest
        effects.push({
          type: 'applyStatus',
          params: { statusId, ...(Number(chance) >= 100 ? {} : { chance: Number(chance) }) }
        })
        break
      }
      case 'drain':
        effects.push({ type: 'drain', params: { percent: Number(value) } })
        break
      case 'hits': {
        const [min, max] = value.split('-').map(Number)
        if (damaging && skill.target === 'enemy') skill.hits = { min, max }
        else
          report.droppedTokens.push({
            skillId: skill.id,
            token,
            reason: 'hits trên skill không nhắm một địch'
          })
        break
      }
      case 'prio':
        skill.priority = Number(value)
        break
      case 'acc':
        skill.accuracy = Number(value)
        break
      case 'phys':
        if (damaging) skill.category = 'physical'
        break
      case 'field': {
        const field = fieldEffects.find((effect) => effect.id === value)
        if (!field || (field.layer !== 'weather' && field.layer !== 'terrain')) {
          fail(`${where}: môi trường không hợp lệ "${value}"`)
        }
        effects.push({ type: 'setField', params: { layer: field.layer, fieldId: value } })
        break
      }
      case 'variantOf':
        report.variants.push({ skillId: skill.id, of: value })
        break
      case 'plan':
        plans.push(value)
        break
      case 'reuse':
        break
      default:
        fail(`${where}: token lạ "${token}"`)
    }
  }
  if (!has('hits') && defaults.hits && damaging && skill.target === 'enemy')
    skill.hits = defaults.hits
  if (defaults.heal) {
    const who = skill.target === 'allAllies' ? 'target' : 'self'
    effects.push({ type: 'heal', params: { percent: defaults.heal[entry.tier - 1], who } })
  }
  if (plans.length > 0) report.plannedEffects[skill.id] = plans
  return effects
}

/** Id mới không trùng skill có sẵn khác tên (thêm hậu tố Tw). */
function resolveNewId(entry) {
  const clash = skills.find((skill) => skill.id === entry.id)
  if (!clash || previousSkillIds.has(entry.id)) return entry.id
  const renamed = `${entry.id}Tw`
  report.renamedIds.push({ from: entry.id, to: renamed, existingName: enSkillName[entry.id] })
  return renamed
}

for (const entry of entries) {
  const where = `skill "${entry.id}"`
  if (entry.archetype === 'summon') {
    report.skippedSummons.push(entry.name)
    continue
  }
  const tokens = tokensOf(entry.hint)
  const reuse = tokens.find((token) => token.startsWith('reuse:'))?.slice('reuse:'.length)
  const sameName = existingByName.get(normalizeName(entry.name))
  const reusedId = reuse ?? sameName
  if (reusedId !== undefined) {
    if (!skills.some((skill) => skill.id === reusedId))
      fail(`${where}: dùng lại skill không có "${reusedId}"`)
    finalSkillId[entry.id] = reusedId
    report.reusedSkills.push({ sourceId: entry.id, skillId: reusedId })
    continue
  }
  const id = resolveNewId(entry)
  finalSkillId[entry.id] = id
  tww3Skills.set(id, entry)
  if (entry.verifyName) report.verifyName.push(entry.name)
  if (entry.effectGuessed) report.effectGuessed.push(entry.name)
  const existingIndex = skills.findIndex((skill) => skill.id === id)
  // Mục đã sửa theo wiki (tww3-verify.mjs, `wikiFixed`): dựng lại phần chiến đấu theo hint mới,
  // giữ các trường thêm ở bước sau (styles, spell, tags...). Mục khác đã nhập thì giữ nguyên.
  if (existingIndex >= 0 && !(entry.wikiFixed && skills[existingIndex].spell === undefined))
    continue

  const archetype =
    ARCHETYPES[entry.archetype] ?? fail(`${where}: archetype lạ "${entry.archetype}"`)
  const tierIndex = entry.tier - 1
  const skill = {
    id,
    elementId: entry.elementId,
    category: archetype.category,
    power: archetype.power[tierIndex],
    accuracy: archetype.accuracy[tierIndex],
    target: archetype.target,
    effects: [],
    priority: 0
  }
  skill.effects = buildEffects(entry, skill, tokens, where)
  const ordered = {
    id: skill.id,
    elementId: skill.elementId,
    category: skill.category,
    power: skill.power,
    accuracy: skill.accuracy,
    target: skill.target,
    effects: skill.effects,
    priority: skill.priority,
    ...(skill.hits ? { hits: skill.hits } : {})
  }
  text['en/skills'][id] = entry.name
  if (existingIndex >= 0) {
    const kept = { ...skills[existingIndex] }
    delete kept.hits
    skills[existingIndex] = { ...kept, ...ordered }
    if (!report.createdSkillIds.includes(id)) report.createdSkillIds.push(id)
    continue
  }
  skills.push(ordered)
  report.createdSkillIds.push(id)
  text['vi/skills'][id] = namesVi[entry.id] ?? fail(`${where}: thiếu tên tiếng Việt`)
}
// Giữ danh sách skill đã tạo ở các lần chạy trước (chạy lại không tạo lại).
for (const id of previousSkillIds)
  if (!report.createdSkillIds.includes(id)) report.createdSkillIds.push(id)

// ---------- Passive → trait ----------

const KINDS = { P: 'positive', N: 'negative', R: 'rare' }

/** Hook trait đã có: token → hook. */
const READY_TOKENS = {
  stat: (value, where) => ({
    type: 'statModifier',
    params: { percent: statPercent(value, where) }
  }),
  regen: (value) => ({ type: 'regen', params: { percent: Number(value) } }),
  dmgTaken: (value) => ({ type: 'damageTakenModifier', params: { percent: Number(value) } }),
  vsRace: (value) => {
    const [raceIds, percent] = value.split(':')
    return {
      type: 'damageVsRace',
      params: { raceIds: raceIds.split(','), percent: Number(percent) }
    }
  },
  catch: (value) => ({ type: 'catchRateModifier', params: { percent: Number(value) } }),
  immune: (value) => ({ type: 'statusImmunity', params: { statusIds: value.split(',') } })
}

/** Hook chờ (plan:<hook>:<tham số>) → params, đúng tên tham số của traits-planned.json. */
const PLANNED_HOOKS = {
  stageOnEntry: ([target, stat, stages]) => ({ target, stat, stages: Number(stages) }),
  allyStatModifier: ([stats], w) => ({ percent: statPercent(stats, w) }),
  retaliateDamage: ([category, percent]) => ({ category, percentOfAttackerMaxHp: Number(percent) }),
  statModifierFirstTurns: ([turns, stats], w) => ({
    turns: Number(turns),
    percent: statPercent(stats, w)
  }),
  critChanceModifier: ([percent]) => ({ percent: Number(percent) }),
  accuracyModifier: ([percent]) => ({ percent: Number(percent) }),
  lifesteal: ([percent]) => ({ percent: Number(percent) }),
  allyDamageTakenModifier: ([percent]) => ({ percent: Number(percent) }),
  damageTakenAtFullHp: ([percent]) => ({ percent: Number(percent) }),
  elementDamageDealt: ([elementId, percent]) => ({
    elementIds: [elementId],
    percent: Number(percent)
  }),
  onHitApplyStatus: ([category, statusId, chance]) => ({
    category,
    statuses: [{ statusId, chance: Number(chance) }]
  }),
  onAttackApplyStatus: ([category, statusId, chance]) => ({
    category,
    statuses: [{ statusId, chance: Number(chance) }]
  }),
  stageOnKnockout: ([stat, stages]) => ({ stat, stages: Number(stages) }),
  statModifierWhileLowHp: ([hp, stats], w) => ({
    hpBelowPercent: Number(hp),
    percent: statPercent(stats, w)
  }),
  fleeChanceOverride: ([chance]) => ({ chance: Number(chance) }),
  fleeWhenLowHp: ([hp, chance]) => ({ hpBelowPercent: Number(hp), chance: Number(chance) }),
  surviveLethal: ([chance]) => ({
    fromFullHp: false,
    chance: Number(chance.replace('chance', ''))
  }),
  statLowerImmunity: ([stats]) => ({ stats: stats === 'all' ? 'all' : stats.split(',') }),
  turnEndDamageFoes: ([percent]) => ({ percent: Number(percent) }),
  ignoreDefensePercent: ([percent]) => ({ percent: Number(percent) }),
  evasion: ([percent]) => ({ percent: Number(percent) }),
  executeLowHp: ([hp]) => ({ hpBelowPercent: Number(hp) }),
  skipTurnChance: ([chance]) => ({ chance: Number(chance) }),
  randomSkillChance: ([chance]) => ({ chance: Number(chance) }),
  turnEndSelfDamageWhileLowHp: ([hp, percent]) => ({
    hpBelowPercent: Number(hp),
    percent: Number(percent)
  }),
  statModifierWhileHighHp: ([hp, stats], w) => ({
    hpAbovePercent: Number(hp),
    percent: statPercent(stats, w)
  }),
  damageVsLowHp: ([hp, percent]) => ({ hpBelowPercent: Number(hp), percent: Number(percent) }),
  healOnKnockout: ([percent]) => ({ percent: Number(percent) }),
  statModifierWithAlly: ([stats], w) => ({ percent: statPercent(stats, w) }),
  reviveOnce: ([hp]) => ({ hpPercent: Number(hp) }),
  retaliateOnKnockout: ([percent]) => ({ percentOfAttackerMaxHp: Number(percent) }),
  accuracyModifierFoes: ([percent]) => ({ percent: Number(percent) }),
  statModifierAfterKnockout: ([stats], w) => ({ percent: statPercent(stats, w) })
}

/**
 * Hook đồng đội / địch cũ đã gộp vào hào quang (hook `aura`, mục "Trait Siralim" ở battle.md):
 * token cũ của file nguồn đổi sang hào quang cộng dồn với hook bên trong tương ứng.
 */
const AURA_TOKENS = {
  allyStatModifier: { scope: 'allies', type: 'statModifier' },
  allyDamageTakenModifier: { scope: 'allies', type: 'damageTakenModifier' },
  accuracyModifierFoes: { scope: 'foes', type: 'accuracyModifier' }
}

/** Hook từ token chờ: token đã gộp vào hào quang thì bọc thành `aura`. */
function plannedHook(hookType, params) {
  const aura = AURA_TOKENS[hookType]
  if (!aura) return { type: hookType, params }
  return {
    type: 'aura',
    params: { scope: aura.scope, stacks: true, hooks: [{ type: aura.type, params }] }
  }
}

/** Hook chờ đã làm từ khi soạn file nguồn: dùng được ngay. */
const PLANNED_BUT_READY = new Set(['elementDamageTaken'])

const existingPlannedTypes = new Set(
  plannedTraits.flatMap((trait) => trait.hooks.map((hook) => hook.type))
)
const previousTraitIds = new Set(previous?.createdTraitIds ?? [])
const takenTraitIds = new Set([...traits.map((t) => t.id), ...plannedTraits.map((t) => t.id)])

function traitHooks(passive, where) {
  const hooks = []
  let planned = false
  for (const token of tokensOf(passive.hint)) {
    const [name, ...rest] = token.split(':')
    if (name === 'plan') {
      const [hookType, ...params] = rest
      if (PLANNED_BUT_READY.has(hookType)) {
        hooks.push({
          type: hookType,
          params: { elementIds: params[0].split(','), percent: Number(params[1]) }
        })
        continue
      }
      const build = PLANNED_HOOKS[hookType] ?? fail(`${where}: hook chờ lạ "${hookType}"`)
      hooks.push(plannedHook(hookType, build(params, where)))
      planned = true
      if (!existingPlannedTypes.has(hookType) && !report.newPlannedHookTypes.includes(hookType)) {
        report.newPlannedHookTypes.push(hookType)
      }
      continue
    }
    const build = READY_TOKENS[name] ?? fail(`${where}: token lạ "${token}"`)
    hooks.push(build(rest.join(':'), where))
  }
  // Nhiều token stat gộp thành một statModifier.
  const stats = hooks.filter((hook) => hook.type === 'statModifier')
  if (stats.length > 1) {
    const merged = {
      type: 'statModifier',
      params: { percent: Object.assign({}, ...stats.map((h) => h.params.percent)) }
    }
    return { hooks: [merged, ...hooks.filter((hook) => hook.type !== 'statModifier')], planned }
  }
  return { hooks, planned }
}

for (const passive of source.passives) {
  const where = `trait "${passive.id}"`
  if (passive.sameAsExisting) {
    report.sameAsExisting.push({ id: passive.id, existing: passive.sameAsExisting })
    continue
  }
  let id = passive.id
  if (takenTraitIds.has(id) && !previousTraitIds.has(id)) {
    id = `${passive.id}Tw`
    report.renamedIds.push({ from: passive.id, to: id, kind: 'trait' })
  }
  if (passive.verifyName) report.verifyName.push(passive.name)
  if (passive.effectGuessed) report.effectGuessed.push(passive.name)
  const { hooks, planned } = traitHooks(passive, where)
  const kind = KINDS[passive.kind] ?? fail(`${where}: kind lạ "${passive.kind}"`)
  const exclusive = passive.exclusiveGroup ? { exclusiveGroup: passive.exclusiveGroup } : {}
  const nameVi = namesVi[passive.id] ?? fail(`${where}: thiếu tên tiếng Việt`)
  if (!report.createdTraitIds.includes(id)) report.createdTraitIds.push(id)
  if (planned) {
    report.plannedTraits[id] = hooks.map((hook) => hook.type)
    // Đã chuyển vào game (hook đã làm) hoặc đã nằm trong file chờ: không thêm lại.
    if (traits.some((trait) => trait.id === id)) continue
    if (plannedTraits.some((trait) => trait.id === id)) continue
    plannedTraits.push({
      id,
      name: nameVi,
      kind,
      ...exclusive,
      hooks,
      nameEn: passive.name,
      source: 'tww3'
    })
    continue
  }
  const traitIndex = traits.findIndex((trait) => trait.id === id)
  if (traitIndex >= 0) {
    // Đã đối chiếu wiki: thay hook theo hint mới, giữ các trường khác của trait.
    if (passive.wikiFixed) {
      traits[traitIndex] = { ...traits[traitIndex], hooks }
      text['en/traits'][id] = passive.name
    }
    continue
  }
  traits.push({ id, kind, ...exclusive, hooks })
  text['en/traits'][id] = passive.name
  text['vi/traits'][id] = nameVi
}

// ---------- Learnset ----------

const speciesById = new Map(species.map((sp) => [sp.id, sp]))
const learnerCount = new Map([...tww3Skills.keys()].map((id) => [id, 0]))
for (const sp of species) {
  for (const entry of sp.learnset ?? []) {
    if (learnerCount.has(entry.skillId))
      learnerCount.set(entry.skillId, learnerCount.get(entry.skillId) + 1)
  }
}
/** Số skill TWW3 mới loài đang học. */
const tww3SkillCount = (sp) =>
  (sp.learnset ?? []).filter((entry) => tww3Skills.has(entry.skillId)).length

function teach(sp, skillId, level, bucket) {
  if (sp.learnset.some((entry) => entry.skillId === skillId)) return false
  sp.learnset.push({ level, skillId })
  if (learnerCount.has(skillId)) learnerCount.set(skillId, learnerCount.get(skillId) + 1)
  report.learnset[bucket]++
  return true
}

// Loài warhammer: đề xuất có sẵn của file nguồn.
for (const [speciesId, list] of Object.entries(source.whLearnsets)) {
  const sp = speciesById.get(speciesId) ?? fail(`whLearnsets: loài không có "${speciesId}"`)
  for (const { skillId, level } of list) {
    const id =
      finalSkillId[skillId] ?? fail(`whLearnsets "${speciesId}": skill không có "${skillId}"`)
    teach(sp, id, level, 'warhammer')
  }
}

// Loài khác hợp hệ / race.
const raceAffinity = source.raceAffinity
const isOtherCandidate = (sp) =>
  sp.kind === 'normal' &&
  !(sp.id in source.speciesFactions) &&
  !['mega', 'gmax', 'battleOnly'].includes(sp.formKind)
for (const sp of species) {
  if (!isOtherCandidate(sp)) continue
  const max = sp.origin === 'fantasy' || sp.origin === 'myth' ? 2 : 1
  const room = max - tww3SkillCount(sp)
  if (room <= 0) continue
  const groups = raceAffinity[sp.raceId] ?? []
  const evolves = (sp.evolutions ?? []).length > 0
  const candidates = [...tww3Skills.entries()]
    .filter(
      ([id, entry]) =>
        groups.includes(entry.group) &&
        sp.elementIds.includes(entry.elementId) &&
        (!evolves || entry.tier <= 2) &&
        !sp.learnset.some((learned) => learned.skillId === id)
    )
    .sort(
      ([a], [b]) =>
        learnerCount.get(a) - learnerCount.get(b) ||
        md5(`${sp.id}|${a}`).localeCompare(md5(`${sp.id}|${b}`))
    )
  for (const [id, entry] of candidates.slice(0, room)) {
    teach(sp, id, LEVEL_BY_TIER[entry.tier - 1], 'others')
  }
}

// Gán bù skill chưa loài nào học.
/** Các phe của loài warhammer (speciesFactions là danh sách), kể cả phe tính thay (factionAliases). */
const factionOf = (sp) =>
  (source.speciesFactions[sp.id] ?? []).flatMap((faction) => [
    faction,
    ...(source.factionAliases[faction] ?? [])
  ])
const pickSpecies = (list, entry, skillId) =>
  [...list].sort(
    (a, b) =>
      Number(b.elementIds.includes(entry.elementId)) -
        Number(a.elementIds.includes(entry.elementId)) ||
      tww3SkillCount(a) - tww3SkillCount(b) ||
      md5(`${a.id}|${skillId}`).localeCompare(md5(`${b.id}|${skillId}`))
  )[0]
for (const [id, entry] of tww3Skills) {
  if (learnerCount.get(id) > 0) continue
  const factionSpecies = species.filter(
    (sp) =>
      sp.kind === 'normal' && factionOf(sp).some((faction) => entry.factions.includes(faction))
  )
  const raceSpecies = species.filter(
    (sp) => isOtherCandidate(sp) && (raceAffinity[sp.raceId] ?? []).includes(entry.group)
  )
  const chosen = pickSpecies(factionSpecies, entry, id) ?? pickSpecies(raceSpecies, entry, id)
  if (chosen) teach(chosen, id, LEVEL_BY_TIER[entry.tier - 1], 'fallback')
  else report.unlearnedSkills.push(id)
}

// ---------- Kiểm tra tên trùng trong cùng ngôn ngữ ----------

for (const key of Object.keys(text)) {
  const seen = new Map()
  for (const [id, name] of Object.entries(text[key])) {
    if (seen.has(name)) fail(`${key}: tên "${name}" trùng giữa "${seen.get(name)}" và "${id}"`)
    seen.set(name, id)
  }
}
if (races.length === 0) fail('races.json rỗng')

// ---------- Ghi ----------

report.counts = {
  newSkills: report.createdSkillIds.length,
  reusedSkills: report.reusedSkills.length,
  skippedSummons: report.skippedSummons.length,
  traitsReady: report.createdTraitIds.length - Object.keys(report.plannedTraits).length,
  traitsPlanned: Object.keys(report.plannedTraits).length,
  sameAsExisting: report.sameAsExisting.length,
  learnsetWarhammer: report.learnset.warhammer,
  learnsetOthers: report.learnset.others,
  learnsetFallback: report.learnset.fallback
}
writeJson(join(dataDir, 'skills.json'), skills)
writeJson(join(dataDir, 'traits.json'), traits)
writeJson(join(dataDir, 'species.json'), species)
for (const [key, value] of Object.entries(text)) writeJson(join(dataDir, `i18n/${key}.json`), value)
writeJson(plannedPath, plannedTraits)
// Lần chạy lại không thêm gì mới: giữ report của lần nhập trước làm lịch sử (lần này không dựng
// lại skill nên các danh sách như plannedEffects sẽ rỗng).
const addedNothing =
  previous !== null &&
  report.createdSkillIds.every((id) => previousSkillIds.has(id)) &&
  report.createdTraitIds.every((id) => previousTraitIds.has(id)) &&
  report.learnset.warhammer + report.learnset.others + report.learnset.fallback === 0
if (!addedNothing) writeJson(reportPath, report)
console.log(addedNothing ? 'Không có gì mới.' : JSON.stringify(report.counts, null, 1))
