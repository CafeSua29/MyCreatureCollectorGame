// Kiểm tra dữ liệu sức chứa (docs/rules/capacity.md): config.capacity.

import { CAPACITY_KINDS, type CapacityRule, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields, fieldList } from './checks'

const WHERE = 'config.capacity'

const RULE_FIELDS = fieldList<CapacityRule>({
  base: true,
  perExpansion: true,
  costBase: true,
  realmBonus: true
})

/** Kiểm tra config.capacity: đủ mọi loại, số nguyên ≥ 0 (mở rộng ≥ 1), giá ≥ 0. */
export function checkCapacityData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.capacity)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(config, CAPACITY_KINDS, WHERE, 'loại sức chứa', issues)
  for (const kind of CAPACITY_KINDS) {
    const where = `${WHERE}.${kind}`
    const rule = asObject(config[kind])
    if (!rule) {
      issues.push(`${where} phải là object`)
      continue
    }
    checkKnownFields(rule, RULE_FIELDS, where, 'config', issues)
    issues.push(...checkInteger(rule.base, `${where}.base`, 0))
    issues.push(...checkInteger(rule.perExpansion, `${where}.perExpansion`, 1))
    issues.push(...checkNumber(rule.costBase, `${where}.costBase`, 0))
    issues.push(...checkInteger(rule.realmBonus, `${where}.realmBonus`, 0))
  }
}
