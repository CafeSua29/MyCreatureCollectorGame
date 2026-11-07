// Kiểm tra phần phối hợp đội trong save (docs/rules/team.md): trận pháp đã học / đang dùng, cộng
// hưởng / trận pháp / kỹ năng đồng hành (docs/rules/partner-skills.md) của từng phe trong trận.

import { synergyTierOf } from '../registries'
import { BATTLE_SIDES, type BattleSide, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'

/** formations: known là danh sách không lặp id trận pháp; active null hoặc nằm trong known. */
export function validateFormationState(data: GameData, value: unknown): string[] {
  const formations = asObject(value)
  if (!formations) return ['formations phải là object']
  const issues: string[] = []
  const known = formations.known
  if (!Array.isArray(known)) {
    issues.push('formations.known phải là danh sách')
  } else {
    for (const id of known) {
      if (typeof id !== 'string' || !(id in data.formations)) {
        issues.push(`formations.known: trận pháp không tồn tại "${String(id)}"`)
      }
    }
    if (new Set(known).size !== known.length) issues.push('formations.known bị lặp')
  }
  const active = formations.active
  if (active !== null && (!Array.isArray(known) || !known.includes(active))) {
    issues.push(`formations.active phải là null hoặc trận pháp đã học, nhận "${String(active)}"`)
  }
  return issues
}

/** Luật sideHooks của phe (docs/rules/instability.md): luật tồn tại, đúng loại, đúng phe. */
function checkRuleBonus(
  data: GameData,
  bonus: Record<string, unknown>,
  { where, side }: { where: string; side: BattleSide },
  issues: string[]
): void {
  const def = typeof bonus.id === 'string' ? data.trialRules[bonus.id] : undefined
  if (def?.type !== 'sideHooks') {
    issues.push(`${where}: luật sideHooks không tồn tại "${String(bonus.id)}"`)
    return
  }
  if (def.params.side !== side) issues.push(`${where}: luật "${def.id}" không dành cho phe ${side}`)
  issues.push(...checkInteger(bonus.count, `${where}.count`, 1))
}

/** Ân huệ bí cảnh (docs/rules/trial-boons.md): ân huệ tồn tại, chỉ phe người chơi, cấp nguyên ≥ 1. */
function checkBoonBonus(
  data: GameData,
  bonus: Record<string, unknown>,
  { where, side }: { where: string; side: BattleSide },
  issues: string[]
): void {
  if (typeof bonus.id !== 'string' || !Object.hasOwn(data.trialBoons, bonus.id)) {
    issues.push(`${where}: ân huệ không tồn tại "${String(bonus.id)}"`)
  }
  if (side !== 'player') issues.push(`${where}: ân huệ chỉ có ở phe người chơi`)
  issues.push(...checkInteger(bonus.stacks, `${where}.stacks`, 1))
}

/** Một mục cộng hưởng / trận pháp / luật / ân huệ của phe trong trận. */
function checkTeamBonus(
  data: GameData,
  value: unknown,
  { where, side }: { where: string; side: BattleSide },
  issues: string[]
): void {
  const bonus = asObject(value)
  if (bonus?.kind === 'rule') {
    checkRuleBonus(data, bonus, { where, side }, issues)
    return
  }
  if (bonus?.kind === 'boon') {
    checkBoonBonus(data, bonus, { where, side }, issues)
    return
  }
  if (bonus?.kind === 'synergy') {
    const synergy = typeof bonus.id === 'string' ? data.synergies[bonus.id] : undefined
    if (!synergy) {
      issues.push(`${where}: cộng hưởng không tồn tại "${String(bonus.id)}"`)
      return
    }
    const problems = checkInteger(bonus.count, `${where}.count`, 1)
    issues.push(...problems)
    if (problems.length === 0 && !synergyTierOf(synergy, bonus.count as number)) {
      issues.push(`${where}: count ${String(bonus.count)} chưa tới bậc đầu của "${synergy.id}"`)
    }
    return
  }
  if (bonus?.kind === 'formation') {
    if (typeof bonus.id !== 'string' || !(bonus.id in data.formations)) {
      issues.push(`${where}: trận pháp không tồn tại "${String(bonus.id)}"`)
    }
    return
  }
  if (bonus?.kind === 'partner') {
    if (typeof bonus.id !== 'string' || !Object.hasOwn(data.partnerSkills, bonus.id)) {
      issues.push(`${where}: kỹ năng đồng hành không tồn tại "${String(bonus.id)}"`)
    }
    if (typeof bonus.monsterId !== 'string') issues.push(`${where}.monsterId phải là chuỗi`)
    issues.push(...checkNumber(bonus.strength, `${where}.strength`, 0))
    return
  }
  issues.push(`${where}: kind phải là "synergy", "formation", "partner", "rule" hoặc "boon"`)
}

/**
 * battle.teamBonuses: mỗi phe một danh sách hợp lệ, không trùng (kind, id); quái hoang chỉ có luật
 * sideHooks.
 */
export function checkTeamBonuses(
  data: GameData,
  value: unknown,
  { hasTrainer }: { hasTrainer: boolean },
  issues: string[]
): void {
  const sides = asObject(value)
  if (!sides) {
    issues.push('battle.teamBonuses phải là object')
    return
  }
  for (const side of BATTLE_SIDES) {
    const where = `battle.teamBonuses.${side}`
    const list = sides[side]
    if (!Array.isArray(list)) {
      issues.push(`${where} phải là danh sách`)
      continue
    }
    // Quái hoang không có cộng hưởng / trận pháp; đội NPC có, không có kỹ năng đồng hành
    // (docs/rules/trainers.md).
    if (side === 'enemy' && !hasTrainer && list.some((entry) => asObject(entry)?.kind !== 'rule')) {
      issues.push(`${where}: quái hoang không có cộng hưởng`)
    }
    if (side === 'enemy' && list.some((entry) => asObject(entry)?.kind === 'partner')) {
      issues.push(`${where}: phe địch không có kỹ năng đồng hành`)
    }
    list.forEach((entry, i) =>
      checkTeamBonus(data, entry, { where: `${where}[${i}]`, side }, issues)
    )
    const keys = list.map(
      (entry) => `${String(asObject(entry)?.kind)}:${String(asObject(entry)?.id)}`
    )
    if (new Set(keys).size !== keys.length) issues.push(`${where} bị lặp`)
    const partners = list.filter((entry) => asObject(entry)?.kind === 'partner').length
    if (partners > 1) issues.push(`${where}: tối đa một kỹ năng đồng hành`)
  }
}
