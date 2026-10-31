import { describe, expect, it } from 'vitest'
import { Decimal, toBig } from './big'
import { cloneData } from './clone'

describe('cloneData', () => {
  it('sao chép sâu object và mảng; sửa bản sao không đổi bản gốc', () => {
    const original = { list: [1, { a: 2 }], nested: { b: 'x' }, empty: null }
    const copy = cloneData(original)
    expect(copy).toEqual(original)
    copy.list.push(3)
    copy.nested.b = 'y'
    expect(original).toEqual({ list: [1, { a: 2 }], nested: { b: 'x' }, empty: null })
  })

  it('giữ nguyên class Decimal (structuredClone làm mất prototype)', () => {
    const copy = cloneData({ money: toBig('1e1000'), genes: [toBig(5)] })
    expect(Decimal.isDecimal(copy.money)).toBe(true)
    expect(copy.money.eq('1e1000')).toBe(true)
    expect(copy.genes[0].plus(1).toNumber()).toBe(6)
  })

  it('giá trị nguyên thủy trả về như cũ', () => {
    expect(cloneData(5)).toBe(5)
    expect(cloneData('a')).toBe('a')
    expect(cloneData(null)).toBe(null)
  })
})
