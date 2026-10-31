// Định danh item (ItemRef, mục "Cửa hàng và vứt vật phẩm"): kiểm tra một định danh nhận từ UI
// hoặc save, và đọc / thêm / bớt số lượng trong túi theo định danh. Kiểm tra định danh nằm ở một
// chỗ (findItemRefProblem) để action và kiểm tra save báo cùng một luật.

import { ActionError, asObject, assertNever, malformedAction } from '../shared'
import {
  hasCrystal,
  type GameData,
  type Inventory,
  type ItemRef,
  type ShopEntry,
  type StackableItemRef
} from '../model'
import {
  addBooks,
  addCrystals,
  addItems,
  getBookCount,
  getCrystalCount,
  getItemCount,
  removeBooks,
  removeCrystals,
  removeItems
} from './inventory'
import { itemStorage } from './itemRules'
import { isBookableSkill } from './skillBooks'
import { takeEquipment } from './equipment'

/** Lỗi của một định danh item: sai dạng, hoặc trỏ tới item / trait / skill không tồn tại. */
export type ItemRefProblem =
  | { code: 'malformed'; detail: string }
  | { code: 'unknownItem'; itemId: string }
  | { code: 'unknownTrait'; traitId: string }
  | { code: 'unknownSkill'; skillId: string }

function findStackRefProblem(data: GameData, itemId: unknown): ItemRefProblem | null {
  if (typeof itemId !== 'string') return { code: 'malformed', detail: 'itemId phải là chuỗi' }
  const item = Object.hasOwn(data.items, itemId) ? data.items[itemId] : undefined
  if (!item) return { code: 'unknownItem', itemId }
  if (itemStorage(item.category) !== 'stack') {
    return { code: 'malformed', detail: `vật phẩm "${itemId}" không gộp chồng theo id` }
  }
  return null
}

function findCrystalRefProblem(
  data: GameData,
  traitId: unknown,
  level: unknown
): ItemRefProblem | null {
  if (typeof traitId !== 'string') return { code: 'malformed', detail: 'traitId phải là chuỗi' }
  if (!Number.isSafeInteger(level) || (level as number) < 1) {
    return {
      code: 'malformed',
      detail: `cấp tinh thể phải là số nguyên ≥ 1, nhận ${String(level)}`
    }
  }
  const trait = Object.hasOwn(data.traits, traitId) ? data.traits[traitId] : undefined
  if (!trait) return { code: 'unknownTrait', traitId }
  if (!hasCrystal(trait.kind)) {
    return { code: 'malformed', detail: `trait loại "${trait.kind}" không có tinh thể` }
  }
  return null
}

function findBookRefProblem(
  data: GameData,
  skillId: unknown,
  reusable: unknown
): ItemRefProblem | null {
  if (typeof skillId !== 'string') return { code: 'malformed', detail: 'skillId phải là chuỗi' }
  if (typeof reusable !== 'boolean') {
    return { code: 'malformed', detail: 'reusable phải là true / false' }
  }
  const skill = Object.hasOwn(data.skills, skillId) ? data.skills[skillId] : undefined
  if (!skill) return { code: 'unknownSkill', skillId }
  if (!isBookableSkill(data, skill)) {
    return { code: 'malformed', detail: `skill "${skillId}" không có sách kỹ năng` }
  }
  return null
}

/** Lỗi của định danh item (null nếu hợp lệ). */
export function findItemRefProblem(data: GameData, value: unknown): ItemRefProblem | null {
  const ref = asObject(value)
  if (ref?.storage === 'stack') return findStackRefProblem(data, ref.itemId)
  if (ref?.storage === 'crystal') return findCrystalRefProblem(data, ref.traitId, ref.level)
  if (ref?.storage === 'book') return findBookRefProblem(data, ref.skillId, ref.reusable)
  if (ref?.storage === 'instance') {
    return typeof ref.instanceId === 'string'
      ? null
      : { code: 'malformed', detail: 'instanceId phải là chuỗi' }
  }
  return {
    code: 'malformed',
    detail: 'định danh item phải có storage "stack", "crystal", "book" hoặc "instance"'
  }
}

/** Câu mô tả lỗi định danh (kiểm tra save). */
export function describeItemRefProblem(problem: ItemRefProblem): string {
  switch (problem.code) {
    case 'malformed':
      return problem.detail
    case 'unknownItem':
      return `vật phẩm không tồn tại "${problem.itemId}"`
    case 'unknownTrait':
      return `trait không tồn tại "${problem.traitId}"`
    case 'unknownSkill':
      return `skill không tồn tại "${problem.skillId}"`
    default:
      return assertNever(problem, 'lỗi định danh item')
  }
}

