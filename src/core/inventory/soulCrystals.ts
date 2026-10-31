// Hồn tinh trong túi (docs/rules/soul-levels.md): mỗi loại hồn tinh có `points` điểm, điểm dùng chung
// mọi chỉ số nên các hàm ở đây làm việc theo tổng điểm, không theo từng loại.

import { ActionError } from '../shared'
import type { GameData, Inventory, SoulCrystalItem } from '../model'
import { addItems, getItemCount, removeItems } from './inventory'

/** Mọi loại hồn tinh, điểm tăng dần. */
function soulCrystalItems(data: GameData): SoulCrystalItem[] {
  return Object.values(data.items)
    .filter((item): item is SoulCrystalItem => item.category === 'soulCrystal')
    .sort((a, b) => a.points - b.points)
}

/** Tổng điểm hồn tinh trong túi. */
export function soulCrystalPoints(data: GameData, inventory: Inventory): number {
  return soulCrystalItems(data).reduce(
    (sum, item) => sum + item.points * getItemCount(inventory, item.id),
    0
  )
}

/**
 * Thêm `points` điểm hồn tinh vào túi, viên to trước (kiểm tra dữ liệu bắt buộc có loại 1 điểm nên
 * luôn đủ chính xác).
 */
export function addSoulCrystalPoints(
  data: GameData,
  inventory: Inventory,
  points: number
): Inventory {
  let left = points
  let next = inventory
  for (const item of soulCrystalItems(data).reverse()) {
    const count = Math.floor(left / item.points)
    if (count === 0) continue
    next = addItems(next, item.id, count)
    left -= count * item.points
  }
  return next
}

/**
 * Trừ `points` điểm hồn tinh: dùng viên nhỏ trước (giữ viên to), phần lẻ còn thiếu thì đập một viên
 * to hơn và trả lại số dư bằng viên nhỏ. Thiếu điểm thì ném notEnoughSoulCrystals.
 */
export function spendSoulCrystalPoints(
  data: GameData,
  inventory: Inventory,
  points: number
): Inventory {
  const have = soulCrystalPoints(data, inventory)
  if (have < points) throw new ActionError('notEnoughSoulCrystals', { need: points, have })
  const items = soulCrystalItems(data)
  let left = points
  let next = inventory
  for (const item of items) {
    const count = Math.min(getItemCount(next, item.id), Math.floor(left / item.points))
    if (count === 0) continue
    next = removeItems(next, item.id, count)
    left -= count * item.points
  }
  if (left === 0) return next
  // Sau vòng trên, mỗi loại hoặc đã hết hoặc to hơn phần còn thiếu; tổng đủ nên còn ít nhất một viên.
  const broken = items.find((item) => getItemCount(next, item.id) > 0)
  if (!broken) throw new Error('spendSoulCrystalPoints: không còn viên nào dù tổng điểm đủ')
  next = removeItems(next, broken.id, 1)
  return addSoulCrystalPoints(data, next, broken.points - left)
}
