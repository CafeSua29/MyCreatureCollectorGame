// Học skill từ sách kỹ năng (docs/rules/skill-books.md): quái học được skill ngoài learnset khi skill
// tương thích (isSkillBookCompatible ở inventory/skillBooks.ts); Bí kíp mất khi dùng, Chân kinh giữ. Skill học từ sách ghi vào extraSkillIds để NPC
// học lại skill dạy lại được. Quái Bootleg dùng Bí kíp thường có thể ra sticker (docs/rules/bootleg.md).

import { ActionError, malformedAction } from '../shared'
import {
  addSticker,
  getBookCount,
  isSkillBookCompatible,
  parseItemRef,
  removeBooks
} from '../inventory'
import { hasBagRoom, rollSticker, rollStickerRarity, stickerInstanceId } from '../registries'
import type { GameData, GameState, Monster } from '../model'
import { locateOwned } from '../roster'
import { skillCapacity } from './humanForm'
import { offerSkills } from './skills'
import { applySticker } from './skillStickers'

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
  let current = state
  if (!ref.reusable && monster.bootlegElementId !== null) {
    const rolled = bootlegSticker(data, state, { monster, skillId })
    if (rolled.done) return rolled.state
    current = rolled.state
  }
  const learned = offerSkills(data, monster, [skillId]).monster
  const next = { ...replace(withExtraSkill(learned, skillId)), rng: current.rng }
  return ref.reusable ? next : { ...next, inventory: removeBooks(next.inventory, ref, 1) }
}

/**
 * Quái Bootleg dùng Bí kíp thường (docs/rules/bootleg.md): tung độ hiếm theo
 * `bootleg.stickerRarityChances`; ra sticker (túi còn chỗ) thì Bí kíp thành sticker: còn ô thì dán
 * luôn (học skill kèm thuộc tính), đủ ô thì sticker vào túi và skill vào chờ học như sách. Không ra
 * sticker thì `done` false, state chỉ đổi RNG (nơi gọi học như sách thường).
 */
function bootlegSticker(
  data: GameData,
  state: GameState,
  { monster, skillId }: { monster: Monster; skillId: string }
): { state: GameState; done: boolean } {
  if (!hasBagRoom(data, state)) return { state, done: false }
  const [rarity, afterRarity] = rollStickerRarity(
    data,
    state.rng,
    data.config.bootleg.stickerRarityChances
  )
  if (!rarity) return { state: { ...state, rng: afterRarity }, done: false }
  const [sticker, rng] = rollSticker(data, afterRarity, {
    id: stickerInstanceId(state.nextItemId),
    skillId,
    rarity
  })
  const book = { skillId, reusable: false }
  const withSticker: GameState = {
    ...state,
    rng,
    nextItemId: state.nextItemId + 1,
    inventory: addSticker(removeBooks(state.inventory, book, 1), sticker)
  }
  const hasSlot = monster.skillIds.length < skillCapacity(data, monster)
  if (hasSlot) {
    const applied = applySticker(data, withSticker, {
      monsterId: monster.id,
      stickerId: sticker.id
    })
    return { state: applied, done: true }
  }
  const { replace } = locateOwned(withSticker, monster.id)
  const learned = offerSkills(data, monster, [skillId]).monster
  return { state: replace(withExtraSkill(learned, skillId)), done: true }
}
