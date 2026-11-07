// Dán / bóc sticker skill (docs/rules/skill-stickers.md): dán lên skill quái đã biết thì thay sticker
// cũ (về túi); dán skill quái chưa biết thì học như sách kỹ năng (tương thích, ô skill, quên skill).
// Sticker trên skill bị quên / quái bị mất thì về túi.

import { ActionError } from '../shared'
import { addSticker, isSkillBookCompatible, takeSticker } from '../inventory'
import { assertBagRoom, stickerIgnoresCompatibility } from '../registries'
import type { GameData, GameState, Monster } from '../model'
import { locateOwned } from '../roster'
import { withExtraSkill } from './skillBooks'
import { withSkillLearned } from './skills'
import { assertSlotsFit, returnForgottenStickers, withoutSticker } from './stickerSlots'

/**
 * Dán sticker từ túi lên quái (ngoài trận, ở đâu cũng được). Quái biết skill: thay sticker cũ (về
 * túi). Chưa biết: phải tương thích như sách kỹ năng (trừ thuộc tính Compatibility); còn ô thì học
 * ngay, đủ ô thì phải chọn `replaceSkillId` để quên (sticker trên skill đó về túi); skill ghi vào
 * skill ngoài learnset (học lại được ở NPC).
 */
export function applySticker(
  data: GameData,
  state: GameState,
  {
    monsterId,
    stickerId,
    replaceSkillId
  }: {
    monsterId: string
    stickerId: string
    replaceSkillId?: string
  }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const [sticker, bag] = takeSticker(state.inventory, stickerId)
  const { monster, replace } = locateOwned(state, monsterId)
  const { skillId } = sticker
  const withSticker: Monster = {
    ...monster,
    skillStickers: { ...monster.skillStickers, [skillId]: sticker }
  }
  if (monster.skillIds.includes(skillId)) {
    const old = Object.hasOwn(monster.skillStickers, skillId)
      ? monster.skillStickers[skillId]
      : undefined
    assertSlotsFit(data, withSticker, skillId)
    return { ...replace(withSticker), inventory: old ? addSticker(bag, old) : bag }
  }
  if (
    !isSkillBookCompatible(data, monster, skillId) &&
    !stickerIgnoresCompatibility(data, sticker)
  ) {
    throw new ActionError('stickerIncompatible', { monsterId, skillId })
  }
  const learned = withExtraSkill(
    {
      ...withSticker,
      skillIds: withSkillLearned(data, withSticker, skillId, replaceSkillId),
      pendingSkillIds: monster.pendingSkillIds.filter((id) => id !== skillId)
    },
    skillId
  )
  const returned = returnForgottenStickers(data, { ...state, inventory: bag }, learned)
  return { ...replace(returned.monster), inventory: returned.inventory }
}

/** Bóc sticker khỏi skill của quái về túi (ngoài trận); quái vẫn giữ skill, không còn thuộc tính. */
export function peelSticker(
  data: GameData,
  state: GameState,
  { monsterId, skillId }: { monsterId: string; skillId: string }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const { monster, replace } = locateOwned(state, monsterId)
  const sticker = Object.hasOwn(monster.skillStickers, skillId)
    ? monster.skillStickers[skillId]
    : undefined
  if (!sticker) throw new ActionError('noSticker', { monsterId, skillId })
  assertBagRoom(data, state)
  const peeled = withoutSticker(monster, skillId)
  assertSlotsFit(data, peeled, skillId)
  return { ...replace(peeled), inventory: addSticker(state.inventory, sticker) }
}
