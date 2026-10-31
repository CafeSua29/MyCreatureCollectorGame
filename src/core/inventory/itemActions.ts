// Action trên túi đồ không cần NPC: vứt vật phẩm (mục "Cửa hàng và vứt vật phẩm").

import { ActionError } from '../shared'
import type { GameData, GameState, ItemRef } from '../model'
import { requireItemCount } from './inventory'
import { parseItemRef, removeByRef } from './itemRefs'
import { canLeaveBag } from './itemRules'

/** Ném ActionError nếu item là vật phẩm chìa khóa (không bán, không vứt). */
export function assertCanLeaveBag(data: GameData, ref: ItemRef): void {
  if (ref.storage !== 'stack') return
  if (!canLeaveBag(data.items[ref.itemId].category)) {
    throw new ActionError('keyItemLocked', { itemId: ref.itemId })
  }
}

/** Vứt count món (mọi loại item, ngoài trận, ở đâu cũng được); không nhận gì. */
export function discardItem(
  data: GameData,
  state: GameState,
  itemRef: unknown,
  count: unknown
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const ref = parseItemRef(data, itemRef)
  assertCanLeaveBag(data, ref)
  requireItemCount(count)
  return { ...state, inventory: removeByRef(state.inventory, ref, count) }
}
