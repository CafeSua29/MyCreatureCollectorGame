// NPC đổi hệ Tera ở thị trấn (mục "Tera" ở transformation.md): tốn Mảnh Tera của hệ đích.

import { ActionError, malformedAction } from '../shared'
import { isTeraElement } from '../gameData'
import { removeItems, teraShardFor } from '../inventory'
import type { GameData, GameState } from '../model'
import { locateOwned } from './owned'

/** Đổi hệ Tera của quái (đội hoặc kho) sang `elementId` (id hệ hoặc Stellar). */
export function changeTeraElement(
  data: GameData,
  state: GameState,
  monsterId: string,
  elementId: string
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  if (!isTeraElement(data, elementId)) throw malformedAction(`hệ Tera không hợp lệ: ${elementId}`)
  const { monster, replace } = locateOwned(state, monsterId)
  // Hệ Tera cố định theo loài (Ogerpon, Terapagos) như Pokémon: không đổi được.
  const species = data.species[monster.speciesId]
  if (species?.kind === 'normal' && species.teraElementId !== undefined) {
    throw new ActionError('teraElementFixed', { speciesId: species.id })
  }
  if (monster.teraElementId === elementId) {
    throw new ActionError('teraElementUnchanged', { elementId })
  }
  const shard = teraShardFor(data, elementId)
  // Dữ liệu bắt buộc mỗi hệ có một Mảnh Tera (kiểm tra lúc khởi động).
  if (!shard) throw malformedAction(`không có Mảnh Tera cho hệ ${elementId}`)
  const inventory = removeItems(state.inventory, shard.id, data.config.transform.tera.changeCost)
  return { ...replace({ ...monster, teraElementId: elementId }), inventory }
}
