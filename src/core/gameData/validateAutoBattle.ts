// Kiểm tra config.autoBattle (docs/rules/auto-battle.md): mọi chiến thuật đủ trọng số ≥ 0.

import { TACTICS, type GameData } from '../model'
import { asObject, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const WEIGHTS = ['damage', 'foeEffects', 'allyEffects', 'penalty', 'guard']

/** Kiểm tra config.autoBattle. */
export function checkAutoBattleData(data: GameData, issues: string[]): void {
  const tactics = asObject(asObject(data.config.autoBattle)?.tactics)
  if (!tactics) {
    issues.push('config.autoBattle.tactics phải là object')
    return
  }
  checkKnownFields(tactics, [...TACTICS], 'config.autoBattle.tactics', 'config', issues)
  for (const tactic of TACTICS) {
    const at = `config.autoBattle.tactics.${tactic}`
    const weights = asObject(tactics[tactic])
    if (!weights) {
      issues.push(`${at} phải là object`)
      continue
    }
    checkKnownFields(weights, WEIGHTS, at, 'config', issues)
    for (const key of WEIGHTS) issues.push(...checkNumber(weights[key], `${at}.${key}`, 0))
  }
}
