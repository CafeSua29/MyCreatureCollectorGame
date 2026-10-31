// Kiểm tra dữ liệu thu phục (docs/rules/recruit.md): config.recruit.

import type { GameData, IntimidateConfig, RecruitConfig } from '../model'
import { asObject, checkNumber } from '../shared'
import { checkKnownFields, fieldList } from './checks'

const WHERE = 'config.recruit'

const FIELDS = fieldList<RecruitConfig>({
  baseChance: true,
  bossChance: true,
  rankFalloff: true,
  baitFavoriteMultiplier: true,
  intimidate: true
})

const INTIMIDATE_FIELDS = fieldList<IntimidateConfig>({
  slope: true,
  offset: true,
  maxChance: true,
  failStages: true
})

const FAIL_STAGES: readonly string[] = ['attack', 'spAttack']

/** Thị Uy: hệ số bất kỳ, tỉ lệ tối đa 0–1, bậc thất bại là số nguyên khác 0 của công / đặc công. */
function checkIntimidate(value: unknown, issues: string[]): void {
  const where = `${WHERE}.intimidate`
  const config = asObject(value)
  if (!config) {
    issues.push(`${where} phải là object`)
    return
  }
  checkKnownFields(config, INTIMIDATE_FIELDS, where, 'config', issues)
  issues.push(...checkNumber(config.slope, `${where}.slope`))
  issues.push(...checkNumber(config.offset, `${where}.offset`))
  issues.push(...checkNumber(config.maxChance, `${where}.maxChance`, 0, 1))
  const stages = asObject(config.failStages)
  if (!stages) {
    issues.push(`${where}.failStages phải là object`)
    return
  }
  checkKnownFields(stages, FAIL_STAGES, `${where}.failStages`, 'chỉ số', issues)
  for (const [stat, delta] of Object.entries(stages)) {
    if (!Number.isInteger(delta) || delta === 0) {
      issues.push(`${where}.failStages.${stat} phải là số nguyên khác 0, nhận ${String(delta)}`)
    }
  }
}

/** Kiểm tra config.recruit. */
export function checkRecruitData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.recruit)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(config, FIELDS, WHERE, 'config', issues)
  issues.push(...checkNumber(config.baseChance, `${WHERE}.baseChance`, 0, 100))
  issues.push(...checkNumber(config.bossChance, `${WHERE}.bossChance`, 0, 100))
  issues.push(...checkNumber(config.rankFalloff, `${WHERE}.rankFalloff`, 0, 1))
  issues.push(...checkNumber(config.baitFavoriteMultiplier, `${WHERE}.baitFavoriteMultiplier`, 0))
  checkIntimidate(config.intimidate, issues)
}
