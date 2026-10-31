// Mồi dụ (docs/rules/recruit.md): dùng ngoài trận, + % thu phục trong N trận kế. Điểm duy nhất để
// hỏi "mồi đang dùng cho quái này bao nhiêu %" (baitRecruitPercent) và đếm trận (tickBait).

import { ActionError } from '../shared'
import { getItemCount, removeItems } from '../inventory'
import { isFavoriteItem } from '../registries'
import type { ActiveBait, BaitItem, GameData, GameState, Monster } from '../model'

/** Vật phẩm mồi của mồi đang dùng (null nếu không có mồi / id không còn là mồi). */
function baitItemOf(data: GameData, bait: ActiveBait | null): BaitItem | null {
  if (!bait) return null
  const item = data.items[bait.itemId]
  return item?.category === 'bait' ? item : null
}

/** % thu phục mồi đang dùng cho quái này: khẩu vị đúng thì × baitFavoriteMultiplier; 0 nếu không có mồi. */
export function baitRecruitPercent(
  data: GameData,
  bait: ActiveBait | null,
  monster: Pick<Monster, 'raceId' | 'elementIds'>
): number {
  const item = baitItemOf(data, bait)
  if (!item) return 0
  const favorite = isFavoriteItem(data, item, monster)
  return item.recruitPercent * (favorite ? data.config.recruit.baitFavoriteMultiplier : 1)
}

/** Một trận có thể thu phục vừa kết thúc: mồi bớt một trận, hết thì mất. */
export function tickBait(bait: ActiveBait | null): ActiveBait | null {
  if (!bait) return null
  return bait.battlesLeft > 1 ? { ...bait, battlesLeft: bait.battlesLeft - 1 } : null
}

/** Dùng một mồi dụ ngoài trận (action useBait). Đang có mồi còn tác dụng thì không dùng chồng. */
export function applyBait(data: GameData, state: GameState, itemId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const item = data.items[itemId]
  if (!item) throw new ActionError('unknownItem', { itemId })
  if (item.category !== 'bait') throw new ActionError('notBait', { itemId })
  const active = state.recruit.bait
  if (active) {
    throw new ActionError('baitActive', { itemId: active.itemId, battlesLeft: active.battlesLeft })
  }
  const have = getItemCount(state.inventory, itemId)
  if (have < 1) throw new ActionError('notEnoughItem', { itemId, have, need: 1 })
  return {
    ...state,
    inventory: removeItems(state.inventory, itemId, 1),
    recruit: { ...state.recruit, bait: { itemId, battlesLeft: item.battles } }
  }
}
