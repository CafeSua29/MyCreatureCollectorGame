// Kiểm tra phần ngự thú sư trong save (docs/rules/tamer.md): GameState.tamer và
// BattleState.tamers. Gọi từ validateGameState.

import { validateRanks } from '../monster'
import type { GameData } from '../model'
import { asObject, checkBig, checkInteger } from '../shared'

/**
 * GameState.tamer: cảnh giới nguyên ≥ 0, EXP Decimal ≥ 0, ngày kết bản mệnh / đạo thương null hoặc
 * nguyên ≥ 0, cấp thiên phú ngự thú sư (nút tồn tại, nguyên ≥ 1, không quá maxRank; không xét điểm).
 */
export function validateTamer(data: GameData, value: unknown): string[] {
  const tamer = asObject(value)
  if (!tamer) {
    return [
      'tamer phải là object { realm, exp, bondDay, woundUntilDay, talentRanks, bonusTalentPoints }'
    ]
  }
  const issues = [
    ...checkInteger(tamer.realm, 'tamer.realm', 0),
    ...checkBig(tamer.exp, 'tamer.exp', 0),
    ...validateRanks(data.tamerTalents, tamer.talentRanks, 'tamer.talentRanks'),
    ...checkInteger(tamer.bonusTalentPoints, 'tamer.bonusTalentPoints', 0)
  ]
  for (const key of ['bondDay', 'woundUntilDay'] as const) {
    if (tamer[key] !== null) issues.push(...checkInteger(tamer[key], `tamer.${key}`, 0))
  }
  return issues
}

/**
 * Bản mệnh thú (docs/rules/tamer.md): tối đa một quái sở hữu (đội, kho) là bản mệnh; quái trong
 * trứng, quái hoang, quái NPC không là bản mệnh; có bản mệnh thì đã có ngày kết.
 */
export function validateBondState(state: Record<string, unknown>): string[] {
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
  const flagged = (monsters: unknown[]): string[] =>
    monsters.flatMap((m) => {
      const monster = asObject(m)
      return monster?.bond === true ? [String(monster.id)] : []
    })
  const owned = flagged([...list(state.party), ...list(state.storage)])
  const issues: string[] = []
  if (owned.length > 1) issues.push(`chỉ được một bản mệnh thú, đang có ${owned.join(', ')}`)
  const eggs = flagged(list(state.eggs).map((egg) => asObject(egg)?.monster))
  const battle = asObject(state.battle)
  const others = [...eggs, ...flagged(list(battle?.enemies))]
  if (others.length > 0)
    issues.push(`quái trong trứng / quái địch không là bản mệnh: ${others.join(', ')}`)
  if (owned.length > 0 && asObject(state.tamer)?.bondDay === null) {
    issues.push('tamer.bondDay: có bản mệnh thú thì phải có ngày kết')
  }
  return issues
}

/** Bảng số theo id kỹ năng ngự thú sư: id tồn tại, số nguyên ≥ 1. */
function checkSkillCounts(data: GameData, value: unknown, path: string, issues: string[]): void {
  const counts = asObject(value)
  if (!counts) {
    issues.push(`${path} phải là object id kỹ năng → số`)
    return
  }
  for (const [skillId, count] of Object.entries(counts)) {
    if (!Object.hasOwn(data.tamerSkills, skillId)) {
      issues.push(`${path}: kỹ năng ngự thú sư không tồn tại "${skillId}"`)
    }
    issues.push(...checkInteger(count, `${path}.${skillId}`, 1))
  }
}

/** BattleState.tamers: mỗi phe null hoặc { realm, mana, cooldowns, uses, skillIds }. */
export function checkBattleTamers(data: GameData, value: unknown, issues: string[]): void {
  const tamers = asObject(value)
  if (!tamers) {
    issues.push('battle.tamers phải là object { player, enemy }')
    return
  }
  for (const side of ['player', 'enemy'] as const) {
    const path = `battle.tamers.${side}`
    if (tamers[side] === null) continue
    const tamer = asObject(tamers[side])
    if (!tamer) {
      issues.push(`${path} phải là null hoặc ngự thú sư trong trận`)
      continue
    }
    issues.push(...checkInteger(tamer.realm, `${path}.realm`, 0))
    issues.push(...checkInteger(tamer.mana, `${path}.mana`, 0))
    checkSkillCounts(data, tamer.cooldowns, `${path}.cooldowns`, issues)
    checkSkillCounts(data, tamer.uses, `${path}.uses`, issues)
    const skillIds = tamer.skillIds
    if (skillIds === null) continue
    if (
      !Array.isArray(skillIds) ||
      skillIds.some((id) => typeof id !== 'string' || !Object.hasOwn(data.tamerSkills, id))
    ) {
      issues.push(`${path}.skillIds phải là null hoặc danh sách id kỹ năng ngự thú sư`)
    }
  }
}
