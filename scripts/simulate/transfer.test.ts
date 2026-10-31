import { describe, expect, it } from 'vitest'
import { Decimal, toBig } from '@core'
import { decodeTransfer, encodeTransfer } from './transfer'

describe('encodeTransfer / decodeTransfer', () => {
  it('dựng lại Decimal ở mọi độ sâu, giá trị khác giữ nguyên', () => {
    const value = {
      money: toBig('12.5'),
      list: [toBig(0), { exp: toBig('1e400') }],
      name: 'a',
      count: 3,
      empty: null
    }
    const encoded = encodeTransfer(value)
    // Bản mã hóa không còn Decimal (qua được structured clone mà không mất kiểu).
    expect(JSON.stringify(encoded)).toContain('"$decimal":"12.5"')
    // Ép kiểu: decodeTransfer trả unknown, đã biết cấu trúc của value.
    const decoded = decodeTransfer(structuredClone(encoded)) as typeof value
    expect(decoded).toEqual(value)
    expect(decoded.money).toBeInstanceOf(Decimal)
    expect(decoded.money.eq(12.5)).toBe(true)
  })

  it('số cực lớn và số thập phân dài không mất chính xác', () => {
    const texts = ['1.5e9000000', '-3.14159265358979323846', '123456789012345678901234567890']
    for (const text of texts) {
      const decoded = decodeTransfer(structuredClone(encodeTransfer(toBig(text))))
      expect(decoded instanceof Decimal && decoded.eq(toBig(text))).toBe(true)
    }
  })

  it('object có khóa $decimal nhưng thêm khóa khác thì không bị đổi thành Decimal', () => {
    const value = { $decimal: '1', other: 2 }
    expect(decodeTransfer(value)).toEqual(value)
  })
})
