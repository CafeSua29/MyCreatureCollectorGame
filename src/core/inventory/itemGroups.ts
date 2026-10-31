// Nhóm vật phẩm (config.itemGroups; docs/rules/alchemy.md): nguyên liệu "món bất kỳ trong nhóm"
// (ví dụ yêu đan bất kỳ hệ) hoặc "N món cùng một loại trong nhóm" (yêu đan cùng hệ) cho công thức
// luyện đan / luyện khí và cường hóa cấp cao; trừ "món bất kỳ trong danh sách" dùng chung (Thức tỉnh
// đan theo hệ của quái). Hàm thuần.

import { ActionError } from '../shared'
import type { GameData, Inventory, RecipeInput } from '../model'
import { getItemCount, removeItems, requireItemCount } from './inventory'

/** Các món trong nhóm (nhóm lạ: rỗng; kiểm tra dữ liệu bắt id nhóm sai). */
const groupItemIds = (data: GameData, groupId: string): readonly string[] =>
  Object.hasOwn(data.config.itemGroups, groupId) ? data.config.itemGroups[groupId] : []

/** Tổng số trong túi của các món `itemIds` (kẹp ở số nguyên an toàn). */
export function anyOfItemCount(inventory: Inventory, itemIds: readonly string[]): number {
  const total = itemIds.reduce((sum, itemId) => sum + getItemCount(inventory, itemId), 0)
  return Math.min(Number.MAX_SAFE_INTEGER, total)
}

/** Chồng có trong túi của các món `itemIds`, nhiều nhất trước (hòa thì theo thứ tự danh sách). */
function stacksByCount(
  inventory: Inventory,
  itemIds: readonly string[]
): { itemId: string; count: number }[] {
  return itemIds
    .map((itemId, order) => ({ itemId, order, count: getItemCount(inventory, itemId) }))
    .filter((stack) => stack.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order)
}

/**
 * Bớt `count` món bất kỳ trong `itemIds`: lấy từ chồng nhiều nhất trước, hết chồng đó mới sang chồng
 * kế tiếp, để giữ lại các món hiếm. Không đủ thì null (nơi gọi ném lỗi của mình), túi giữ nguyên.
 */
export function removeAnyOf(
  inventory: Inventory,
  itemIds: readonly string[],
  count: number
): Inventory | null {
  requireItemCount(count)
  if (anyOfItemCount(inventory, itemIds) < count) return null
  let left = count
  for (const stack of stacksByCount(inventory, itemIds)) {
    if (left === 0) break
    const taken = Math.min(left, stack.count)
    inventory = removeItems(inventory, stack.itemId, taken)
    left -= taken
  }
  return inventory
}

/** Tổng số món của nhóm trong túi. */
export const groupItemCount = (data: GameData, inventory: Inventory, groupId: string): number =>
  anyOfItemCount(inventory, groupItemIds(data, groupId))

/** Bớt `count` món bất kỳ của nhóm (removeAnyOf); không đủ thì notEnoughGroupItem. */
export function removeGroupItems(
  data: GameData,
  inventory: Inventory,
  groupId: string,
  count: number
): Inventory {
  const next = removeAnyOf(inventory, groupItemIds(data, groupId), count)
  if (next) return next
  const have = groupItemCount(data, inventory, groupId)
  throw new ActionError('notEnoughGroupItem', { groupId, have, need: count })
}

/** Số lượng của chồng nhiều nhất trong nhóm (nguyên liệu "cùng một loại"). */
const largestGroupStack = (data: GameData, inventory: Inventory, groupId: string): number =>
  stacksByCount(inventory, groupItemIds(data, groupId))[0]?.count ?? 0

/**
 * Bớt `count` món **cùng một loại** trong nhóm: lấy hết từ chồng nhiều nhất (hòa theo thứ tự nhóm);
 * chồng đó không đủ thì notEnoughGroupItem (`have` = chồng nhiều nhất).
 */
function removeSameGroupItem(
  data: GameData,
  inventory: Inventory,
  groupId: string,
  count: number
): Inventory {
  requireItemCount(count)
  const largest = stacksByCount(inventory, groupItemIds(data, groupId))[0]
  if (!largest || largest.count < count) {
    throw new ActionError('notEnoughGroupItem', { groupId, have: largest?.count ?? 0, need: count })
  }
  return removeItems(inventory, largest.itemId, count)
}

/** Số lượng có trong túi cho một nguyên liệu công thức (món, nhóm, cùng một loại trong nhóm). */
export function recipeInputCount(data: GameData, inventory: Inventory, input: RecipeInput): number {
  if (!('groupId' in input)) return getItemCount(inventory, input.itemId)
  return input.sameItem
    ? largestGroupStack(data, inventory, input.groupId)
    : groupItemCount(data, inventory, input.groupId)
}

/** Bớt `count` của một nguyên liệu công thức (`sameItem`: mọi món lấy từ cùng một loại). */
export function removeRecipeInput(
  data: GameData,
  inventory: Inventory,
  input: RecipeInput,
  count: number
): Inventory {
  if (!('groupId' in input)) return removeItems(inventory, input.itemId, count)
  return input.sameItem
    ? removeSameGroupItem(data, inventory, input.groupId, count)
    : removeGroupItems(data, inventory, input.groupId, count)
}
