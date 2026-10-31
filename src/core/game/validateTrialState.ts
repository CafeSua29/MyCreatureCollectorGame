// Kiểm tra phần bí cảnh / tháp thí luyện trong save (docs/rules/trials.md): GameState.trial,
// GameState.tower và BattleState.trial. Gọi từ validateGameState.

import { hasTrialRule, TRIAL_RULES } from '../registries'
import type { GameData, TrialRule } from '../model'
import { asObject, checkInteger } from '../shared'

/** Danh sách luật: luật tồn tại, luật một hệ có hệ tồn tại, luật khác elementId null. */
function checkRules(data: GameData, value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách luật { ruleId, elementId }`)
    return
  }
  value.forEach((entry: unknown, i) => {
    const rule = asObject(entry)
    const at = `${path}[${i}]`
    const def =
      typeof rule?.ruleId === 'string' && Object.hasOwn(data.trialRules, rule.ruleId)
        ? data.trialRules[rule.ruleId]
        : undefined
    if (!def) {
      issues.push(`${at}.ruleId: luật bí cảnh không tồn tại "${String(rule?.ruleId)}"`)
      return
    }
    const elementId = rule?.elementId
    if (!TRIAL_RULES[def.type].needsElement) {
      if (elementId !== null) issues.push(`${at}.elementId phải là null (luật ${def.type})`)
    } else if (typeof elementId !== 'string' || !Object.hasOwn(data.elements, elementId)) {
      issues.push(`${at}.elementId: hệ không tồn tại "${String(elementId)}"`)
    }
  })
}

function checkBiomeId(data: GameData, value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'string' || !Object.hasOwn(data.biomes, value)) {
    issues.push(`${path}: map không tồn tại "${String(value)}"`)
  }
}

/**
 * trial: null hoặc bí cảnh { floor, biomeId, rules, battleCount, cleared } (cleared < battleCount;
 * đang đi bí cảnh thì ở thị trấn); tower: { highest } nguyên ≥ 0.
 */
export function validateTrialState(
  data: GameData,
  state: Record<string, unknown>,
  { inTown }: { inTown: boolean }
): string[] {
  const issues: string[] = []
  const tower = asObject(state.tower)
  if (!tower) issues.push('tower phải là object { highest }')
  else issues.push(...checkInteger(tower.highest, 'tower.highest', 0))
  if (state.trial === null) return issues
  const trial = asObject(state.trial)
  if (!trial) return [...issues, 'trial phải là null hoặc bí cảnh']
  issues.push(...checkInteger(trial.floor, 'trial.floor', 1))
  checkBiomeId(data, trial.biomeId, 'trial.biomeId', issues)
  checkRules(data, trial.rules, 'trial.rules', issues)
  issues.push(...checkInteger(trial.battleCount, 'trial.battleCount', 1))
  issues.push(...checkInteger(trial.cleared, 'trial.cleared', 0))
  if (
    typeof trial.cleared === 'number' &&
    typeof trial.battleCount === 'number' &&
    trial.cleared >= trial.battleCount
  ) {
    issues.push('trial.cleared phải < battleCount')
  }
  if (!inTown) issues.push('trial: đang đi bí cảnh thì phải ở thị trấn')
  return issues
}

/** Trận có luật noTamerSkills (phe NPC được không có ngự thú sư). */
export function battleHasNoTamers(data: GameData, battle: Record<string, unknown>): boolean {
  const rules = asObject(battle.trial)?.rules
  if (!Array.isArray(rules)) return false
  const known = rules.filter(
    (rule: unknown): rule is TrialRule =>
      typeof asObject(rule)?.ruleId === 'string' &&
      Object.hasOwn(data.trialRules, String(asObject(rule)?.ruleId))
  )
  return hasTrialRule(data, known, 'noTamerSkills')
}

/**
 * battle.trial: null hoặc { kind, biomeId, rules } (tháp thêm towerFloor). Trận bí cảnh chưa kết
 * thúc thì đang đi bí cảnh; trận tháp là tầng kế tiếp (đã thắng thì là tầng cao nhất). Không đồng
 * thời là trận độ kiếp.
 */
export function checkBattleTrial(
  data: GameData,
  battle: Record<string, unknown>,
  state: Record<string, unknown>,
  issues: string[]
): void {
  if (battle.trial === null) return
  const trial = asObject(battle.trial)
  if (!trial) {
    issues.push('battle.trial phải là null hoặc { kind, biomeId, rules }')
    return
  }
  checkBiomeId(data, trial.biomeId, 'battle.trial.biomeId', issues)
  checkRules(data, trial.rules, 'battle.trial.rules', issues)
  if (battle.tribulation !== null) issues.push('battle.trial: không đồng thời là trận độ kiếp')
  const ended = battle.phase === 'ended'
  if (trial.kind === 'realm') {
    if (!ended && state.trial === null)
      issues.push('battle.trial: trận bí cảnh nhưng không có bí cảnh')
    return
  }
  if (trial.kind !== 'tower') {
    issues.push('battle.trial.kind phải là realm / tower')
    return
  }
  issues.push(...checkInteger(trial.towerFloor, 'battle.trial.towerFloor', 1))
  const highest = asObject(state.tower)?.highest
  if (typeof highest !== 'number' || typeof trial.towerFloor !== 'number') return
  const expected = trial.towerFloor === highest + 1 || (ended && trial.towerFloor === highest)
  if (!expected) issues.push(`battle.trial.towerFloor phải là tầng tháp kế tiếp (${highest + 1})`)
}
