// Kiểm tra dữ liệu động phủ (docs/rules/dwelling.md): buildings.json, config.dwelling, chỉ số làm
// việc ghi đè của loài (`workStats` ở species.json).

import { itemStorage } from '../inventory'
import { raceRefIds, validatePartialStats } from '../registries'
import {
  AILMENT_CAUSES,
  BUILDING_EFFECT_TYPES,
  CRAFT_STATIONS,
  ITEM_CATEGORIES,
  WORK_TYPES,
  type BuildingEffectType,
  type GameData,
  type ItemCategory
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'
import { checkWorkTraitData } from './validateWorkTraits'

const FIELDS = ['id', 'workType', 'startLevel', 'maxLevel', 'slotsPerLevel', 'cost', 'effect']
const CONFIG_FIELDS = [
  'workStatPercents',
  'wrongWorkPercent',
  'powerStatUnit',
  'transportRatio',
  'levelExponent',
  'baseWorkSpeed',
  'minWorkSpeed',
  'condenseStacks',
  'condensePercent',
  'soulWorkSpeedPercentPerLevel',
  'workTraits',
  'needs',
  'foods',
  'workerAffinity',
  'workerAffinityDays'
]

type Raw = Readonly<Record<string, unknown>>

/** Category hợp lệ (category sai do kiểm tra vật phẩm báo; ở đây bỏ qua để không ném lỗi). */
const isKnownCategory = (category: unknown): category is ItemCategory =>
  (ITEM_CATEGORIES as readonly unknown[]).includes(category)

/** Luật kiểm tra theo loại hiệu ứng: trường, kiểm tra tham số, có cần quái làm việc không. */
interface EffectRule {
  fields: readonly string[]
  /** Hiệu ứng tính theo sức làm việc: công trình phải có ô quái (slotsPerLevel ≥ 1). */
  needsWorkers: boolean
  check(effect: Raw, data: GameData, where: string): string[]
}

function checkDrops(effect: Raw, data: GameData, where: string): string[] {
  if (!Array.isArray(effect.drops) || effect.drops.length === 0) {
    return [`${where}.drops phải là danh sách không rỗng`]
  }
  return effect.drops.flatMap((entry: unknown, i: number) => {
    const at = `${where}.drops[${i}]`
    const drop = asObject(entry) ?? {}
    const issues: string[] = []
    checkKnownFields(drop, ['itemId', 'perDay'], at, 'đồ công trình', issues)
    const item = typeof drop.itemId === 'string' ? data.items[drop.itemId] : undefined
    if (!item) issues.push(`${at}.itemId: vật phẩm không tồn tại "${String(drop.itemId)}"`)
    else if (isKnownCategory(item.category) && itemStorage(item.category) !== 'stack') {
      issues.push(`${at}.itemId: "${item.id}" không gộp chồng được (kho động phủ chỉ chứa chồng)`)
    }
    return [...issues, ...checkNumber(drop.perDay, `${at}.perDay`, 0)]
  })
}

const percentRule: EffectRule = {
  fields: ['percentPerPower'],
  needsWorkers: true,
  check: (effect, _data, where) =>
    checkNumber(effect.percentPerPower, `${where}.percentPerPower`, 0)
}

const EFFECT_RULES: Record<BuildingEffectType, EffectRule> = {
  produce: { fields: ['drops'], needsWorkers: true, check: checkDrops },
  garden: {
    fields: ['plotsPerLevel'],
    needsWorkers: false,
    check: (effect, _data, where) => checkInteger(effect.plotsPerLevel, `${where}.plotsPerLevel`, 1)
  },
  cropGrowth: percentRule,
  outputBoost: percentRule,
  nurture: {
    fields: ['affinityPerPower', 'eggStepsPerPower'],
    needsWorkers: true,
    check: (effect, _data, where) => [
      ...checkNumber(effect.affinityPerPower, `${where}.affinityPerPower`, 0),
      ...checkNumber(effect.eggStepsPerPower, `${where}.eggStepsPerPower`, 0)
    ]
  },
  rest: {
    fields: ['sanityPerLevel'],
    needsWorkers: false,
    check: (effect, _data, where) =>
      checkNumber(effect.sanityPerLevel, `${where}.sanityPerLevel`, 0)
  },
  research: {
    fields: ['booksPerPower', 'reusableChance'],
    needsWorkers: true,
    check: (effect, _data, where) => [
      ...checkNumber(effect.booksPerPower, `${where}.booksPerPower`, 0),
      ...checkNumber(effect.reusableChance, `${where}.reusableChance`, 0, 100)
    ]
  },
  craftBonus: {
    fields: ['percentPerPower', 'stations'],
    needsWorkers: true,
    check(effect, _data, where) {
      const issues = checkNumber(effect.percentPerPower, `${where}.percentPerPower`, 0)
      const stations = effect.stations
      if (
        !Array.isArray(stations) ||
        stations.length === 0 ||
        stations.some((s) => !(CRAFT_STATIONS as readonly unknown[]).includes(s))
      ) {
        issues.push(
          `${where}.stations phải là danh sách không rỗng gồm ${CRAFT_STATIONS.join(' / ')}`
        )
      }
      return issues
    }
  }
}

/** Luật của loại hiệu ứng; null = loại không có. */
function effectRule(value: unknown): EffectRule | null {
  const type = asObject(value)?.type
  // Ép kiểu: vừa kiểm tra type nằm trong BUILDING_EFFECT_TYPES.
  return (BUILDING_EFFECT_TYPES as readonly unknown[]).includes(type)
    ? EFFECT_RULES[type as BuildingEffectType]
    : null
}

function checkCost(data: GameData, value: unknown, where: string, issues: string[]): void {
  const cost = asObject(value)
  if (!cost) {
    issues.push(`${where}.cost phải là object { money, moneyGrowth, items }`)
    return
  }
  checkKnownFields(
    cost,
    ['money', 'moneyGrowth', 'items'],
    `${where}.cost`,
    'giá công trình',
    issues
  )
  issues.push(...checkNumber(cost.money, `${where}.cost.money`, 0))
  issues.push(...checkNumber(cost.moneyGrowth, `${where}.cost.moneyGrowth`, 1))
  if (!Array.isArray(cost.items)) {
    issues.push(`${where}.cost.items phải là danh sách`)
    return
  }
  cost.items.forEach((entry: unknown, i: number) => {
    const at = `${where}.cost.items[${i}]`
    const item = asObject(entry) ?? {}
    checkKnownFields(item, ['itemId', 'count'], at, 'nguyên liệu công trình', issues)
    if (typeof item.itemId !== 'string' || !Object.hasOwn(data.items, item.itemId)) {
      issues.push(`${at}.itemId: vật phẩm không tồn tại "${String(item.itemId)}"`)
    }
    issues.push(...checkInteger(item.count, `${at}.count`, 1))
  })
}

/** Chỉ số làm việc: loại việc hợp lệ, số nguyên ≥ 0 (không trần, như công / thủ). */
export function checkWorkStats(value: unknown, where: string): string[] {
  const entry = asObject(value)
  if (!entry) return [`${where} phải là object { loại việc: chỉ số }`]
  return Object.entries(entry).flatMap(([type, stat]) => {
    if (!(WORK_TYPES as readonly string[]).includes(type)) {
      return [`${where}: loại việc "${type}" không có (${WORK_TYPES.join(' / ')})`]
    }
    return checkInteger(stat, `${where}.${type}`, 0)
  })
}

function checkBuildings(data: GameData, issues: string[]): void {
  for (const def of Object.values(data.buildings)) {
    const where = `Công trình "${def.id}"`
    checkKnownFields(def, FIELDS, where, 'công trình', issues)
    if (!(WORK_TYPES as readonly unknown[]).includes(def.workType)) {
      issues.push(`${where}: workType phải là ${WORK_TYPES.join(' / ')}`)
    }
    issues.push(...checkInteger(def.startLevel, `${where}: startLevel`, 0))
    if (def.maxLevel !== undefined) {
      issues.push(...checkInteger(def.maxLevel, `${where}: maxLevel`, Math.max(1, def.startLevel)))
    }
    issues.push(...checkInteger(def.slotsPerLevel, `${where}: slotsPerLevel`, 0))
    checkCost(data, def.cost, where, issues)
    const rule = effectRule(def.effect)
    if (!rule) {
      issues.push(`${where}: effect.type phải là ${BUILDING_EFFECT_TYPES.join(' / ')}`)
      continue
    }
    const effect = def.effect as unknown as Raw
    const at = `${where}: effect`
    checkKnownFields(effect, ['type', ...rule.fields], at, `hiệu ứng "${def.effect.type}"`, issues)
    issues.push(...rule.check(effect, data, at))
    if (rule.needsWorkers && def.slotsPerLevel < 1) {
      issues.push(`${where}: hiệu ứng "${def.effect.type}" cần quái làm việc (slotsPerLevel ≥ 1)`)
    }
  }
}

function checkConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.dwelling)
  if (!config) {
    issues.push('config.dwelling phải là object')
    return
  }
  const at = (field: string): string => `config.dwelling.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.dwelling', 'config', issues)
  const table = asObject(config.workStatPercents)
  if (!table) issues.push(`${at('workStatPercents')} phải là object { elements, races }`)
  else {
    checkKnownFields(table, ['elements', 'races'], at('workStatPercents'), 'config', issues)
    const sources = { elements: data.elements, races: raceRefIds(data) }
    for (const [field, known] of Object.entries(sources)) {
      const entries = asObject(table[field])
      if (!entries) {
        issues.push(`${at('workStatPercents')}.${field} phải là object`)
        continue
      }
      for (const [id, entry] of Object.entries(entries)) {
        const where = `${at('workStatPercents')}.${field}.${id}`
        if (!Object.hasOwn(known, id)) issues.push(`${where}: không tồn tại`)
        issues.push(...checkWorkStats(entry, where))
      }
    }
  }
  issues.push(...checkNumber(config.wrongWorkPercent, at('wrongWorkPercent'), 0))
  issues.push(...checkNumber(config.powerStatUnit, at('powerStatUnit'), 1))
  issues.push(...checkNumber(config.transportRatio, at('transportRatio'), 0))
  issues.push(...checkNumber(config.levelExponent, at('levelExponent'), 0))
  issues.push(...checkInteger(config.workerAffinity, at('workerAffinity'), 0))
  issues.push(...checkInteger(config.workerAffinityDays, at('workerAffinityDays'), 1))
  checkNeeds(config.needs, issues)
  checkFoods(data, config.foods, issues)
  checkAilments(data, issues)
}

/** ailments.json: trọng số ≥ 0, nguồn mắc, workPercent 0–100, % chỉ số, cureTier nguyên ≥ 1. */
function checkAilments(data: GameData, issues: string[]): void {
  for (const def of Object.values(data.ailments)) {
    const where = `Bệnh "${def.id}"`
    checkKnownFields(
      def,
      ['id', 'weight', 'causes', 'workPercent', 'statPercents', 'bodyParts', 'cureTier'],
      where,
      'bệnh',
      issues
    )
    if (
      !Array.isArray(def.causes) ||
      def.causes.length === 0 ||
      def.causes.some((cause) => !(AILMENT_CAUSES as readonly unknown[]).includes(cause))
    ) {
      issues.push(`${where}: causes phải là danh sách không rỗng gồm ${AILMENT_CAUSES.join(' / ')}`)
    }
    issues.push(...validatePartialStats(def.statPercents, `${where}: statPercents`))
    if (def.bodyParts !== undefined) {
      const parts: unknown = def.bodyParts
      if (
        !Array.isArray(parts) ||
        parts.some((part) => !Object.hasOwn(data.bodyParts, String(part)))
      ) {
        issues.push(`${where}: bodyParts phải là danh sách id bộ phận (bodyParts.json)`)
      } else if (!def.causes.includes('battle')) {
        issues.push(`${where}: bodyParts chỉ dùng cho chấn thương trận (causes có "battle")`)
      }
    }
    issues.push(...checkNumber(def.weight, `${where}: weight`, 0))
    issues.push(...checkNumber(def.workPercent, `${where}: workPercent`, 0, 100))
    issues.push(...checkInteger(def.cureTier, `${where}: cureTier`, 1))
  }
}

const NEEDS_FIELDS = [
  'max',
  'hungerPerDay',
  'sanityPerDay',
  'eatBelow',
  'starvingSanityPerDay',
  'starvingWorkPercent',
  'lowSanity',
  'lowSanityWorkPercent',
  'idleRecoveryPerDay',
  'nocturnalWorkPercent',
  'nocturnalDrainPercent',
  'sickSanity',
  'sickChanceMax',
  'starvingSickChance',
  'idleCureDays',
  'faintAilmentChance',
  'brokenPartAilmentChance'
]

/** config.dwelling.needs: mọi trường là số ≥ 0, max > 0, eatBelow / lowSanity ≤ max. */
function checkNeeds(value: unknown, issues: string[]): void {
  const at = 'config.dwelling.needs'
  const needs = asObject(value)
  if (!needs) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(needs, NEEDS_FIELDS, at, 'config', issues)
  for (const field of NEEDS_FIELDS) issues.push(...checkNumber(needs[field], `${at}.${field}`, 0))
  issues.push(...checkNumber(needs.max, `${at}.max`, 1))
  const max = typeof needs.max === 'number' ? needs.max : Infinity
  issues.push(...checkNumber(needs.sickChanceMax, `${at}.sickChanceMax`, 0, 100))
  issues.push(...checkNumber(needs.starvingSickChance, `${at}.starvingSickChance`, 0, 100))
  issues.push(...checkInteger(needs.idleCureDays, `${at}.idleCureDays`, 1))
  issues.push(...checkNumber(needs.faintAilmentChance, `${at}.faintAilmentChance`, 0, 100))
  issues.push(
    ...checkNumber(needs.brokenPartAilmentChance, `${at}.brokenPartAilmentChance`, 0, 100)
  )
  for (const field of ['eatBelow', 'lowSanity', 'sickSanity']) {
    if (typeof needs[field] === 'number' && (needs[field] as number) > max) {
      issues.push(`${at}.${field} phải ≤ max`)
    }
  }
}

/** config.dwelling.foods: vật phẩm gộp chồng tồn tại, { fullness, sanity } số ≥ 0. */
function checkFoods(data: GameData, value: unknown, issues: string[]): void {
  const at = 'config.dwelling.foods'
  const foods = asObject(value)
  if (!foods) {
    issues.push(`${at} phải là object { id vật phẩm: { fullness, sanity } }`)
    return
  }
  for (const [itemId, entry] of Object.entries(foods)) {
    const where = `${at}.${itemId}`
    const item = data.items[itemId]
    if (!item) issues.push(`${where}: vật phẩm không tồn tại`)
    else if (isKnownCategory(item.category) && itemStorage(item.category) !== 'stack')
      issues.push(`${where}: vật phẩm phải gộp chồng`)
    const food = asObject(entry) ?? {}
    checkKnownFields(food, ['fullness', 'sanity'], where, 'món ăn', issues)
    issues.push(...checkNumber(food.fullness, `${where}.fullness`, 0))
    issues.push(...checkNumber(food.sanity, `${where}.sanity`, 0))
  }
}

/** Kiểm tra công trình, config.dwelling, trait làm việc và `workStats` / `workSpeed` của loài. */
export function checkDwellingData(data: GameData, issues: string[]): void {
  checkBuildings(data, issues)
  checkConfig(data, issues)
  checkWorkTraitData(data, issues)
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || species.workStats === undefined) continue
    issues.push(...checkWorkStats(species.workStats, `Loài "${species.id}".workStats`))
  }
}
