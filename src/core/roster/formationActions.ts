// Trận pháp ngoài trận (docs/rules/team.md): học từ trận đồ, chọn trận pháp đang dùng; cộng hưởng
// / trận pháp có tác dụng của đội hiện tại (UI màn đội).

import { ActionError } from '../shared'
import { removeItems } from '../inventory'
import { activeTeamBonuses } from '../registries'
import type { GameData, GameState, TeamBonus } from '../model'

/** Tiêu một trận đồ trong túi để học trận pháp của nó (ngoài trận, ở đâu cũng được). */
export function learnFormation(data: GameData, state: GameState, itemId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const item = data.items[itemId]
  if (!item) throw new ActionError('unknownItem', { itemId })
  if (item.category !== 'formationScroll') throw new ActionError('notFormationScroll', { itemId })
  const { formationId } = item
  if (state.formations.known.includes(formationId)) {
    throw new ActionError('formationAlreadyKnown', { formationId })
  }
  return {
    ...state,
    inventory: removeItems(state.inventory, itemId, 1),
    formations: { ...state.formations, known: [...state.formations.known, formationId] }
  }
}

/** Chọn trận pháp đã học làm trận pháp đang dùng (null = bỏ); ngoài trận, miễn phí. */
export function setFormation(state: GameState, formationId: string | null): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (formationId !== null && !state.formations.known.includes(formationId)) {
    throw new ActionError('formationNotKnown', { formationId })
  }
  if (state.formations.active === formationId) {
    throw new ActionError('formationUnchanged', { formationId })
  }
  return { ...state, formations: { ...state.formations, active: formationId } }
}

/**
 * Cộng hưởng (đã tới bậc) và trận pháp đang dùng (đủ yêu cầu) của đội hiện tại: đúng danh sách phe
 * người chơi nhận khi vào trận.
 */
export function partyTeamBonuses(data: GameData, state: GameState): TeamBonus[] {
  return activeTeamBonuses(data, state.party, state.formations.active)
}
