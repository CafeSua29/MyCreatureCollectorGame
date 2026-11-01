// Kiểm tra phần bí cảnh / tháp thí luyện trong save (docs/rules/trials.md): GameState.trial,
// GameState.tower và BattleState.trial. Gọi từ validateGameState.

import { hasTrialRule, TRIAL_RULES } from '../registries'
import type { GameData, TrialRule } from '../model'
import { asObject, checkInteger } from '../shared'
import { validateEquipmentInstance } from '../inventory'

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

/** Lượt Khí giới bí cảnh { kind, instance, cleared } (docs/rules/artifact-spirits.md). */
function checkItemWorldRun(data: GameData, run: Record<string, unknown>, issues: string[]): void {
  issues.push(...validateEquipmentInstance(data, run.instance, 'trial.instance'))
  issues.push(...checkInteger(run.cleared, 'trial.cleared', 0))
  for (const key of Object.keys(run)) {
    if (!['kind', 'instance', 'cleared'].includes(key)) issues.push(`trial: trường lạ "${key}"`)
  }
}

/**
 * trial: null, bí cảnh { kind: realm, floor, biomeId, rules, battleCount, cleared } (cleared <
 * battleCount) hoặc Khí giới bí cảnh { kind: itemWorld, instance, cleared }; đang đi phó bản thì ở
 * thị trấn. tower: { highest } nguyên ≥ 0.
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
  if (!trial) return [...issues, 'trial phải là null hoặc phó bản']
  if (!inTown) issues.push('trial: đang đi phó bản thì phải ở thị trấn')
  if (trial.kind === 'itemWorld') {
    checkItemWorldRun(data, trial, issues)
    return issues
  }
  if (trial.kind !== 'realm') return [...issues, 'trial.kind phải là realm / itemWorld']
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
  const run = asObject(state.trial)
  if (trial.kind === 'realm') {
    if (!ended && run?.kind !== 'realm')
      issues.push('battle.trial: trận bí cảnh nhưng không có bí cảnh')
    return
  }
  if (trial.kind === 'itemWorld') {
    checkBattleItemWorld(trial, { run, ended }, issues)
    return
  }
  if (trial.kind !== 'tower') {
    issues.push('battle.trial.kind phải là realm / tower / itemWorld')
    return
  }
  issues.push(...checkInteger(trial.towerFloor, 'battle.trial.towerFloor', 1))
  const highest = asObject(state.tower)?.highest
  if (typeof highest !== 'number' || typeof trial.towerFloor !== 'number') return
  const expected = trial.towerFloor === highest + 1 || (ended && trial.towerFloor === highest)
  if (!expected) issues.push(`battle.trial.towerFloor phải là tầng tháp kế tiếp (${highest + 1})`)
}

/**
 * Trận Khí giới bí cảnh: không có luật, tầng nguyên ≥ 1, bậc boss là id trong config (hoặc null), dã
 * linh { carrierId, index } hoặc null; trận chưa kết thúc thì đang đi Khí giới bí cảnh và tầng là
 * tầng kế tiếp của món.
 */
function checkBattleItemWorld(
  trial: Record<string, unknown>,
  { run, ended }: { run: Record<string, unknown> | null; ended: boolean },
  issues: string[]
): void {
  if (Array.isArray(trial.rules) && trial.rules.length > 0) {
    issues.push('battle.trial.rules: trận Khí giới bí cảnh không có luật')
  }
  issues.push(...checkInteger(trial.depth, 'battle.trial.depth', 1))
  if (trial.bossTierId !== null && typeof trial.bossTierId !== 'string') {
    issues.push('battle.trial.bossTierId phải là chuỗi hoặc null')
  }
  if (trial.spirit !== null) {
    const spirit = asObject(trial.spirit)
    if (!spirit || typeof spirit.carrierId !== 'string') {
      issues.push('battle.trial.spirit phải là null hoặc { carrierId, index }')
    } else issues.push(...checkInteger(spirit.index, 'battle.trial.spirit.index', 0))
  }
  if (ended) return
  if (run?.kind !== 'itemWorld') {
    issues.push('battle.trial: trận Khí giới bí cảnh nhưng không có lượt đi')
    return
  }
  const depth = asObject(run.instance)?.depth ?? 0
  if (typeof depth === 'number' && trial.depth !== depth + 1) {
    issues.push(`battle.trial.depth phải là tầng kế tiếp của món (${depth + 1})`)
  }
}
