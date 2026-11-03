// Kiểm tra phi thăng và thiên mệnh trong save (docs/rules/ascension.md): GameState.ascension,
// GameState.destinies. Gọi từ validateGameState.

import { validateRanks } from '../monster'
import type { GameData } from '../model'
import { asObject, checkBig, checkInteger } from '../shared'

/** Danh sách id thiên mệnh: id tồn tại, không trùng. */
function checkDestinyIds(data: GameData, value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách id thiên mệnh`)
    return
  }
  for (const id of value) {
    if (typeof id !== 'string' || !Object.hasOwn(data.destinies, id)) {
      issues.push(`${path}: thiên mệnh không tồn tại "${String(id)}"`)
    }
  }
  if (new Set(value).size !== value.length) issues.push(`${path} bị trùng`)
}

export function validateAscensionState(data: GameData, state: Record<string, unknown>): string[] {
  const issues: string[] = []
  checkDestinyIds(data, state.destinies, 'destinies', issues)
  const ascension = asObject(state.ascension)
  if (!ascension) return [...issues, 'ascension phải là object']
  issues.push(...checkInteger(ascension.count, 'ascension.count', 0))
  issues.push(...checkBig(ascension.immortalEssence, 'ascension.immortalEssence', 0))
  issues.push(...checkBig(ascension.totalEssenceEarned, 'ascension.totalEssenceEarned', 0))
  issues.push(...validateRanks(data.ascensionUpgrades, ascension.upgrades, 'ascension.upgrades'))
  issues.push(...checkInteger(ascension.bestFloor, 'ascension.bestFloor', 1))
  issues.push(...checkInteger(ascension.bestRealm, 'ascension.bestRealm', 0))
  issues.push(...checkInteger(ascension.bestAwakening, 'ascension.bestAwakening', 0))
  if (ascension.destinyChoices !== null) {
    checkDestinyIds(data, ascension.destinyChoices, 'ascension.destinyChoices', issues)
  }
  return issues
}
