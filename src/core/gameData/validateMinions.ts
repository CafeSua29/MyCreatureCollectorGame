// Kiểm tra minion (minions.json, mục "Minion" ở battle.md).

import { TRAIT_HOOKS } from '../registries'
import type { GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkEffects } from './checks'

/** stack tối đa nguyên ≥ 1, tỉ lệ mất [0, 100], ít nhất một hook trait hợp lệ. */
export function checkMinions(data: GameData, issues: string[]): void {
  for (const minion of Object.values(data.minions)) {
    const where = `Minion "${minion.id}"`
    issues.push(...checkInteger(minion.maxStacks, `${where}: maxStacks`, 1))
    issues.push(...checkNumber(minion.leaveChance, `${where}: leaveChance`, 0, 100))
    if (Array.isArray(minion.hooks) && minion.hooks.length === 0) {
      issues.push(`${where}: cần ít nhất một hook`)
    }
    checkEffects(TRAIT_HOOKS, minion.hooks, where, data, issues)
    // Max HP không được phụ thuộc trạng thái tạm trong trận (mục "Trait Siralim").
    for (const hook of Array.isArray(minion.hooks) ? minion.hooks : []) {
      const params = asObject(hook?.params)
      if (asObject(params?.percent)?.hp !== undefined || asObject(params?.flat)?.hp !== undefined) {
        issues.push(`${where}: hook "${String(hook?.type)}" không được đổi hp`)
      }
    }
    if (minion.excludeFromRandom !== undefined && minion.excludeFromRandom !== true) {
      issues.push(`${where}: excludeFromRandom chỉ được là true`)
    }
  }
}
