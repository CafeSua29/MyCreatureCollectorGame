// Kiểm tra dữ liệu thiên tài địa bảo (docs/rules/treasures.md): config.treasures.

import type { GameData } from '../model'
import { asObject, checkNumber } from '../shared'
import { checkDrops, checkKnownFields } from './checks'

const FIELDS = [
  'resistance',
  'favoriteMultiplier',
  'favoriteAffinity',
  'wildDrops',
  'bossDrops',
  'demonCoreItemIds',
  'demonCoreChance',
  'demonCoreWildChance'
]

/** Kiểm tra config.treasures. */
export function checkTreasureData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.treasures)
  if (!config) {
    issues.push('config.treasures phải là object')
    return
  }
  const at = (field: string): string => `config.treasures.${field}`
  checkKnownFields(config, FIELDS, 'config.treasures', 'config', issues)
  issues.push(...checkNumber(config.resistance, at('resistance'), 0, 1))
  issues.push(...checkNumber(config.favoriteMultiplier, at('favoriteMultiplier'), 1))
  issues.push(...checkNumber(config.favoriteAffinity, at('favoriteAffinity'), 0))
  issues.push(...checkNumber(config.demonCoreChance, at('demonCoreChance'), 0, 100))
  issues.push(...checkNumber(config.demonCoreWildChance, at('demonCoreWildChance'), 0, 100))
  for (const key of ['wildDrops', 'bossDrops'] as const) {
    if (!Array.isArray(config[key])) issues.push(`${at(key)} phải là danh sách`)
    else checkDrops(data, config[key], at(key), issues)
  }
  const cores = asObject(config.demonCoreItemIds)
  if (!cores) {
    issues.push(`${at('demonCoreItemIds')} phải là object hệ → id vật phẩm`)
    return
  }
  for (const [elementId, itemId] of Object.entries(cores)) {
    if (!Object.hasOwn(data.elements, elementId)) {
      issues.push(`${at('demonCoreItemIds')}: hệ không tồn tại "${elementId}"`)
    }
    if (typeof itemId !== 'string' || data.items[itemId]?.category !== 'consumable') {
      issues.push(`${at('demonCoreItemIds')}.${elementId} phải là vật phẩm tiêu hao`)
    }
  }
}
