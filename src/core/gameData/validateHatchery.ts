// Kiểm tra dữ liệu phòng ấp (docs/rules/hatchery.md), luyện thể (docs/rules/body-refinement.md) và
// cổng thế giới (docs/rules/zones.md mục "Cổng thế giới"): config, bodyRefinements.json, `eggType` của
// loài.

import { ZONE_STEP_KINDS, type GameData, type HatcheryUpgradeEffect } from '../model'
import { checkInteger, checkNumber } from '../shared'
import { TRAIT_HOOKS } from '../registries'
import { checkEffects, checkKnownFields } from './checks'

const RULE_FIELDS = [
  'eggTypes',
  'notEggTypes',
  'habitatIds',
  'notHabitatIds',
  'growth',
  'stability'
] as const
const NEIGHBOR_TYPE_FIELDS = [
  'eggTypes',
  'notEggTypes',
  'neighborEggTypes',
  'notNeighborEggTypes'
] as const
const REFINEMENT_FIELDS = ['id', 'partId', 'tags', 'hooks', 'costMultiplier'] as const
const PORTAL_COUNTS = [
  'maxOpen',
  'durationDays',
  'startHives',
  'hivesPerDay',
  'maxHives',
  'stabilizeDays',
  'gatherRolls'
] as const

/** Danh sách id (bỏ trống được): không rỗng, mọi id phải nằm trong `known`. */
function checkIds(list: unknown, where: string, known: ReadonlySet<string>): string[] {
  if (list === undefined) return []
  if (!Array.isArray(list) || list.length === 0) return [`${where} phải là danh sách không rỗng`]
  return list.filter((id) => !known.has(id)).map((id) => `${where} có id lạ "${String(id)}"`)
}

const needsAmount = (rule: { growth?: number; stability?: number }, where: string): string[] => [
  ...(rule.growth === undefined && rule.stability === undefined
    ? [`${where}: cần growth hoặc stability`]
    : []),
  ...(rule.growth === undefined ? [] : checkNumber(rule.growth, `${where}.growth`)),
  ...(rule.stability === undefined ? [] : checkNumber(rule.stability, `${where}.stability`))
]

function checkHatcheryConfig(data: GameData, issues: string[]): void {
  const config = data.config.hatchery
  const where = 'config.hatchery'
  issues.push(
    ...checkInteger(config.roomCount, `${where}.roomCount`, 1),
    ...checkInteger(config.eggsPerRoom, `${where}.eggsPerRoom`, 1),
    ...checkNumber(config.baseStability, `${where}.baseStability`),
    ...checkNumber(config.minHatchChance, `${where}.minHatchChance`, Number.MIN_VALUE, 100),
    ...checkNumber(
      config.genePercentPerExcessStability,
      `${where}.genePercentPerExcessStability`,
      0
    ),
    ...checkInteger(config.dailySteps, `${where}.dailySteps`, 0)
  )
  const habitats = new Set<string>()
  config.habitats.forEach((habitat, i) => {
    if (habitats.has(habitat.id)) issues.push(`${where}.habitats[${i}].id trùng "${habitat.id}"`)
    habitats.add(habitat.id)
    issues.push(...checkNumber(habitat.buildCost, `${where}.habitats[${i}].buildCost`, 0))
  })
  if (!habitats.has(config.defaultHabitatId)) {
    issues.push(`${where}.defaultHabitatId lạ "${config.defaultHabitatId}"`)
  }
  const eggTypes = new Set(config.eggTypes)
  if (!eggTypes.has(config.defaultEggType)) {
    issues.push(`${where}.defaultEggType lạ "${config.defaultEggType}"`)
  }
  for (const [elementId, eggType] of Object.entries(config.eggTypeByElement)) {
    if (!Object.hasOwn(data.elements, elementId)) {
      issues.push(`${where}.eggTypeByElement: hệ lạ "${elementId}"`)
    }
    if (!eggTypes.has(eggType)) {
      issues.push(`${where}.eggTypeByElement.${elementId}: loại trứng lạ "${eggType}"`)
    }
  }
  config.rules.forEach((rule, i) => {
    const at = `${where}.rules[${i}]`
    checkKnownFields(rule, RULE_FIELDS, at, 'luật phòng ấp', issues)
    issues.push(
      ...checkIds(rule.eggTypes, `${at}.eggTypes`, eggTypes),
      ...checkIds(rule.notEggTypes, `${at}.notEggTypes`, eggTypes),
      ...checkIds(rule.habitatIds, `${at}.habitatIds`, habitats),
      ...checkIds(rule.notHabitatIds, `${at}.notHabitatIds`, habitats),
      ...needsAmount(rule, at)
    )
  })
  config.neighborRules.forEach((rule, i) => {
    const at = `${where}.neighborRules[${i}]`
    checkKnownFields(
      rule,
      [...NEIGHBOR_TYPE_FIELDS, 'growth', 'stability'],
      at,
      'luật trứng cùng phòng',
      issues
    )
    for (const key of NEIGHBOR_TYPE_FIELDS) {
      issues.push(...checkIds(rule[key], `${at}.${key}`, eggTypes))
    }
    issues.push(...needsAmount(rule, at))
  })
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || species.eggType === undefined) continue
    if (!eggTypes.has(species.eggType)) {
      issues.push(`Loài "${species.id}".eggType lạ "${species.eggType}"`)
    }
  }
}

