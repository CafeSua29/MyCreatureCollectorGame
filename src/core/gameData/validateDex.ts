// Kiểm tra dữ liệu Bộ sưu tập (docs/rules/dex.md): config.dex, mốc bắt chí mạng capture.criticalTiers.

import type { GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields, checkStackItemId } from './checks'

/** Phần thưởng: tiền ≥ 0, vật phẩm gộp chồng tồn tại, số lượng nguyên ≥ 1. */
function checkReward(data: GameData, reward: Record<string, unknown>, at: string): string[] {
  const issues = [...checkNumber(reward.moneyPerFloor, `${at}.moneyPerFloor`, 0)]
  const items = asObject(reward.items)
  if (!items) return [...issues, `${at}.items phải là object`]
  for (const [itemId, count] of Object.entries(items)) {
    issues.push(...checkStackItemId(data, itemId, `${at}.items`))
    issues.push(...checkInteger(count, `${at}.items.${itemId}`, 1))
  }
  return issues
}

/** Mốc thưởng: id không trùng, % tăng dần trong (0, 100], phần thưởng hợp lệ. */
function checkMilestones(data: GameData, value: unknown, issues: string[]): void {
  const where = 'config.dex.milestones'
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  const ids = new Set<string>()
  let last = 0
  value.forEach((entry, i) => {
    const at = `${where}[${i}]`
    const milestone = asObject(entry)
    if (!milestone) {
      issues.push(`${at} phải là object`)
      return
    }
    checkKnownFields(milestone, ['id', 'percent', 'moneyPerFloor', 'items'], at, 'mốc', issues)
    if (typeof milestone.id !== 'string' || milestone.id === '' || ids.has(milestone.id)) {
      issues.push(`${at}.id phải là chuỗi không rỗng, không trùng`)
    } else ids.add(milestone.id)
    issues.push(...checkNumber(milestone.percent, `${at}.percent`, Number.MIN_VALUE, 100))
    if (typeof milestone.percent === 'number') {
      if (milestone.percent <= last) issues.push(`${at}.percent phải tăng dần`)
      last = milestone.percent
    }
    issues.push(...checkReward(data, milestone, at))
  })
}

/** Mốc chí mạng: % sở hữu tăng dần trong [0, 100], hệ số ≥ 0. */
function checkCriticalTiers(value: unknown, issues: string[]): void {
  const where = 'config.capture.criticalTiers'
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  let last = -1
  value.forEach((entry, i) => {
    const tier = asObject(entry)
    if (!tier) {
      issues.push(`${where}[${i}] phải là object`)
      return
    }
    issues.push(...checkNumber(tier.ownedPercent, `${where}[${i}].ownedPercent`, 0, 100))
    issues.push(...checkNumber(tier.multiplier, `${where}[${i}].multiplier`, 0))
    if (typeof tier.ownedPercent === 'number') {
      if (tier.ownedPercent <= last) issues.push(`${where}[${i}].ownedPercent phải tăng dần`)
      last = tier.ownedPercent
    }
  })
}

/** Kiểm tra config.dex và capture.criticalTiers. */
export function checkDexData(data: GameData, issues: string[]): void {
  checkCriticalTiers(data.config.capture?.criticalTiers, issues)
  const config = asObject(data.config.dex)
  if (!config) {
    issues.push('config.dex phải là object')
    return
  }
  checkKnownFields(
    config,
    ['milestones', 'collectionStep', 'collectionStatPercent', 'regionalReward'],
    'config.dex',
    'config',
    issues
  )
  checkMilestones(data, config.milestones, issues)
  issues.push(...checkInteger(config.collectionStep, 'config.dex.collectionStep', 1))
  issues.push(...checkNumber(config.collectionStatPercent, 'config.dex.collectionStatPercent', 0))
  const regional = asObject(config.regionalReward)
  if (!regional) issues.push('config.dex.regionalReward phải là object')
  else {
    checkKnownFields(
      regional,
      ['moneyPerFloor', 'items'],
      'config.dex.regionalReward',
      'thưởng',
      issues
    )
    issues.push(...checkReward(data, regional, 'config.dex.regionalReward'))
  }
}