/**
 * Kiểm tra định danh item nhận từ action; trả về bản sạch (chỉ các trường của định danh). Sai
 * dạng thì malformedAction, item / trait / skill không tồn tại thì unknownItem / unknownTrait /
 * unknownSkill.
 */
export function parseItemRef(data: GameData, value: unknown): ItemRef {
  const problem = findItemRefProblem(data, value)
  if (problem) {
    switch (problem.code) {
      case 'malformed':
        throw malformedAction(problem.detail)
      case 'unknownItem':
        throw new ActionError('unknownItem', { itemId: problem.itemId })
      case 'unknownTrait':
        throw new ActionError('unknownTrait', { traitId: problem.traitId })
      case 'unknownSkill':
        throw new ActionError('unknownSkill', { skillId: problem.skillId })
      default:
        return assertNever(problem, 'lỗi định danh item')
    }
  }
  // Ép kiểu vì findItemRefProblem đã kiểm tra đủ trường theo storage.
  const ref = value as ItemRef
  switch (ref.storage) {
    case 'stack':
      return { storage: 'stack', itemId: ref.itemId }
    case 'crystal':
      return { storage: 'crystal', traitId: ref.traitId, level: ref.level }
    case 'book':
      return { storage: 'book', skillId: ref.skillId, reusable: ref.reusable }
    case 'instance':
      return { storage: 'instance', instanceId: ref.instanceId }
    default:
      return assertNever(ref, 'định danh item')
  }
}

/** Hai định danh cùng trỏ một item (món trang bị: cùng id món). */
export function isSameItemRef(a: ItemRef, b: ItemRef): boolean {
  switch (a.storage) {
    case 'stack':
      return b.storage === 'stack' && a.itemId === b.itemId
    case 'crystal':
      return b.storage === 'crystal' && a.traitId === b.traitId && a.level === b.level
    case 'book':
      return b.storage === 'book' && a.skillId === b.skillId && a.reusable === b.reusable
    case 'instance':
      return b.storage === 'instance' && a.instanceId === b.instanceId
    default:
      return assertNever(a, 'định danh item')
  }
}

/** Định danh của một món trong danh sách hàng (món trang bị: theo id món). */
export function shopEntryRef(entry: ShopEntry): ItemRef {
  return entry.storage === 'instance'
    ? { storage: 'instance', instanceId: entry.instance.id }
    : entry
}

/** Số lượng đang có của item theo định danh (0 nếu không có; món trang bị: 0 hoặc 1). */
export function getRefCount(inventory: Inventory, ref: ItemRef): number {
  switch (ref.storage) {
    case 'stack':
      return getItemCount(inventory, ref.itemId)
    case 'crystal':
      return getCrystalCount(inventory, ref)
    case 'book':
      return getBookCount(inventory, ref)
    case 'instance':
      return inventory.equipment.some((entry) => entry.id === ref.instanceId) ? 1 : 0
    default:
      return assertNever(ref, 'định danh item')
  }
}

/** Thêm count item gộp được theo định danh (vượt giới hạn thì kẹp như addItems / addCrystals). */
export function addByRef(inventory: Inventory, ref: StackableItemRef, count: number): Inventory {
  switch (ref.storage) {
    case 'stack':
      return addItems(inventory, ref.itemId, count)
    case 'crystal':
      return addCrystals(inventory, ref, count)
    case 'book':
      return addBooks(inventory, ref, count)
    default:
      return assertNever(ref, 'định danh item')
  }
}

/**
 * Bớt count item theo định danh; không đủ thì ném ActionError. Món trang bị là bản riêng: count
 * phải là 1 (sai thì malformedAction), không có thì equipmentNotFound.
 */
export function removeByRef(inventory: Inventory, ref: ItemRef, count: number): Inventory {
  switch (ref.storage) {
    case 'stack':
      return removeItems(inventory, ref.itemId, count)
    case 'crystal':
      return removeCrystals(inventory, ref, count)
    case 'book':
      return removeBooks(inventory, ref, count)
    case 'instance':
      if (count !== 1) throw malformedAction('món trang bị chỉ có số lượng 1')
      return takeEquipment(inventory, ref.instanceId)[1]
    default:
      return assertNever(ref, 'định danh item')
  }
}
