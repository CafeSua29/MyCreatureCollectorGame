// Thao tác túi đồ (mục "Thị trấn, di chuyển, vùng, vật phẩm"): đọc, thêm, bớt item gộp chồng,
// tinh thể trait và sách kỹ năng. Hàm thuần: luôn trả túi mới, không sửa túi cũ.

import { ActionError, malformedAction } from '../shared'
import type { BookStack, CrystalStack, Inventory } from '../model'

/** Định danh một chồng tinh thể: cùng trait, cùng cấp thì gộp chung. */
export type CrystalKey = Pick<CrystalStack, 'traitId' | 'level'>

/** Số lượng item trong action: số nguyên an toàn ≥ 1, sai thì malformedAction. */
export function requireItemCount(count: unknown): asserts count is number {
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
    throw malformedAction(`số lượng phải là số nguyên ≥ 1, nhận ${String(count)}`)
  }
}

/** Cộng có kẹp: số lượng là number, vượt MAX_SAFE_INTEGER thì phần thừa mất (gần như không xảy ra). */
const addClamped = (current: number, count: number): number =>
  Math.min(Number.MAX_SAFE_INTEGER, current + count)

/** Định danh một chồng sách: cùng skill, cùng loại (Bí kíp / Chân kinh) thì gộp chung. */
export type BookKey = Pick<BookStack, 'skillId' | 'reusable'>

const isSameBook = (stack: BookStack, key: BookKey): boolean =>
  stack.skillId === key.skillId && stack.reusable === key.reusable

const isSameCrystal = (stack: CrystalStack, key: CrystalKey): boolean =>
  stack.traitId === key.traitId && stack.level === key.level

/** Túi mới từ số lượng theo id (ví dụ đồ khởi đầu), chưa có tinh thể, sách và trang bị. */
export function createInventory(stacks: Readonly<Record<string, number>> = {}): Inventory {
  return { stacks: { ...stacks }, crystals: [], books: [], equipment: [], souls: [], spirits: [] }
}

/** Số lượng một item gộp chồng theo id (0 nếu không có). */
export function getItemCount(inventory: Inventory, itemId: string): number {
  return inventory.stacks[itemId] ?? 0
}

/** Thêm count item vào chồng theo id (túi hoặc kho có `stacks` như kho động phủ). */
export function addItems<T extends Pick<Inventory, 'stacks'>>(
  inventory: T,
  itemId: string,
  count: number
): T {
  requireItemCount(count)
  const total = addClamped(inventory.stacks[itemId] ?? 0, count)
  return { ...inventory, stacks: { ...inventory.stacks, [itemId]: total } }
}

/** Bớt count item khỏi chồng theo id, xóa chồng khi về 0. Không đủ thì ném ActionError. */
export function removeItems<T extends Pick<Inventory, 'stacks'>>(
  inventory: T,
  itemId: string,
  count: number
): T {
  requireItemCount(count)
  const current = inventory.stacks[itemId] ?? 0
  if (current < count) {
    throw new ActionError('notEnoughItem', { itemId, have: current, need: count })
  }
  const stacks = { ...inventory.stacks, [itemId]: current - count }
  if (stacks[itemId] === 0) delete stacks[itemId]
  return { ...inventory, stacks }
}

/** Số tinh thể của một trait ở một cấp (0 nếu không có). */
export function getCrystalCount(inventory: Inventory, key: CrystalKey): number {
  return inventory.crystals.find((stack) => isSameCrystal(stack, key))?.count ?? 0
}

/** Thêm count tinh thể; gộp vào chồng cùng trait + cấp nếu đã có. */
export function addCrystals(inventory: Inventory, key: CrystalKey, count: number): Inventory {
  requireItemCount(count)
  const exists = inventory.crystals.some((stack) => isSameCrystal(stack, key))
  const crystals = exists
    ? inventory.crystals.map((stack) =>
        isSameCrystal(stack, key) ? { ...stack, count: addClamped(stack.count, count) } : stack
      )
    : [...inventory.crystals, { traitId: key.traitId, level: key.level, count }]
  return { ...inventory, crystals }
}

/** Bớt count tinh thể, xóa chồng khi về 0. Không đủ thì ném ActionError. */
export function removeCrystals(inventory: Inventory, key: CrystalKey, count: number): Inventory {
  requireItemCount(count)
  const current = getCrystalCount(inventory, key)
  if (current < count) {
    throw new ActionError('notEnoughCrystals', { ...key, have: current, need: count })
  }
  const crystals = inventory.crystals
    .map((stack) => (isSameCrystal(stack, key) ? { ...stack, count: stack.count - count } : stack))
    .filter((stack) => stack.count > 0)
  return { ...inventory, crystals }
}

/** Số sách của một skill theo loại (0 nếu không có). */
export function getBookCount(inventory: Inventory, key: BookKey): number {
  return inventory.books.find((stack) => isSameBook(stack, key))?.count ?? 0
}

/** Thêm count sách; gộp vào chồng cùng skill + loại nếu đã có (túi hoặc kho động phủ). */
export function addBooks<T extends Pick<Inventory, 'books'>>(
  inventory: T,
  key: BookKey,
  count: number
): T {
  requireItemCount(count)
  const exists = inventory.books.some((stack) => isSameBook(stack, key))
  const books = exists
    ? inventory.books.map((stack) =>
        isSameBook(stack, key) ? { ...stack, count: addClamped(stack.count, count) } : stack
      )
    : [...inventory.books, { skillId: key.skillId, reusable: key.reusable, count }]
  return { ...inventory, books }
}

/** Bớt count sách, xóa chồng khi về 0. Không đủ thì ném ActionError. */
export function removeBooks(inventory: Inventory, key: BookKey, count: number): Inventory {
  requireItemCount(count)
  const current = getBookCount(inventory, key)
  if (current < count) {
    throw new ActionError('notEnoughBooks', { ...key, have: current, need: count })
  }
  const books = inventory.books
    .map((stack) => (isSameBook(stack, key) ? { ...stack, count: stack.count - count } : stack))
    .filter((stack) => stack.count > 0)
  return { ...inventory, books }
}
