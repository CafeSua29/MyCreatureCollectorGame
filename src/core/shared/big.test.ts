import { describe, expect, it } from 'vitest'
import {
  bigToNumber,
  ceilBig,
  Decimal,
  floorBig,
  isValidBig,
  maxBig,
  minBig,
  parseBig,
  toBig
} from './big'

describe('Decimal: khớp tuyệt đối số học số nguyên nhỏ', () => {
  it('nhân / cộng / trừ số nguyên ra đúng như number (lý do không dùng break_infinity.js)', () => {
    // break_infinity.js cho 15976 × 715 = 11422839,999… nên làm tròn xuống sai 1.
    expect(toBig(15976).times(715).floor().toNumber()).toBe(11422840)
    let seed = 7
    for (let i = 0; i < 2000; i++) {
      seed = (seed * 16807) % 2147483647
      const a = seed % 1_000_000
      const b = (seed % 9973) + 1
      expect(toBig(a).times(b).toNumber()).toBe(a * b)
      expect(toBig(a).plus(b).toNumber()).toBe(a + b)
      expect(toBig(a).minus(b).toNumber()).toBe(a - b)
      expect(toBig(a).toNumber()).toBe(a)
    }
  })

  it('số nguyên tới 1e40 vẫn chính xác (PRECISION = 40)', () => {
    const big = toBig('123456789012345678901234567890123456789')
    expect(big.plus(1).minus(big).toString()).toBe('1')
  })

  it('phép chia làm tròn ở chữ số cuối: phải nhân trước rồi chia (1/3 × 3 < 1)', () => {
    expect(toBig(1).div(3).times(3).floor().toNumber()).toBe(0)
    expect(toBig(1).times(3).div(3).floor().toNumber()).toBe(1)
  })

  it('Decimal bất biến: phép tính trả về Decimal mới, không đổi giá trị cũ', () => {
    const a = toBig(5)
    a.plus(1)
    expect(a.toNumber()).toBe(5)
  })
})

describe('Decimal: số cực lớn', () => {
  it('tính được với 1e1000, 1e1000000 (number tràn thành Infinity)', () => {
    expect(toBig('1e1000').times('3e1000').toString()).toBe('3e+2000')
    expect(toBig('1e1000000').plus(1).gt('1e1000000')).toBe(false) // vượt độ chính xác: bỏ qua +1
    expect(toBig(2).pow(10000).gt('1e3010')).toBe(true)
    expect(bigToNumber('1e1000')).toBe(Infinity)
  })
})

describe('tiện ích', () => {
  it('floorBig, ceilBig, maxBig, minBig', () => {
    expect(floorBig(2.7).toNumber()).toBe(2)
    expect(floorBig(-2.5).toNumber()).toBe(-3)
    expect(ceilBig(2.1).toNumber()).toBe(3)
    expect(maxBig(1, '5', toBig(3)).toNumber()).toBe(5)
    expect(minBig(1, '5', toBig(3)).toNumber()).toBe(1)
    expect(maxBig('1e1000', 7).eq('1e1000')).toBe(true)
  })

  it('isValidBig: chỉ Decimal hữu hạn, không NaN', () => {
    expect(isValidBig(toBig(0))).toBe(true)
    expect(isValidBig(toBig('1e1000000'))).toBe(true)
    expect(isValidBig(toBig(Infinity))).toBe(false)
    expect(isValidBig(toBig(-Infinity))).toBe(false)
    expect(isValidBig(toBig(NaN))).toBe(false)
    expect(isValidBig(5)).toBe(false)
    expect(isValidBig('5')).toBe(false)
    expect(isValidBig(null)).toBe(false)
  })

  it('parseBig: đọc chuỗi số (kể cả mũ rất lớn), từ chối NaN / Infinity / chữ / kiểu khác', () => {
    expect(parseBig('1e1000')?.eq('1e1000')).toBe(true)
    expect(parseBig('1.2345e+40')?.eq('1.2345e40')).toBe(true)
    expect(parseBig('1e1000000')?.eq('1e1000000')).toBe(true)
    expect(parseBig('-12.5')?.toNumber()).toBe(-12.5)
    expect(parseBig(42)?.toNumber()).toBe(42)
    for (const bad of ['NaN', 'Infinity', '-Infinity', 'abc', '', '0x10', '1e', null, true, {}]) {
      expect(parseBig(bad)).toBeNull()
    }
    expect(parseBig(Infinity)).toBeNull()
    expect(parseBig(NaN)).toBeNull()
  })

  it('toString rồi parseBig ra đúng giá trị (dùng khi lưu save)', () => {
    for (const value of ['0', '7', '12.5', '1e21', '9.999e999999', '0.1']) {
      const big = toBig(value)
      expect(parseBig(big.toString())?.eq(big)).toBe(true)
    }
  })

  it('Decimal.isDecimal nhận ra Decimal', () => {
    expect(Decimal.isDecimal(toBig(1))).toBe(true)
    expect(Decimal.isDecimal(1)).toBe(false)
  })
})
