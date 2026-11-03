// Kiểm tra độ bất ổn tầng trong save (docs/rules/instability.md): GameState.instability và
// BattleState.instability. Gọi từ validateGameState.

import { TRIAL_RULES } from '../registries'
import { isFloorSpecialKind } from '../battle'
import { maxInstabilityLevel } from '../world'
import type { GameData, TrialRuleDef } from '../model'
import { asObject, checkInteger } from '../shared'

/** Luật tồn tại và là thuộc tính bất ổn (có khối instability, loại dùng được). */
function instabilityRuleOf(data: GameData, ruleId: unknown): TrialRuleDef | undefined {
  if (typeof ruleId !== 'string' || !Object.hasOwn(data.trialRules, ruleId)) return undefined
  const def = data.trialRules[ruleId]
  return def.instability && TRIAL_RULES[def.type].inInstability ? def : undefined
}

/** Danh sách id thuộc tính: mỗi id là thuộc tính bất ổn; loại không stackable không trùng. */
function checkRuleIds(data: GameData, ids: readonly unknown[], path: string): string[] {
  const issues: string[] = []
  const types = new Set<string>()
  ids.forEach((id, i) => {
    const def = instabilityRuleOf(data, id)
    if (!def) {
      issues.push(`${path}[${i}]: thuộc tính bất ổn không tồn tại "${String(id)}"`)
      return
    }
    if (!TRIAL_RULES[def.type].stackable && types.has(def.type)) {
      issues.push(`${path}[${i}]: loại ${def.type} chỉ có một lần`)
    }
    types.add(def.type)
  })
  return issues
}

/**
 * instability: { level, properties } — level nguyên trong [0, mức tối đa theo tầng]; tối đa
 * (visiblePerLevel + hiddenPerLevel) × level thuộc tính { ruleId, hidden }.
 */
export function validateInstabilityState(data: GameData, state: Record<string, unknown>): string[] {
  const instability = asObject(state.instability)
  if (!instability) return ['instability phải là object { level, properties }']
  const issues = checkInteger(instability.level, 'instability.level', 0)
  const { properties } = instability
  if (!Array.isArray(properties)) return [...issues, 'instability.properties phải là danh sách']
  if (issues.length > 0) return issues
  const level = instability.level as number
  const highestFloor = state.highestFloor
  const bestFloor = asObject(state.ascension)?.bestFloor
  if (
    typeof highestFloor === 'number' &&
    typeof bestFloor === 'number' &&
    level > maxInstabilityLevel(data, { highestFloor, ascension: { bestFloor } })
  ) {
    issues.push(`instability.level ${level} vượt mức tối đa theo tầng cao nhất`)
  }
  const { visiblePerLevel, hiddenPerLevel } = data.config.instability
  if (properties.length > (visiblePerLevel + hiddenPerLevel) * level) {
    issues.push(`instability.properties: quá số thuộc tính của mức ${level}`)
  }
  const entries = properties.map((entry: unknown) => asObject(entry))
  entries.forEach((entry, i) => {
    if (typeof entry?.hidden !== 'boolean') {
      issues.push(`instability.properties[${i}].hidden phải là boolean`)
    }
  })
  issues.push(
    ...checkRuleIds(
      data,
      entries.map((entry) => entry?.ruleId),
      'instability.properties'
    )
  )
  return issues
}

/**
 * battle.instability: null hoặc { level ≥ 1, ruleIds }; chỉ ở trận quái hoang / boss trên tầng
 * (không NPC, bí cảnh / tháp, độ kiếp, trận đặc biệt không phải trên tầng).
 */
export function checkBattleInstability(
  data: GameData,
  battle: Record<string, unknown>,
  issues: string[]
): void {
  if (battle.instability === null) return
  const instability = asObject(battle.instability)
  if (!instability) {
    issues.push('battle.instability phải là null hoặc { level, ruleIds }')
    return
  }
  issues.push(...checkInteger(instability.level, 'battle.instability.level', 1))
  if (!Array.isArray(instability.ruleIds)) {
    issues.push('battle.instability.ruleIds phải là danh sách')
  } else {
    issues.push(...checkRuleIds(data, instability.ruleIds, 'battle.instability.ruleIds'))
  }
  const special = asObject(battle.special)
  if (
    battle.trainer !== null ||
    battle.trial !== null ||
    battle.tribulation !== null ||
    (special !== null && !isFloorSpecialKind(special.kind))
  ) {
    issues.push('battle.instability: chỉ có ở trận quái hoang / boss trên tầng')
  }
}
