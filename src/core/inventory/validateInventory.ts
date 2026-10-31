// Kiểm tra túi đồ đọc từ save (mục Lưu / đọc save): cấu trúc, id tồn tại, đúng phần của túi theo
// category, số lượng là số nguyên an toàn ≥ 1, món trang bị hợp lệ (id món không trùng: kiểm tra ở
// validateGameState vì món còn nằm trên quái và trong cửa hàng). Thông báo lỗi ghi đường dẫn trường.

import { hasCrystal, type GameData } from '../model'
import { asObject, checkInteger } from '../shared'
import { itemStorage } from './itemRules'
import { isBookableSkill } from './skillBooks'
import { validateEquipmentInstance } from './validateEquipment'

function checkStacks(data: GameData, value: unknown, path: string, issues: string[]): void {
  const stacks = asObject(value)
  if (!stacks) {
    issues.push(`${path} không hợp lệ`)
    return
  }
  for (const [itemId, count] of Object.entries(stacks)) {
    const item = data.items[itemId]
    if (!item) {
      issues.push(`${path}: vật phẩm không tồn tại "${itemId}"`)
    } else if (itemStorage(item.category) !== 'stack') {
      issues.push(`${path}: vật phẩm "${itemId}" (${item.category}) không gộp chồng theo id`)
    }
    issues.push(...checkInteger(count, `${path}.${itemId}`, 1))
  }
}

function checkCrystals(data: GameData, value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách`)
    return
  }
  const seen = new Set<string>()
  value.forEach((entry: unknown, i) => {
    const where = `${path}[${i}]`
    const stack = asObject(entry)
    if (!stack) {
      issues.push(`${where}: không phải chồng tinh thể hợp lệ`)
      return
    }
    const trait = typeof stack.traitId === 'string' ? data.traits[stack.traitId] : undefined
    if (!trait) {
      issues.push(`${where}.traitId: trait không tồn tại "${String(stack.traitId)}"`)
    } else if (!hasCrystal(trait.kind)) {
      issues.push(`${where}.traitId: trait loại "${trait.kind}" không có tinh thể`)
    }
    issues.push(...checkInteger(stack.level, `${where}.level`, 1))
    issues.push(...checkInteger(stack.count, `${where}.count`, 1))
    const key = `${String(stack.traitId)}#${String(stack.level)}`
    if (seen.has(key)) issues.push(`${where}: trùng chồng tinh thể (cùng trait và cấp)`)
    seen.add(key)
  })
}

function checkBooks(data: GameData, value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} phải là danh sách`)
    return
  }
  const seen = new Set<string>()
  value.forEach((entry: unknown, i) => {
    const where = `${path}[${i}]`
    const stack = asObject(entry)
    if (!stack) {
      issues.push(`${where}: không phải chồng sách hợp lệ`)
      return
    }
    const skill = typeof stack.skillId === 'string' ? data.skills[stack.skillId] : undefined
    if (!skill) {
      issues.push(`${where}.skillId: skill không tồn tại "${String(stack.skillId)}"`)
    } else if (!isBookableSkill(data, skill)) {
      issues.push(`${where}.skillId: skill "${skill.id}" không có sách kỹ năng`)
    }
    if (typeof stack.reusable !== 'boolean') issues.push(`${where}.reusable phải là true / false`)
    issues.push(...checkInteger(stack.count, `${where}.count`, 1))
    const key = `${String(stack.skillId)}#${String(stack.reusable)}`
    if (seen.has(key)) issues.push(`${where}: trùng chồng sách (cùng skill và loại)`)
    seen.add(key)
  })
}

/** Kiểm tra túi đồ ở vị trí `path` của save. Trả về danh sách lỗi. */
export function validateInventory(data: GameData, value: unknown, path = 'inventory'): string[] {
  const inventory = asObject(value)
  if (!inventory) return [`${path} không hợp lệ`]
  const issues: string[] = []
  checkStacks(data, inventory.stacks, `${path}.stacks`, issues)
  checkCrystals(data, inventory.crystals, `${path}.crystals`, issues)
  checkBooks(data, inventory.books, `${path}.books`, issues)
  if (!Array.isArray(inventory.equipment)) {
    issues.push(`${path}.equipment phải là danh sách`)
  } else {
    inventory.equipment.forEach((instance: unknown, i) =>
      issues.push(...validateEquipmentInstance(data, instance, `${path}.equipment[${i}]`))
    )
  }
  return issues
}