/** Trường của từng loại hiệu ứng nâng cấp phòng (mapped type: thêm loại mà quên thì TypeScript báo). */
const HATCHERY_UPGRADE_FIELDS: { [K in HatcheryUpgradeEffect['kind']]: readonly string[] } = {
  bonus: ['growth', 'stability', 'growthPercent'],
  sameSpecies: ['growth'],
  readyEggs: ['stability'],
  hatchTrait: ['traitId'],
  randomTrait: [],
  hatchGenes: ['percent'],
  hatchLevels: ['levels'],
  hatchCare: [],
  boostOthers: ['steps'],
  onFail: ['battlesLeft', 'spreadSteps', 'soulPoints'],
  excessGenes: ['target', 'multiplier'],
  hatchItem: ['eggTypes', 'itemId', 'count'],
  dailyItem: ['eggTypes', 'itemId', 'count']
}

function checkUpgrades(data: GameData, issues: string[]): void {
  const config = data.config.hatchery
  issues.push(...checkInteger(config.upgradeCap, 'config.hatchery.upgradeCap', 0))
  const habitats = new Set(config.habitats.map((habitat) => habitat.id))
  const eggTypes = new Set(config.eggTypes)
  const ids = new Set<string>()
  config.upgrades.forEach((upgrade, i) => {
    const where = `config.hatchery.upgrades[${i}]`
    if (ids.has(upgrade.id)) issues.push(`${where}.id trùng "${upgrade.id}"`)
    ids.add(upgrade.id)
    issues.push(
      ...checkNumber(upgrade.price, `${where}.price`, 0),
      ...checkIds(upgrade.habitatIds, `${where}.habitatIds`, habitats)
    )
    upgrade.effects.forEach((effect, j) => {
      const at = `${where}.effects[${j}]`
      const fields = HATCHERY_UPGRADE_FIELDS[effect.kind]
      if (!fields) {
        issues.push(`${at}.kind lạ "${String(effect.kind)}"`)
        return
      }
      checkKnownFields(effect, ['kind', ...fields], at, 'hiệu ứng nâng cấp phòng', issues)
      if (effect.kind === 'hatchTrait' && !Object.hasOwn(data.traits, effect.traitId)) {
        issues.push(`${at}.traitId lạ "${effect.traitId}"`)
      }
      if (effect.kind === 'hatchItem' || effect.kind === 'dailyItem') {
        if (!Object.hasOwn(data.items, effect.itemId))
          issues.push(`${at}.itemId lạ "${effect.itemId}"`)
        issues.push(
          ...checkIds(effect.eggTypes, `${at}.eggTypes`, eggTypes),
          ...checkInteger(effect.count, `${at}.count`, 1)
        )
      }
    })
  })
  config.habitats.forEach((habitat, i) => {
    if (habitat.hatchTraitId !== undefined && !Object.hasOwn(data.traits, habitat.hatchTraitId)) {
      issues.push(`config.hatchery.habitats[${i}].hatchTraitId lạ "${habitat.hatchTraitId}"`)
    }
  })
  const { hatcher } = config
  issues.push(
    ...checkNumber(hatcher.statPerPoint, 'config.hatchery.hatcher.statPerPoint', Number.MIN_VALUE),
    ...checkNumber(
      hatcher.diminishEvery,
      'config.hatchery.hatcher.diminishEvery',
      Number.MIN_VALUE
    ),
    ...checkNumber(hatcher.diminishFactor, 'config.hatchery.hatcher.diminishFactor', 0, 1),
    ...checkNumber(hatcher.sameEggTypeGrowth, 'config.hatchery.hatcher.sameEggTypeGrowth'),
    ...checkNumber(hatcher.habitatGrowth, 'config.hatchery.hatcher.habitatGrowth')
  )
}

