// NPC kho đồ ở thị trấn (docs/rules/capacity.md): mở rộng kho quái / túi trang bị bằng tiền.

import { capacityExpandCost } from '../registries'
import { ActionError, malformedAction, spendMoney } from '../shared'
import {
  CAPACITY_KINDS,
  type CapacityKind,
  type CapacityState,
  type GameData,
  type GameState
} from '../model'

// Xuất lại cho bên ngoài core (UI, script mô phỏng): registries không xuất qua '@core'.
export { capacityExpandCost, capacityOf, capacityView, type CapacityView } from '../registries'

/** Chưa mở rộng lần nào (game mới, test). */
export const newCapacityState = (): CapacityState => ({ storage: 0, bag: 0 })

/** Mở rộng một loại sức chứa thêm perExpansion chỗ, giá costBase × k² (k = lần mở rộng thứ mấy). */
export function expandCapacity(data: GameData, state: GameState, kind: CapacityKind): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  if (!CAPACITY_KINDS.includes(kind)) throw malformedAction('loại sức chứa không hợp lệ')
  const expansions = state.capacity[kind] + 1
  if (!Number.isSafeInteger(expansions)) throw malformedAction('số lần mở rộng vượt giới hạn')
  const paid = spendMoney(state, capacityExpandCost(data, state, kind))
  return { ...paid, capacity: { ...state.capacity, [kind]: expansions } }
}
