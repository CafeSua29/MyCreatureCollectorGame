// Hàm nhỏ dùng chung khi kiểm tra dữ liệu JSON (params của hook, config...) và state.

import { Decimal, isValidBig } from './big'
import { malformedAction } from './errors'

export function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Trả về [] nếu value là số hữu hạn trong [min, max], ngược lại một thông báo lỗi. */
export function checkNumber(
  value: unknown,
  field: string,
  min = -Infinity,
  max = Infinity
): string[] {
  if (isFiniteNumber(value) && value >= min && value <= max) return []
  const range =
    max === Infinity ? (min === -Infinity ? '' : ` ≥ ${min}`) : ` trong [${min}, ${max}]`
  return [`${field} phải là số hữu hạn${range}, nhận ${String(value)}`]
}

/** Trả về [] nếu value là số nguyên an toàn ≥ min. */
export function checkInteger(value: unknown, field: string, min = -Infinity): string[] {
  return Number.isSafeInteger(value) && (value as number) >= min
    ? []
    : [`${field} phải là số nguyên ≥ ${min}, nhận ${String(value)}`]
}

/** Trả về [] nếu value là Decimal hữu hạn ≥ min (trường số lớn trong state, quy tắc 12). */
export function checkBig(value: unknown, field: string, min = 0): string[] {
  if (isValidBig(value) && value.gte(min)) return []
  const received = Decimal.isDecimal(value) ? value.toString() : String(value)
  return [`${field} phải là số hữu hạn ≥ ${min}, nhận ${received}`]
}

/** Trả về [] nếu value là danh sách không rỗng, không trùng, mỗi phần tử thuộc `allowed`. */
export function checkEnumList(value: unknown, field: string, allowed: readonly string[]): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${field} phải là danh sách không rỗng`]
  const issues = value
    .filter((id) => !allowed.includes(id))
    .map((id) => `${field}: "${String(id)}" phải là ${allowed.join(' / ')}`)
  if (new Set(value).size !== value.length) issues.push(`${field} có phần tử trùng`)
  return issues
}

/**
 * Đọc danh sách id nhận từ action (thao tác hàng loạt): mảng chuỗi khác rỗng, không trùng; sai thì
 * malformedAction nêu tên trường.
 */
export function parseIdList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw malformedAction(`${field} phải là danh sách có ít nhất một id`)
  }
  if (!value.every((id): id is string => typeof id === 'string')) {
    throw malformedAction(`${field} chỉ gồm chuỗi`)
  }
  if (new Set(value).size !== value.length) throw malformedAction(`${field} bị trùng`)
  return [...value]
}
