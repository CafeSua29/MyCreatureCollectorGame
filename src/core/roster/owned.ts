// Tìm quái người chơi sở hữu (đội hoặc kho) để sửa trong action ngoài trận.

import { ActionError } from '../shared'
import type { GameState, Monster } from '../model'

/** Trả về quái và hàm thay quái đó bằng bản mới trong state (không sửa state cũ). */
export function locateOwned(
  state: GameState,
  monsterId: string
): { monster: Monster; replace: (updated: Monster) => GameState } {
  const replaceIn = (list: Monster[], updated: Monster): Monster[] =>
    list.map((m) => (m.id === monsterId ? updated : m))
  const inParty = state.party.find((m) => m.id === monsterId)
  if (inParty) {
    return {
      monster: inParty,
      replace: (updated) => ({ ...state, party: replaceIn(state.party, updated) })
    }
  }
  const inStorage = state.storage.find((m) => m.id === monsterId)
  if (inStorage) {
    return {
      monster: inStorage,
      replace: (updated) => ({ ...state, storage: replaceIn(state.storage, updated) })
    }
  }
  throw new ActionError('monsterNotOwned', { monsterId })
}
