// Thao tác item hàng loạt (docs/rules/bulk-actions.md): lọc túi theo bộ lọc thành danh sách dòng
// { item, count } để UI gửi thẳng vào bán / vứt / phân giải hàng loạt; đọc danh sách dòng từ action.

import { asObject, malformedAction } from '../shared'
import type { EquipmentRarity, GameData, Inventory, ItemBatchEntry, ItemCategory } from '../model'
import { canLeaveBag } from './itemRules'

/**
 * Bộ lọc túi; bỏ trống trường = không lọc theo trường đó. Trường chỉ có ở một loại item (bậc hiếm:
 * trang bị; trait: tinh thể; cấp: tinh thể và trang bị) khi đặt thì loại khác bị loại.
 */
export interface BagItemQuery {
  categories?: readonly ItemCategory[]
  rarities?: readonly EquipmentRarity[]
  traitIds?: readonly string[]
  minLevel?: number
  maxLevel?: number
}

/** Một dòng trong túi kèm thuộc tính để lọc. */
interface BagLine {
  entry: ItemBatchEntry
  category: ItemCategory
  rarity?: EquipmentRarity
  traitId?: string
  level?: number
}

function bagLines(data: GameData, inventory: Inventory): BagLine[] {
  return [
    ...Object.entries(inventory.stacks).map(([itemId, count]) => ({
      entry: { item: { storage: 'stack' as const, itemId }, count },
      category: data.items[itemId].category
    })),
    ...inventory.crystals.map(({ traitId, level, count }) => ({
      entry: { item: { storage: 'crystal' as const, traitId, level }, count },
      category: 'traitCrystal' as const,
      traitId,
      level
    })),
    ...inventory.books.map(({ skillId, reusable, count }) => ({
      entry: { item: { storage: 'book' as const, skillId, reusable }, count },
      category: 'skillBook' as const
    })),
    ...inventory.equipment.map((instance) => ({
      entry: { item: { storage: 'instance' as const, instanceId: instance.id }, count: 1 },
      category: 'equipment' as const,
      rarity: instance.rarity,
      level: instance.level
    }))
  ]
}

/** Giá trị có trong danh sách cho phép (bỏ trống danh sách = mọi giá trị; thiếu giá trị = loại). */
const allows = <T>(allowed: readonly T[] | undefined, value: T | undefined): boolean =>
  allowed === undefined || (value !== undefined && allowed.includes(value))

function matchesQuery(line: BagLine, query: BagItemQuery): boolean {
  const { level } = line
  return (
    allows(query.categories, line.category) &&
    allows(query.rarities, line.rarity) &&
    allows(query.traitIds, line.traitId) &&
    (query.minLevel === undefined || (level !== undefined && level >= query.minLevel)) &&
    (query.maxLevel === undefined || (level !== undefined && level <= query.maxLevel))
  )
}

/**
 * Item trong túi khớp bộ lọc, mỗi dòng đủ số lượng đang có, theo thứ tự túi (item gộp chồng, tinh
 * thể, sách, trang bị). Không gồm item không rời túi được (vật phẩm chìa khóa, bùa).
 */
export function filterBagItems(
  data: GameData,
  inventory: Inventory,
  query: BagItemQuery = {}
): ItemBatchEntry[] {
  return bagLines(data, inventory)
    .filter((line) => canLeaveBag(line.category) && matchesQuery(line, query))
    .map((line) => line.entry)
}

/**
 * Đọc danh sách dòng { item, count } của action hàng loạt: mảng khác rỗng, mỗi dòng là object. Định
 * danh và số lượng từng dòng do action lẻ kiểm tra.
 */
export function parseItemBatch(value: unknown): { item: unknown; count: unknown }[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw malformedAction('items phải là danh sách có ít nhất một dòng')
  }
  return value.map((line) => {
    const object = asObject(line)
    if (!object) throw malformedAction('mỗi dòng items phải là { item, count }')
    return { item: object.item, count: object.count }
  })
}
