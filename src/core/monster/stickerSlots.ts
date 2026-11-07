// Sticker trên quái khi skill thay đổi (docs/rules/skill-stickers.md): bỏ sticker, sticker trên skill
// đã quên về túi, giữ số skill không vượt số ô khi mất ô Extra Slots.

import { ActionError } from '../shared'
import { addSticker } from '../inventory'
import { assertBagRoom } from '../registries'
import type { GameData, GameState, Inventory, Monster, StickerInstance } from '../model'
import { skillCapacity } from './humanForm'

/** Quái bỏ sticker trên `skillId` (không có thì giữ nguyên). */
export function withoutSticker(monster: Monster, skillId: string): Monster {
  if (!Object.hasOwn(monster.skillStickers, skillId)) return monster
  const { [skillId]: _removed, ...rest } = monster.skillStickers
  return { ...monster, skillStickers: rest }
}

/** Ném stickerSlotInUse nếu quái giữ nhiều skill hơn số ô (vừa mất ô Extra Slots). */
export function assertSlotsFit(data: GameData, monster: Monster, skillId: string): void {
  if (monster.skillIds.length > skillCapacity(data, monster)) {
    throw new ActionError('stickerSlotInUse', { monsterId: monster.id, skillId })
  }
}

/**
 * Tách sticker trên các skill quái không còn biết (vừa quên): quái không còn sticker đó, danh sách
 * sticker để trả về túi.
 */
export function detachOrphanStickers(monster: Monster): {
  monster: Monster
  stickers: StickerInstance[]
} {
  const stickers: StickerInstance[] = []
  let result = monster
  for (const [skillId, sticker] of Object.entries(monster.skillStickers)) {
    if (monster.skillIds.includes(skillId)) continue
    stickers.push(sticker)
    result = withoutSticker(result, skillId)
  }
  return { monster: result, stickers }
}

/**
 * Sau khi quái quên skill (học skill mới thay skill cũ): sticker trên skill đã quên về túi. Túi đầy
 * thì bagFull; mất ô Extra Slots mà quái còn đủ skill thì stickerSlotInUse (state giữ nguyên).
 */
export function returnForgottenStickers(
  data: GameData,
  state: Pick<GameState, 'inventory' | 'capacity' | 'tamer' | 'ascension'>,
  monster: Monster
): { monster: Monster; inventory: Inventory } {
  const detached = detachOrphanStickers(monster)
  let inventory = state.inventory
  for (const sticker of detached.stickers) {
    assertBagRoom(data, { ...state, inventory })
    assertSlotsFit(data, detached.monster, sticker.skillId)
    inventory = addSticker(inventory, sticker)
  }
  return { monster: detached.monster, inventory }
}
