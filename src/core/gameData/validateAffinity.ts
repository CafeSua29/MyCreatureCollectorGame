// Kiểm tra dữ liệu độ thân mật (docs/rules/affinity.md): config.affinity, affinityTiers.json.

import { TRAIT_HOOKS } from '../registries'
import type { GameData } from '../model'
import { asObject, checkInteger } from '../shared'
import { checkDrops, checkEffects, checkKnownFields } from './checks'

function checkAffinityConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.affinity)
  if (!config) {
    issues.push('config.affinity phải là object')
    return
  }
  const at = (field: string): string => `config.affinity.${field}`
  const push = (problems: string[]): void => void issues.push(...problems)
  push(checkInteger(config.max, at('max'), 1))
  const max = typeof config.max === 'number' ? config.max : Infinity
  const start = asObject(config.start)
  for (const key of ['starter', 'caught', 'egg', 'recruit'] as const) {
    push(checkInteger(start?.[key], at(`start.${key}`), 0))
    if (typeof start?.[key] === 'number' && start[key] > max) {
      issues.push(`${at(`start.${key}`)} tối đa ${max}, nhận ${start[key]}`)
    }
  }
  const gain = asObject(config.gain)
  for (const key of ['win', 'participated', 'rest', 'potion', 'candy'] as const) {
    push(checkInteger(gain?.[key], at(`gain.${key}`), 0))
  }
  push(checkInteger(asObject(config.loss)?.faint, at('loss.faint'), 0))
  for (const key of ['wildDrops', 'bossDrops', 'floorBossDrops'] as const) {
    if (!Array.isArray(config[key])) issues.push(`${at(key)} phải là danh sách`)
    else checkDrops(data, config[key], at(key), issues)
  }
}

/** Mức thân mật: mức đầu từ 0, `from` nguyên tăng dần không quá max, hook theo luật hook trait. */
function checkAffinityTiers(data: GameData, issues: string[]): void {
  const tiers = Object.values(data.affinityTiers)
  if (tiers.length === 0) issues.push('affinityTiers: cần ít nhất một mức')
  let previous = -1
  tiers.forEach((tier, i) => {
    const where = `Mức thân mật "${tier.id}"`
    checkKnownFields(tier, ['id', 'from', 'hooks'], where, 'mức thân mật', issues)
    issues.push(...checkInteger(tier.from, `${where}: from`, 0))
    if (typeof tier.from === 'number') {
      if (i === 0 && tier.from !== 0) issues.push(`${where}: mức đầu phải có from 0`)
      if (tier.from <= previous) issues.push(`${where}: from phải tăng dần`)
      const max = data.config.affinity?.max
      if (typeof max === 'number' && tier.from > max) {
        issues.push(`${where}: from tối đa ${max}, nhận ${tier.from}`)
      }
      previous = tier.from
    }
    checkEffects(TRAIT_HOOKS, tier.hooks, where, data, issues)
  })
}

/** Kiểm tra mọi dữ liệu thân mật. */
export function checkAffinityData(data: GameData, issues: string[]): void {
  checkAffinityConfig(data, issues)
  checkAffinityTiers(data, issues)
}
