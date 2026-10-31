// Học skill: tự học khi còn ô, danh sách chờ học khi đủ ô, học lại ở thị trấn (tốn tiền).
// Skill học theo level lấy từ learnset của loài gốc (baseSpeciesId); skill ngoài learnset (sách kỹ
// năng) ghi ở extraSkillIds (skillBooks.ts).

import { skillCapacity } from './humanForm'
import { getBaseSpecies } from './validateMonster'
import { ActionError, levelCost, spendMoney, type Decimal } from '../shared'
import { locateOwned } from '../roster'
import { hasKeyItemFor } from '../inventory'
import type { BattleEvent, GameData, GameState, Inventory, Monster } from '../model'

/**
 * Đưa các skill mới cho quái: còn ô thì học ngay (sự kiện learnSkill); đủ ô thì thêm vào
 * pendingSkillIds (sự kiện canLearnSkill). Bỏ qua skill đã biết hoặc đã đang chờ.
 */
export function offerSkills(
  data: GameData,
  monster: Monster,
  skillIds: string[]
): { monster: Monster; events: BattleEvent[] } {
  const known = [...monster.skillIds]
  const pending = [...monster.pendingSkillIds]
  const events: BattleEvent[] = []
  for (const skillId of skillIds) {
    if (known.includes(skillId) || pending.includes(skillId)) continue
    if (known.length < skillCapacity(data, monster)) {
      known.push(skillId)
      events.push({ type: 'learnSkill', monsterId: monster.id, skillId })
    } else {
      pending.push(skillId)
      events.push({ type: 'canLearnSkill', monsterId: monster.id, skillId })
    }
  }
  return { monster: { ...monster, skillIds: known, pendingSkillIds: pending }, events }
}

/**
 * Skill quái có thể học lại: trong learnset loài gốc ở level ≤ level hiện tại, chưa biết; skill
 * ngoài learnset đã từng học (extraSkillIds, mọi level); túi có Tera Orb thì thêm skill
 * tera.relearnSkillIds (Tera Blast).
 */
export function relearnableSkills(
  data: GameData,
  monster: Monster,
  inventory?: Inventory
): string[] {
  const learnset = getBaseSpecies(data, monster)?.learnset ?? []
  const result: string[] = []
  for (const { level, skillId } of [...learnset].sort((a, b) => a.level - b.level)) {
    if (
      level <= monster.level &&
      !monster.skillIds.includes(skillId) &&
      !result.includes(skillId)
    ) {
      result.push(skillId)
    }
  }
  // Skill từ sách kỹ năng dạy lại được, cùng giá (docs/rules/skill-books.md).
  for (const skillId of monster.extraSkillIds) {
    if (!monster.skillIds.includes(skillId) && !result.includes(skillId)) result.push(skillId)
  }
  // Có Tera Orb: mọi quái học được Tera Blast (mục "Tera" ở transformation.md).
  if (inventory && hasKeyItemFor(data, inventory, 'tera')) {
    for (const skillId of data.config.transform.tera.relearnSkillIds) {
      if (!monster.skillIds.includes(skillId) && !result.includes(skillId)) result.push(skillId)
    }
  }
  return result
}

export function relearnCost(data: GameData, monster: Monster): Decimal {
  return levelCost(data.config.relearnCostPerLevel, monster.level)
}

// ---------- Action (chỉ ngoài trận) ----------

function requireNoBattle(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
}

/** Thêm skillId vào bộ skill, quên forgetSkillId nếu đã đủ ô. */
function withSkillLearned(
  data: GameData,
  monster: Monster,
  skillId: string,
  forgetSkillId: string | undefined
): string[] {
  const capacity = skillCapacity(data, monster)
  if (monster.skillIds.length < capacity) {
    if (forgetSkillId !== undefined) throw new ActionError('skillSlotFree')
    return [...monster.skillIds, skillId]
  }
  if (forgetSkillId === undefined) {
    throw new ActionError('mustForgetSkill', { maxSkills: capacity })
  }
  if (!monster.skillIds.includes(forgetSkillId)) {
    throw new ActionError('skillNotKnown', { monsterId: monster.id, skillId: forgetSkillId })
  }
  return monster.skillIds.map((id) => (id === forgetSkillId ? skillId : id))
}

export function learnPendingSkill(
  data: GameData,
  state: GameState,
  monsterId: string,
  skillId: string,
  forgetSkillId: string | undefined
): GameState {
  requireNoBattle(state)
  const { monster, replace } = locateOwned(state, monsterId)
  if (!monster.pendingSkillIds.includes(skillId))
    throw new ActionError('skillNotPending', { skillId })
  return replace({
    ...monster,
    skillIds: withSkillLearned(data, monster, skillId, forgetSkillId),
    pendingSkillIds: monster.pendingSkillIds.filter((id) => id !== skillId)
  })
}

export function skipPendingSkill(state: GameState, monsterId: string, skillId: string): GameState {
  requireNoBattle(state)
  const { monster, replace } = locateOwned(state, monsterId)
  if (!monster.pendingSkillIds.includes(skillId))
    throw new ActionError('skillNotPending', { skillId })
  return replace({
    ...monster,
    pendingSkillIds: monster.pendingSkillIds.filter((id) => id !== skillId)
  })
}

/** NPC học lại skill ở thị trấn: tốn tiền, học được mọi skill trong relearnableSkills. */
export function relearnSkill(
  data: GameData,
  state: GameState,
  monsterId: string,
  skillId: string,
  forgetSkillId: string | undefined
): GameState {
  requireNoBattle(state)
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const { monster, replace } = locateOwned(state, monsterId)
  if (!relearnableSkills(data, monster, state.inventory).includes(skillId)) {
    throw new ActionError('cannotRelearnSkill', { skillId })
  }
  const next = replace({
    ...monster,
    skillIds: withSkillLearned(data, monster, skillId, forgetSkillId),
    pendingSkillIds: monster.pendingSkillIds.filter((id) => id !== skillId)
  })
  return spendMoney(next, relearnCost(data, monster))
}
