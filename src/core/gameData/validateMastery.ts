// Kiểm tra config.mastery (docs/rules/skill-mastery.md): công thức exp, hiệu lực theo cấp, mốc.

import type { GameData } from '../model'
import { asObject, checkInteger, checkNumber, isFiniteNumber } from '../shared'
import { checkKnownFields } from './checks'

const WHERE = 'config.mastery'

const CONFIG_FIELDS = [
  'baseExp',
  'expPower',
  'useExp',
  'knockoutExp',
  'powerStep',
  'accuracyPerLevel',
  'milestones'
]

/** Mốc: cấp nguyên ≥ 2 tăng dần, có ít nhất một thưởng, thưởng không âm. */
function checkMilestones(value: unknown, issues: string[]): void {
  const where = `${WHERE}.milestones`
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  let previous = 1
  value.forEach((raw: unknown, i) => {
    const at = `${where}[${i}]`
    const milestone = asObject(raw)
    if (!milestone) {
      issues.push(`${at} không hợp lệ`)
      return
    }
    checkKnownFields(
      milestone,
      ['level', 'secondaryChancePercent', 'minHitsBonus'],
      at,
      'mốc thuần thục',
      issues
    )
    issues.push(...checkInteger(milestone.level, `${at}.level`, 2))
    if (isFiniteNumber(milestone.level)) {
      if (milestone.level <= previous) issues.push(`${at}.level phải tăng dần`)
      previous = milestone.level
    }
    const { secondaryChancePercent, minHitsBonus } = milestone
    if (secondaryChancePercent === undefined && minHitsBonus === undefined) {
      issues.push(`${at} cần ít nhất một thưởng (secondaryChancePercent / minHitsBonus)`)
    }
    if (secondaryChancePercent !== undefined) {
      issues.push(...checkNumber(secondaryChancePercent, `${at}.secondaryChancePercent`, 0))
    }
    if (minHitsBonus !== undefined) {
      issues.push(...checkInteger(minHitsBonus, `${at}.minHitsBonus`, 0))
    }
  })
}

/** Kiểm tra config.mastery. */
export function checkMasteryConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.mastery)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(config, CONFIG_FIELDS, WHERE, 'config', issues)
  // baseExp, expPower > 0 để tổng exp tăng theo cấp và tính ngược được ra cấp.
  for (const field of ['baseExp', 'expPower'] as const) {
    const value = config[field]
    if (!isFiniteNumber(value) || value <= 0) {
      issues.push(`${WHERE}.${field} phải là số > 0, nhận ${String(value)}`)
    }
  }
  issues.push(...checkNumber(config.useExp, `${WHERE}.useExp`, 0))
  issues.push(...checkNumber(config.knockoutExp, `${WHERE}.knockoutExp`, 0))
  issues.push(...checkNumber(config.powerStep, `${WHERE}.powerStep`, 0))
  issues.push(...checkNumber(config.accuracyPerLevel, `${WHERE}.accuracyPerLevel`, 0))
  checkMilestones(config.milestones, issues)
}
