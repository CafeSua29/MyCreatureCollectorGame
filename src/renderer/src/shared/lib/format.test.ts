import { describe, expect, it } from 'vitest'
import { toBig } from '@core'
import { formatNumber } from './format'

describe('formatNumber', () => {
  it('dưới 1000 giữ nguyên, bỏ phần lẻ', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(7)).toBe('7')
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(82.9)).toBe('82')
  })

  it('rút gọn K, M, B với dấu phẩy thập phân, cắt xuống', () => {
    expect(formatNumber(1000)).toBe('1K')
    expect(formatNumber(1234)).toBe('1,2K')
    expect(formatNumber(1299)).toBe('1,2K')
    expect(formatNumber(999_999)).toBe('999,9K')
    expect(formatNumber(3_400_000)).toBe('3,4M')
    expect(formatNumber(5_600_000_000)).toBe('5,6B')
    expect(formatNumber(7.8e12)).toBe('7,8T')
  })

  it('số âm và số cực lớn', () => {
    expect(formatNumber(-1234)).toBe('-1,2K')
    expect(formatNumber(1.23e40)).toBe('1,2e40')
    expect(formatNumber(Infinity)).toBe('∞')
  })
})

describe('formatNumber với Decimal và chuỗi số', () => {
  it('nhận Decimal và chuỗi số (summary trong file save), kết quả như number', () => {
    expect(formatNumber(toBig(1234))).toBe('1,2K')
    expect(formatNumber('3400000')).toBe('3,4M')
    expect(formatNumber(toBig('82.9'))).toBe('82')
    expect(formatNumber(toBig(-1234))).toBe('-1,2K')
  })

  it('cắt xuống chính xác ở ranh giới (không bị sai số dấu phẩy động)', () => {
    expect(formatNumber(toBig(999_999))).toBe('999,9K')
    expect(formatNumber(toBig(1_000_000))).toBe('1M')
    expect(formatNumber(toBig('1e36').minus(1))).toBe('999,9Dc')
    expect(formatNumber(toBig('1e36'))).toBe('1e36')
  })

  it('dạng mũ với số mũ rất lớn', () => {
    expect(formatNumber(toBig('1.234e1000'))).toBe('1,2e1000')
    expect(formatNumber('1e1000000')).toBe('1e1000000')
    expect(formatNumber(toBig('-5.67e400'))).toBe('-5,6e400')
  })

  it('giá trị không phải số hiển thị ?, vô cực hiển thị ∞', () => {
    expect(formatNumber('abc')).toBe('?')
    expect(formatNumber(NaN)).toBe('?')
    expect(formatNumber(toBig(-Infinity))).toBe('-∞')
  })
})
