// Kiểm tra dữ liệu sách kỹ năng (docs/rules/skill-books.md): config.skillBook và trường loài
// bookSkillIds (skill học qua sách: TM / tutor của game gốc), eggSkillIds (chiêu trứng, breeding).

import type { GameData } from '../model'
import { asObject, checkInteger, checkNumber, isFiniteNumber } from '../shared'
import { isBookableSkill } from '../inventory'
import { checkKnownFields } from './checks'

const CONFIG_FIELDS = [
  'priceBase',
  'pricePerPower',
  'reusablePriceMultiplier',
  'universalElementIds',
  'rarities',
  'rarityPowerSteps',
  'shopMin',
  'shopMax',
  'shopMaxPower',
  'shopRareSkillFactor',
  'partyMultiplier',
  'bossDropChance',
  'reusableDropChance'
]

/** Bậc hiếm: ít nhất một bậc, id không trùng, minLearners giảm dần (≥ 0). */
function checkRarities(value: unknown, issues: string[]): void {
  const where = 'config.skillBook.rarities'
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where} cần ít nhất một bậc`)
    return
  }
  const ids = new Set<string>()
  let previous = Infinity
  value.forEach((raw: unknown, i) => {
    const tier = asObject(raw)
    const at = `${where}[${i}]`
    if (!tier) {
      issues.push(`${at} không hợp lệ`)
      return
    }
    checkKnownFields(
      tier,
      ['id', 'minLearners', 'priceMultiplier', 'shopWeight'],
      at,
      'bậc',
      issues
    )
    if (typeof tier.id !== 'string' || ids.has(tier.id)) issues.push(`${at}.id thiếu hoặc trùng`)
    else ids.add(tier.id)
    issues.push(...checkInteger(tier.minLearners, `${at}.minLearners`, 0))
    if (isFiniteNumber(tier.minLearners)) {
      if (tier.minLearners >= previous) issues.push(`${at}.minLearners phải giảm dần`)
      previous = tier.minLearners
    }
    if (!isFiniteNumber(tier.priceMultiplier) || tier.priceMultiplier <= 0) {
      issues.push(`${at}.priceMultiplier phải là số > 0`)
    }
    issues.push(...checkNumber(tier.shopWeight, `${at}.shopWeight`, 0))
  })
}

/** Mốc power tăng bậc hiếm: danh sách số > 0 tăng dần. */
function checkPowerSteps(value: unknown, issues: string[]): void {
  const where = 'config.skillBook.rarityPowerSteps'
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  value.forEach((step: unknown, i) => {
    if (!isFiniteNumber(step) || step <= 0) issues.push(`${where}[${i}] phải là số > 0`)
    else if (i > 0 && isFiniteNumber(value[i - 1]) && step <= value[i - 1]) {
      issues.push(`${where}[${i}] phải tăng dần`)
    }
  })
}

function checkSkillBookConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.skillBook)
  const where = 'config.skillBook'
  if (!config) {
    issues.push(`${where} phải là object`)
    return
  }
  checkKnownFields(config, CONFIG_FIELDS, where, 'config', issues)
  for (const field of ['priceBase', 'pricePerPower', 'reusablePriceMultiplier', 'shopMaxPower']) {
    issues.push(...checkNumber(config[field], `${where}.${field}`, 0))
  }
  for (const field of ['bossDropChance', 'reusableDropChance']) {
    issues.push(...checkNumber(config[field], `${where}.${field}`, 0, 100))
  }
  issues.push(...checkNumber(config.partyMultiplier, `${where}.partyMultiplier`, 1))
  issues.push(...checkInteger(config.shopMin, `${where}.shopMin`, 0))
  const shopMin = isFiniteNumber(config.shopMin) ? config.shopMin : 0
  issues.push(...checkInteger(config.shopMax, `${where}.shopMax`, shopMin))
  if (!Array.isArray(config.universalElementIds)) {
    issues.push(`${where}.universalElementIds phải là danh sách`)
  } else {
    for (const elementId of config.universalElementIds) {
      if (typeof elementId !== 'string' || !Object.hasOwn(data.elements, elementId)) {
        issues.push(`${where}.universalElementIds: hệ không tồn tại "${String(elementId)}"`)
      }
    }
  }
  checkRarities(config.rarities, issues)
  checkPowerSteps(config.rarityPowerSteps, issues)
}

/**
 * Danh sách skill thêm của loài (bookSkillIds: học qua sách; eggSkillIds: chiêu trứng học khi
 * breeding): skill tồn tại, có sách (không phải chiêu chỉ có trong trận / hợp kích kỹ), không trùng.
 */
function checkSpeciesSkillList(
  data: GameData,
  field: 'bookSkillIds' | 'eggSkillIds',
  issues: string[]
): void {
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal') continue
    const list: unknown = species[field]
    if (list === undefined) continue
    const where = `Loài "${species.id}".${field}`
    if (!Array.isArray(list)) {
      issues.push(`${where} phải là danh sách`)
      continue
    }
    if (new Set(list).size !== list.length) issues.push(`${where}: skill bị lặp`)
    for (const skillId of list) {
      const skill =
        typeof skillId === 'string' && Object.hasOwn(data.skills, skillId)
          ? data.skills[skillId]
          : undefined
      if (!skill) issues.push(`${where}: skill không tồn tại "${String(skillId)}"`)
      else if (!isBookableSkill(data, skill)) issues.push(`${where}: "${skill.id}" không có sách`)
    }
  }
}

/** Kiểm tra config.skillBook, bookSkillIds và eggSkillIds của loài. */
export function checkSkillBookData(data: GameData, issues: string[]): void {
  checkSkillBookConfig(data, issues)
  checkSpeciesSkillList(data, 'bookSkillIds', issues)
  checkSpeciesSkillList(data, 'eggSkillIds', issues)
}
