// Chạy trước mọi file test (vitest.config.mts → setupFiles).
// So sánh Decimal theo GIÁ TRỊ (Decimal.eq, chính xác tuyệt đối), kể cả với number hoặc chuỗi số:
// expect(monster.damageTaken).toEqual(7), expect(genes).toEqual(uniformStats(10)) vẫn đúng nghĩa
// sau khi các trường đổi sang Decimal. Không phải so gần đúng: 7 và 7,0000…1 vẫn khác nhau.

import { expect } from 'vitest'
import { Decimal } from '../shared'

const isComparable = (value: unknown): value is Decimal | number | string =>
  Decimal.isDecimal(value) || typeof value === 'number' || typeof value === 'string'

function equalsAsDecimal(a: unknown, b: unknown): boolean | undefined {
  if (!Decimal.isDecimal(a) && !Decimal.isDecimal(b)) return undefined
  if (!isComparable(a) || !isComparable(b)) return false
  try {
    return new Decimal(a).eq(b)
  } catch {
    // Chuỗi không phải số (ví dụ so Decimal với tên quái): không bằng.
    return false
  }
}

expect.addEqualityTesters([equalsAsDecimal])
