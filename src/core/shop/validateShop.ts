// Kiểm tra cửa hàng đọc từ save (mục Lưu / đọc save). Chỉ kiểm tra định danh tồn tại và không
// trùng (món trang bị: nội dung món hợp lệ, id món không trùng); không kiểm tra `shop: true` hay số món vì dữ liệu game có thể đổi giữa các phiên bản.

import { asObject, isFiniteNumber } from '../shared'
import {
  describeItemRefProblem,
  findItemRefProblem,
  isSameItemRef,
  validateEquipmentInstance
} from '../inventory'
import type { GameData, ItemRef } from '../model'

/** Kiểm tra cửa hàng ở vị trí `path` của save. Trả về danh sách lỗi. */
export function validateShop(data: GameData, value: unknown, path = 'shop'): string[] {
  const shop = asObject(value)
  if (!shop) return [`${path} không hợp lệ`]
  if (!Array.isArray(shop.stock)) return [`${path}.stock phải là danh sách`]
  const issues: string[] = []
  const seen: ItemRef[] = []
  const addRef = (ref: ItemRef, where: string): void => {
    if (seen.some((other) => isSameItemRef(other, ref))) issues.push(`${where}: trùng món`)
    seen.push(ref)
  }
  shop.stock.forEach((entry: unknown, i) => {
    const where = `${path}.stock[${i}]`
    const instanceEntry = asObject(entry)
    if (instanceEntry?.storage === 'instance') {
      const instanceIssues = validateEquipmentInstance(
        data,
        instanceEntry.instance,
        `${where}.instance`
      )
      issues.push(...instanceIssues)
      // Ép kiểu vì validateEquipmentInstance đã kiểm tra id là chuỗi.
      if (instanceIssues.length === 0) {
        const instanceId = (instanceEntry.instance as { id: string }).id
        addRef({ storage: 'instance', instanceId }, where)
      }
      return
    }
    const problem = findItemRefProblem(data, entry)
    if (problem) {
      issues.push(`${where}: ${describeItemRefProblem(problem)}`)
      return
    }
    // Ép kiểu vì findItemRefProblem đã kiểm tra định danh hợp lệ (storage instance xử lý ở trên).
    addRef(entry as ItemRef, where)
  })
  return issues
}

/**
 * Kiểm tra thị trường đọc từ save: saturation là object số hữu hạn > 0. Không kiểm tra key có
 * khớp item tồn tại không vì dữ liệu game có thể đổi giữa các phiên bản (key thừa vô hại).
 */
export function validateMarket(value: unknown, path = 'market'): string[] {
  const saturation = asObject(asObject(value)?.saturation)
  if (!saturation) return [`${path}.saturation phải là object`]
  return Object.entries(saturation)
    .filter(([, amount]) => !isFiniteNumber(amount) || amount <= 0)
    .map(
      ([key, amount]) =>
        `${path}.saturation["${key}"] phải là số hữu hạn > 0, nhận ${String(amount)}`
    )
}
