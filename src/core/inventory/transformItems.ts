// Vật phẩm của biến hình trong trận (mục "Biến hình trong trận" ở transformation.md): vật phẩm chìa
// khóa (nhận ở tầng mốc), Mảnh Tera theo hệ, đá Mega theo loài.

import type {
  BattleEvent,
  GameData,
  Inventory,
  MegaStoneItem,
  TeraShardItem,
  TransformKind
} from '../model'
import { addItems, getItemCount } from './inventory'

/** Túi có vật phẩm (chìa khóa) này không. */
export const hasItem = (inventory: Inventory, itemId: string): boolean =>
  getItemCount(inventory, itemId) > 0

/** Túi đủ vật phẩm chìa khóa cho loại biến hình (loại không cần vật phẩm thì luôn đủ). */
export function hasKeyItemFor(data: GameData, inventory: Inventory, kind: TransformKind): boolean {
  const keyItem = data.config.transform.keyItems[kind]
  return keyItem === undefined || hasItem(inventory, keyItem)
}

/**
 * Nhận mọi vật phẩm chìa khóa của các đạo quán đã thắng (tầng trong `clearedGymFloors`, theo
 * config.trainers.gym.keyItemFloors) mà túi chưa có (lần đầu thắng quán chủ; save khi load; docs/rules/
 * trainers.md). Trả về túi mới và log keyItemReceived theo thứ tự tầng.
 */
export function grantKeyItems(
  data: GameData,
  inventory: Inventory,
  clearedGymFloors: readonly number[]
): { inventory: Inventory; events: BattleEvent[] } {
  const due = Object.entries(data.config.trainers.gym.keyItemFloors)
    .filter(([itemId, floor]) => clearedGymFloors.includes(floor) && !hasItem(inventory, itemId))
    .sort((a, b) => a[1] - b[1])
  let next = inventory
  const events: BattleEvent[] = []
  for (const [itemId] of due) {
    next = addItems(next, itemId, 1)
    events.push({ type: 'keyItemReceived', itemId })
  }
  return { inventory: next, events }
}

/** Mảnh Tera theo hệ đích (id hệ hoặc STELLAR), tính một lần cho mỗi bộ dữ liệu. */
const shardCache = new WeakMap<GameData['items'], Map<string, TeraShardItem>>()

export function teraShardFor(data: GameData, elementId: string): TeraShardItem | undefined {
  let index = shardCache.get(data.items)
  if (!index) {
    index = new Map()
    for (const item of Object.values(data.items)) {
      if (item.category === 'teraShard') index.set(item.elementId, item)
    }
    shardCache.set(data.items, index)
  }
  return index.get(elementId)
}

/** Đá Mega của mọi dạng Mega của loài gốc `speciesId` (đá rơi từ boss), theo thứ tự dữ liệu. */
export function megaStonesOf(data: GameData, speciesId: string): MegaStoneItem[] {
  return Object.values(data.items).filter(
    (item): item is MegaStoneItem =>
      item.category === 'megaStone' && speciesFormOf(data, item.formId) === speciesId
  )
}

/** Loài gốc của một dạng (formOf), hoặc undefined. */
function speciesFormOf(data: GameData, formId: string): string | undefined {
  const form = data.species[formId]
  return form?.kind === 'normal' ? form.formOf : undefined
}
