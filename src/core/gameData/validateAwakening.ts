// Kiểm tra dữ liệu thức tỉnh (docs/rules/awakening.md): config.awakening (số, Thức tỉnh đan, tầng
// mốc, thần thông theo hệ, đồ rơi, trận độ kiếp).

import { checkFieldIdList } from '../registries'
import { GLOBAL_FIELD_LAYERS, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkDrops, checkKnownFields, checkMaterialMap } from './checks'

const AWAKENING_FIELDS = [
  'statStepPercent',
  'lifespanMultiplier',
  'levelPerTier',
  'costBase',
  'pillItemIds',
  'pillsPerTier',
  'milestones',
  'repeatEvery',
  'divineSkills',
  'maxFailures',
  'injuryStatPercent',
  'injuryBattles',
  'bossDrops',
  'floorBossDrops',
  'bossPillChance',
  'floorBossPillChance',
  'tribulation'
]

const TRIBULATION_FIELDS = [
  'speciesId',
  'levelOffset',
  'multiplierBase',
  'multiplierPerTier',
  'weather',
  'terrain',
  'maxTurns'
]

/** Tầng mốc: tầng nguyên ≥ 1 tăng dần, phần thưởng skill / traitSlot. */
function checkMilestones(value: unknown, at: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${at} phải là danh sách`)
    return
  }
  let previous = 0
  value.forEach((entry, i) => {
    const milestone = asObject(entry)
    const where = `${at}[${i}]`
    if (!milestone) {
      issues.push(`${where} phải là object`)
      return
    }
    checkKnownFields(milestone, ['tier', 'reward'], where, 'mốc thức tỉnh', issues)
    issues.push(...checkInteger(milestone.tier, `${where}.tier`, 1))
    if (typeof milestone.tier === 'number') {
      if (milestone.tier <= previous) issues.push(`${where}.tier phải tăng dần`)
      previous = milestone.tier
    }
    if (milestone.reward !== 'skill' && milestone.reward !== 'traitSlot') {
      issues.push(`${where}.reward phải là "skill" / "traitSlot"`)
    }
  })
}

/** Thần thông: key là hệ, giá trị là danh sách skill gây sát thương cùng hệ, không rỗng. */
function checkDivineSkills(data: GameData, value: unknown, at: string, issues: string[]): void {
  const bySkill = asObject(value)
  if (!bySkill) {
    issues.push(`${at} phải là object hệ → danh sách skill`)
    return
  }
  for (const [elementId, skillIds] of Object.entries(bySkill)) {
    const where = `${at}.${elementId}`
    if (!Object.hasOwn(data.elements, elementId)) issues.push(`${where}: hệ không tồn tại`)
    if (!Array.isArray(skillIds) || skillIds.length === 0) {
      issues.push(`${where} phải là danh sách skill không rỗng`)
      continue
    }
    for (const skillId of skillIds) {
      const skill = typeof skillId === 'string' ? data.skills[skillId] : undefined
      if (!skill) issues.push(`${where}: skill không tồn tại "${String(skillId)}"`)
      else if (skill.elementId !== elementId || skill.power <= 0) {
        issues.push(`${where}: "${skill.id}" phải là skill gây sát thương hệ ${elementId}`)
      }
    }
  }
}

function checkTribulation(data: GameData, value: unknown, at: string, issues: string[]): void {
  const tribulation = asObject(value)
  if (!tribulation) {
    issues.push(`${at} phải là object`)
    return
  }
  checkKnownFields(tribulation, TRIBULATION_FIELDS, at, 'config', issues)
  const species =
    typeof tribulation.speciesId === 'string' ? data.species[tribulation.speciesId] : undefined
  if (species?.kind !== 'normal') {
    issues.push(`${at}.speciesId phải là loài thường, nhận "${String(tribulation.speciesId)}"`)
  }
  issues.push(...checkInteger(tribulation.levelOffset, `${at}.levelOffset`))
  issues.push(...checkNumber(tribulation.multiplierBase, `${at}.multiplierBase`, 1))
  issues.push(...checkNumber(tribulation.multiplierPerTier, `${at}.multiplierPerTier`, 0))
  issues.push(...checkInteger(tribulation.maxTurns, `${at}.maxTurns`, 1))
  for (const layer of GLOBAL_FIELD_LAYERS) {
    issues.push(...checkFieldIdList(data, [tribulation[layer]], `${at}.${layer}`, layer))
  }
}

/** Kiểm tra config.awakening. */
export function checkAwakeningData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.awakening)
  if (!config) {
    issues.push('config.awakening phải là object')
    return
  }
  const at = (field: string): string => `config.awakening.${field}`
  checkKnownFields(config, AWAKENING_FIELDS, 'config.awakening', 'config', issues)
  issues.push(...checkNumber(config.statStepPercent, at('statStepPercent'), 0))
  issues.push(...checkNumber(config.lifespanMultiplier, at('lifespanMultiplier'), 1))
  issues.push(...checkInteger(config.levelPerTier, at('levelPerTier'), 1))
  issues.push(...checkNumber(config.costBase, at('costBase'), 0))
  issues.push(...checkInteger(config.pillsPerTier, at('pillsPerTier'), 0))
  issues.push(...checkInteger(config.repeatEvery, at('repeatEvery'), 1))
  issues.push(...checkInteger(config.maxFailures, at('maxFailures'), 0))
  issues.push(...checkNumber(config.injuryStatPercent, at('injuryStatPercent'), -99))
  issues.push(...checkInteger(config.injuryBattles, at('injuryBattles'), 0))
  checkMaterialMap(
    data,
    config.pillItemIds,
    { at: at('pillItemIds'), known: data.elements },
    issues
  )
  issues.push(...checkNumber(config.bossPillChance, at('bossPillChance'), 0, 100))
  issues.push(...checkNumber(config.floorBossPillChance, at('floorBossPillChance'), 0, 100))
  checkMilestones(config.milestones, at('milestones'), issues)
  checkDivineSkills(data, config.divineSkills, at('divineSkills'), issues)
  for (const key of ['bossDrops', 'floorBossDrops'] as const) {
    if (!Array.isArray(config[key])) issues.push(`${at(key)} phải là danh sách`)
    else checkDrops(data, config[key], at(key), issues)
  }
  checkTribulation(data, config.tribulation, at('tribulation'), issues)
}
