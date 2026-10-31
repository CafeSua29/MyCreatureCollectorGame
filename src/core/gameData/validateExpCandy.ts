// Kiểm tra config.expCandy (mục "Kẹo EXP và Kẹo Hiếm" ở world-items.md): bậc kẹo rơi theo tầng và
// Kẹo Hiếm của boss tầng.

import type { GameData } from '../model'
import { asObject, checkInteger, isFiniteNumber } from '../shared'
import { checkDrops, checkKnownFields } from './checks'

/** Bậc rơi theo tầng: ít nhất một bậc, bậc đầu từ tầng 1, fromFloor tăng dần. */
function checkBossDropTiers(data: GameData, value: unknown, issues: string[]): void {
  const where = 'config.expCandy.bossDropTiers'
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${where} cần ít nhất một bậc`)
    return
  }
  let previous = 0
  value.forEach((raw: unknown, i) => {
    const tier = asObject(raw)
    const at = `${where}[${i}]`
    if (!tier) {
      issues.push(`${at} không hợp lệ`)
      return
    }
    checkKnownFields(tier, ['fromFloor', 'drops'], at, 'bậc kẹo rơi', issues)
    issues.push(...checkInteger(tier.fromFloor, `${at}.fromFloor`, 1))
    if (isFiniteNumber(tier.fromFloor)) {
      if (i === 0 && tier.fromFloor !== 1) issues.push(`${at}.fromFloor của bậc đầu phải là 1`)
      if (tier.fromFloor <= previous) issues.push(`${at}.fromFloor phải tăng dần`)
      previous = tier.fromFloor
    }
    if (!Array.isArray(tier.drops)) issues.push(`${at}.drops phải là danh sách`)
    else checkDrops(data, tier.drops, `${at}.drops`, issues)
  })
}

/** Kiểm tra config.expCandy. */
export function checkExpCandyConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.expCandy)
  if (!config) {
    issues.push('config.expCandy phải là object')
    return
  }
  checkKnownFields(config, ['bossDropTiers', 'floorBossDrops'], 'config.expCandy', 'config', issues)
  checkBossDropTiers(data, config.bossDropTiers, issues)
  if (!Array.isArray(config.floorBossDrops)) {
    issues.push('config.expCandy.floorBossDrops phải là danh sách')
  } else {
    checkDrops(data, config.floorBossDrops, 'config.expCandy.floorBossDrops', issues)
  }
}
