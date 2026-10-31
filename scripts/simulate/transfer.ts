// Gửi kết quả giữa worker và luồng chính: postMessage làm mất prototype của Decimal, nên đổi
// Decimal sang chuỗi có đánh dấu rồi dựng lại ở phía nhận.

import { Decimal, toBig } from '@core'

const DECIMAL_TAG = '$decimal'

/** Đổi mọi Decimal (ở mọi độ sâu) thành { $decimal: chuỗi }. */
export function encodeTransfer(value: unknown): unknown {
  if (value instanceof Decimal) return { [DECIMAL_TAG]: value.toString() }
  if (Array.isArray(value)) return value.map(encodeTransfer)
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeTransfer(v)]))
  }
  return value
}

/** Ngược lại của encodeTransfer. */
export function decodeTransfer(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeTransfer)
  if (!isPlainObject(value)) return value
  const tagged = value[DECIMAL_TAG]
  if (typeof tagged === 'string' && Object.keys(value).length === 1) return toBig(tagged)
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeTransfer(v)]))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
