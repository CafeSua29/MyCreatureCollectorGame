// Tìm quái người chơi sở hữu (đội hoặc kho) để sửa trong action ngoài trận.

import { hasPartyRoom } from '../registries'
import { ActionError } from '../shared'
import type { GameData, GameState, Monster } from '../model'

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

/**
 * Quái trong đội sắp đổi sang loài `speciesId` (thoái hóa, phản tổ): đội phải còn đủ ô cho loài mới
 * (quái lớn chiếm nhiều ô, docs/rules/monster-size.md), không thì partyFull. Quái trong kho không cần.
 */
export function assertPartyRoomAs(
  data: GameData,
  state: GameState,
  { monsterId, speciesId }: { monsterId: string; speciesId: string }
): void {
  const others = state.party.filter((m) => m.id !== monsterId)
  if (others.length === state.party.length) return
  if (!hasPartyRoom(data, others, { speciesId, baseSpeciesId: speciesId })) {
    throw new ActionError('partyFull', { partySize: data.config.partySize })
  }
}
