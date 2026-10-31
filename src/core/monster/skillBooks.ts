// Học skill từ sách kỹ năng (docs/rules/skill-books.md): quái học được skill ngoài learnset khi skill
// tương thích (isSkillBookCompatible ở inventory/skillBooks.ts); Bí kíp mất khi dùng, Chân kinh giữ. Skill học từ sách ghi vào extraSkillIds để NPC
// học lại skill dạy lại được.

import { ActionError, malformedAction } from '../shared'
import { getBookCount, isSkillBookCompatible, parseItemRef, removeBooks } from '../inventory'
import type { GameData, GameState, Monster } from '../model'
import { locateOwned } from '../roster'
import { offerSkills } from './skills'

/** Thêm skill vào danh sách skill ngoài learnset (không trùng). */
export function withExtraSkill(monster: Monster, skillId: string): Monster {
  if (monster.extraSkillIds.includes(skillId)) return monster
  return { ...monster, extraSkillIds: [...monster.extraSkillIds, skillId] }
}

/**
 * Dùng sách kỹ năng lên quái ta (ngoài trận, ở đâu cũng được): còn ô thì học ngay, đủ ô thì vào
 * skill chờ học. Đã biết / đang chờ hoặc không tương thích thì skillBookNoEffect, không mất sách.
 */
export function applySkillBook(
  data: GameData,
  state: GameState,
  monsterId: string,
  itemRef: unknown
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const ref = parseItemRef(data, itemRef)
  if (ref.storage !== 'book')
    throw malformedAction('định danh phải là sách kỹ năng (storage "book")')
  const have = getBookCount(state.inventory, ref)
  if (have < 1) throw new ActionError('notEnoughBooks', { ...ref, have, need: 1 })
  const { monster, replace } = locateOwned(state, monsterId)
  const { skillId } = ref
  if (monster.skillIds.includes(skillId) || monster.pendingSkillIds.includes(skillId)) {
    throw new ActionError('skillBookNoEffect', { monsterId, skillId, reason: 'known' })
  }
  if (!isSkillBookCompatible(data, monster, skillId)) {
    throw new ActionError('skillBookNoEffect', { monsterId, skillId, reason: 'incompatible' })
  }
  const learned = offerSkills(data, monster, [skillId]).monster
  const next = replace(withExtraSkill(learned, skillId))
  return ref.reusable ? next : { ...next, inventory: removeBooks(next.inventory, ref, 1) }
}
