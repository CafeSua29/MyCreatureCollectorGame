// Tìm món trang bị của người chơi theo id: trong túi hoặc đang lắp trên quái (đội, kho). Dùng chung
// cho Thợ rèn (forgeActions.ts) và Khí Linh Các (spiritActions.ts).

import { ActionError } from '../shared'
import { findWearer } from '../inventory'
import type { EquipmentInstance, GameState, Monster } from '../model'

/** Món trang bị tìm theo id và hàm thay nó bằng bản mới trong state. */
export interface LocatedEquipment {
  instance: EquipmentInstance
  replace: (state: GameState, updated: EquipmentInstance) => GameState
}

/** Tìm món trong túi hoặc trên quái của người chơi (đội, kho); không có thì equipmentNotFound. */
export function locateEquipment(state: GameState, instanceId: string): LocatedEquipment {
  const inBag = state.inventory.equipment.find((entry) => entry.id === instanceId)
  if (inBag) {
    return {
      instance: inBag,
      replace: (s, updated) => ({
        ...s,
        inventory: {
          ...s.inventory,
          equipment: s.inventory.equipment.map((entry) =>
            entry.id === instanceId ? updated : entry
          )
        }
      })
    }
  }
  const worn = findWearer(state, instanceId)
  if (!worn) throw new ActionError('equipmentNotFound', { instanceId })
  const swap = (monster: Monster, updated: EquipmentInstance): Monster => ({
    ...monster,
    equipment: monster.equipment.map((entry) =>
      entry.storage === 'instance' && entry.instance.id === instanceId
        ? { storage: 'instance', instance: updated }
        : entry
    )
  })
  const swapIn = (list: Monster[], updated: EquipmentInstance): Monster[] =>
    list.map((monster) => (monster.id === worn.monster.id ? swap(monster, updated) : monster))
  return {
    instance: worn.instance,
    replace: (s, updated) => ({
      ...s,
      party: swapIn(s.party, updated),
      storage: swapIn(s.storage, updated)
    })
  }
}
