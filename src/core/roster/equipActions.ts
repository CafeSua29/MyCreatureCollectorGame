// Lắp / tháo trang bị và đồ cầm (mục "Trang bị và đồ cầm" ở equipment.md): ngoài trận, ở đâu
// cũng được, miễn phí. Ô tự do, trùng món được; số ô chung cho mọi quái của người chơi
// (equipmentSlotCount).

import { assertBagRoom } from '../registries'
import { ActionError, malformedAction } from '../shared'
import {
  assertCanWear,
  canWearEquipment,
  equipmentSlotCount,
  isEquippable,
  itemStorage,
  parseItemRef,
  removeItems,
  returnEquippedItem,
  takeEquipment
} from '../inventory'
import type { EquippedItem, GameData, GameState, Inventory, ItemRef, Monster } from '../model'
import { locateOwned } from './owned'

/** Id định nghĩa chung của tinh thể / sách (báo lỗi notEquippable khi lắp chúng). */
const sharedItemId = (data: GameData, category: 'traitCrystal' | 'skillBook'): string =>
  Object.values(data.items).find((item) => item.category === category)?.id ?? ''

/** Lấy món ra khỏi túi để lắp lên quái; ném lỗi nếu không lắp được. */
function takeForEquip(
  data: GameData,
  inventory: Inventory,
  ref: ItemRef,
  monster: Monster
): [EquippedItem, Inventory] {
  if (ref.storage === 'instance') {
    const [instance, rest] = takeEquipment(inventory, ref.instanceId)
    assertCanWear(data, monster, instance)
    return [{ storage: 'instance', instance }, rest]
  }
  if (ref.storage === 'crystal') {
    throw new ActionError('notEquippable', { itemId: sharedItemId(data, 'traitCrystal') })
  }
  if (ref.storage === 'book') {
    throw new ActionError('notEquippable', { itemId: sharedItemId(data, 'skillBook') })
  }
  const { category } = data.items[ref.itemId]
  if (!isEquippable(category) || itemStorage(category) !== 'stack') {
    throw new ActionError('notEquippable', { itemId: ref.itemId })
  }
  return [{ storage: 'stack', itemId: ref.itemId }, removeItems(inventory, ref.itemId, 1)]
}

/** Lắp một món trong túi lên quái (đội hoặc kho) vào ô trống tiếp theo. */
export function equipItem(
  data: GameData,
  state: GameState,
  monsterId: string,
  itemRef: unknown
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const ref = parseItemRef(data, itemRef)
  const { monster, replace } = locateOwned(state, monsterId)
  const slots = equipmentSlotCount(data, state)
  if (monster.equipment.length >= slots) {
    throw new ActionError('equipmentSlotsFull', { monsterId, slots })
  }
  const [equipped, inventory] = takeForEquip(data, state.inventory, ref, monster)
  return { ...replace({ ...monster, equipment: [...monster.equipment, equipped] }), inventory }
}

/** Tháo món ở ô `slotIndex` (0 = ô đầu) của quái về túi. */
export function unequipItem(
  data: GameData,
  state: GameState,
  monsterId: string,
  slotIndex: unknown
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const { monster, replace } = locateOwned(state, monsterId)
  if (
    typeof slotIndex !== 'number' ||
    !Number.isSafeInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= monster.equipment.length
  ) {
    throw malformedAction(`ô ${String(slotIndex)} không có món đang lắp`)
  }
  const entry = monster.equipment[slotIndex]
  // Món trang bị cần chỗ trong túi; đồ gộp chồng thì không (docs/rules/capacity.md).
  if (entry.storage === 'instance') assertBagRoom(data, state)
  const equipment = monster.equipment.filter((_, i) => i !== slotIndex)
  return {
    ...replace({ ...monster, equipment }),
    inventory: returnEquippedItem(state.inventory, entry)
  }
}

/** Một món bị tự tháo vì quái không còn đủ điều kiện lắp. */
export interface UnequippedItem {
  monsterId: string
  instanceId: string
  itemId: string
}

/**
 * Tháo về túi mọi món có race bắt buộc (unique, hồn khí) mà quái không còn đủ điều kiện lắp (chỉ
 * xảy ra khi dữ liệu game đổi giữa các phiên bản). Gọi khi load save; trả danh sách món đã tháo để UI báo.
 */
export function unequipIneligible(
  data: GameData,
  state: GameState
): { state: GameState; removed: UnequippedItem[] } {
  const removed: UnequippedItem[] = []
  let inventory = state.inventory
  const strip = (monster: Monster): Monster => {
    const kept = monster.equipment.filter((entry) => {
      if (entry.storage !== 'instance' || canWearEquipment(data, monster, entry.instance)) {
        return true
      }
      const { id: instanceId, baseItemId: itemId } = entry.instance
      removed.push({ monsterId: monster.id, instanceId, itemId })
      inventory = returnEquippedItem(inventory, entry)
      return false
    })
    return kept.length === monster.equipment.length ? monster : { ...monster, equipment: kept }
  }
  const party = state.party.map(strip)
  const storage = state.storage.map(strip)
  if (removed.length === 0) return { state, removed }
  return { state: { ...state, party, storage, inventory }, removed }
}