function checkRefinements(data: GameData, issues: string[]): void {
  const config = data.config.bodyRefinement
  issues.push(
    ...checkNumber(config.costPerLevel, 'config.bodyRefinement.costPerLevel', 0),
    ...checkNumber(config.removeCostPercent, 'config.bodyRefinement.removeCostPercent', 0)
  )
  const tags = new Set<string>()
  for (const refinement of Object.values(data.bodyRefinements)) {
    const where = `bodyRefinements "${refinement.id}"`
    checkKnownFields(refinement, REFINEMENT_FIELDS, where, 'kiểu luyện thể', issues)
    if (!Object.hasOwn(data.bodyParts, refinement.partId)) {
      issues.push(`${where}.partId lạ "${refinement.partId}"`)
    }
    if (!Array.isArray(refinement.tags)) issues.push(`${where}.tags phải là danh sách`)
    else for (const tag of refinement.tags) tags.add(tag)
    issues.push(
      ...checkNumber(refinement.costMultiplier, `${where}.costMultiplier`, Number.MIN_VALUE)
    )
    checkEffects(TRAIT_HOOKS, refinement.hooks, `${where}.hooks`, data, issues)
  }
  config.tagBonuses.forEach((bonus, i) => {
    const where = `config.bodyRefinement.tagBonuses[${i}]`
    if (!tags.has(bonus.tag))
      issues.push(`${where}.tag: không kiểu luyện thể nào mang "${bonus.tag}"`)
    issues.push(...checkInteger(bonus.count, `${where}.count`, 1))
    checkEffects(TRAIT_HOOKS, bonus.hooks, `${where}.hooks`, data, issues)
  })
}

function checkPortalConfig(data: GameData, issues: string[]): void {
  const config = data.config.zones.portals
  const where = 'config.zones.portals'
  issues.push(...checkNumber(config.spawnChance, `${where}.spawnChance`, 0, 100))
  for (const key of PORTAL_COUNTS) issues.push(...checkInteger(config[key], `${where}.${key}`, 0))
  issues.push(
    ...checkInteger(config.steps.min, `${where}.steps.min`, 1),
    ...checkInteger(config.steps.max, `${where}.steps.max`, config.steps.min)
  )
  for (const key of ['floorsPerHostility', 'floorsPerHive', 'stabilizeCost'] as const) {
    issues.push(...checkNumber(config[key], `${where}.${key}`, 0))
  }
  for (const kind of ZONE_STEP_KINDS) {
    issues.push(...checkNumber(config.stepWeights[kind], `${where}.stepWeights.${kind}`, 0))
  }
}

/** Kiểm tra phòng ấp, luyện thể, cổng thế giới. */
export function checkHatcheryData(data: GameData, issues: string[]): void {
  checkHatcheryConfig(data, issues)
  checkUpgrades(data, issues)
  checkRefinements(data, issues)
  checkPortalConfig(data, issues)
}
