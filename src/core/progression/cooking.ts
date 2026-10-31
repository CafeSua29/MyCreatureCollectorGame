// Linh thực (docs/rules/cooking.md): ăn món ăn ngoài trận cho cả đội. Nấu dùng chung action craft
// (nơi luyện `cooking`, progression/alchemy.ts); hiệu ứng và đếm trận ở registries/mealEffects.ts.

import { ActionError } from '../shared'
import { getItemCount, removeItems } from '../inventory'
import { fulfillImprint } from '../monster'
import type { GameData, GameState } from '../model'

/**
 * Ăn một món ăn (action eatDish, ngoài trận, ở đâu cũng được): cả đội nhận hiệu ứng trong `battles`
 * trận kế; đang có món khác (hoặc chính món đó) thì thay, không chồng. Quái trong đội (không đi
 * thám hiểm) đang đòi đúng món này để dưỡng dục thì tính là đã cho ăn (docs/rules/imprinting.md).
 */
export function eatDish(data: GameData, state: GameState, itemId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const item = data.items[itemId]
  if (!item) throw new ActionError('unknownItem', { itemId })
  if (item.category !== 'dish') throw new ActionError('notDish', { itemId })
  const have = getItemCount(state.inventory, itemId)
  if (have < 1) throw new ActionError('notEnoughItem', { itemId, have, need: 1 })
  const party = state.party.map((monster) =>
    monster.assignment === null ? fulfillImprint(monster, { kind: 'feed', itemId }) : monster
  )
  return {
    ...state,
    party,
    inventory: removeItems(state.inventory, itemId, 1),
    cooking: { ...state.cooking, meal: { itemId, battlesLeft: item.battles } }
  }
}
