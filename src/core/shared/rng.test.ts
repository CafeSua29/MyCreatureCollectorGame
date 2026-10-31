import { describe, expect, it } from 'vitest'
import {
  createRng,
  nextBigInt,
  nextFloat,
  nextInt,
  nextUint32,
  pick,
  pickWeighted,
  rollPercent,
  type RngState
} from './rng'
import { toBig } from './big'

function sequence(seed: number, count: number): number[] {
  const values: number[] = []
  let state = createRng(seed)
  for (let i = 0; i < count; i++) {
    let value: number
    ;[value, state] = nextUint32(state)
    values.push(value)
  }
  return values
}

describe('rng', () => {
  it('cùng seed cho cùng chuỗi số', () => {
    expect(sequence(42, 20)).toEqual(sequence(42, 20))
  })

  it('seed khác cho chuỗi khác', () => {
    expect(sequence(1, 20)).not.toEqual(sequence(2, 20))
  })

  it('gọi lại với cùng state cho cùng kết quả (state cũ không bị tiêu thụ)', () => {
    const state = createRng(7)
    expect(nextFloat(state)).toEqual(nextFloat(state))
  })

  it('state luôn là số nguyên 32-bit không dấu, lưu được vào save', () => {
    let state: RngState = createRng(-123.9)
    for (let i = 0; i < 100; i++) {
      ;[, state] = nextUint32(state)
      expect(Number.isInteger(state)).toBe(true)
      expect(state).toBeGreaterThanOrEqual(0)
      expect(state).toBeLessThan(2 ** 32)
    }
    expect(JSON.parse(JSON.stringify({ state }))).toEqual({ state })
  })

  it('nextFloat nằm trong [0, 1)', () => {
    let state = createRng(99)
    for (let i = 0; i < 1000; i++) {
      let value: number
      ;[value, state] = nextFloat(state)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('nextInt cho ra mọi giá trị trong [min, max], tính cả hai đầu', () => {
    let state = createRng(5)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) {
      let value: number
      ;[value, state] = nextInt(state, 5, 10)
      expect(value).toBeGreaterThanOrEqual(5)
      expect(value).toBeLessThanOrEqual(10)
      seen.add(value)
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10])
  })

  it('nextInt và createRng báo lỗi với tham số sai', () => {
    expect(() => nextInt(createRng(1), 5, 4)).toThrow(RangeError)
    expect(() => nextInt(createRng(1), 0.5, 4)).toThrow(RangeError)
    expect(() => createRng(Number.NaN)).toThrow(RangeError)
  })

  it('pick trả về phần tử của danh sách và báo lỗi khi rỗng', () => {
    const items = ['a', 'b', 'c']
    const [value] = pick(createRng(3), items)
    expect(items).toContain(value)
    expect(() => pick(createRng(3), [])).toThrow(RangeError)
  })

  it('pickWeighted theo trọng số, không bao giờ chọn phần tử trọng số 0', () => {
    const items = [
      { id: 'a', weight: 3 },
      { id: 'zero', weight: 0 },
      { id: 'b', weight: 1 }
    ]
    const counts: Record<string, number> = { a: 0, zero: 0, b: 0 }
    let state = createRng(11)
    for (let i = 0; i < 4000; i++) {
      let item: (typeof items)[number]
      ;[item, state] = pickWeighted(state, items, (x) => x.weight)
      counts[item.id]++
    }
    expect(counts.zero).toEqual(0)
    expect(counts.a / counts.b).toBeGreaterThan(2.5)
    expect(counts.a / counts.b).toBeLessThan(3.5)
    expect(() => pickWeighted(createRng(1), items, () => 0)).toThrow(RangeError)
  })

  it('rollPercent: 100 luôn trúng và không tốn RNG, 0 không bao giờ trúng', () => {
    const state = createRng(4)
    expect(rollPercent(state, 100)).toEqual([true, state])
    let current = state
    for (let i = 0; i < 200; i++) {
      let hit: boolean
      ;[hit, current] = rollPercent(current, 0)
      expect(hit).toBe(false)
    }
  })
})

describe('nextBigInt', () => {
  it('khoảng vừa số nguyên an toàn: cùng kết quả và cùng state với nextInt', () => {
    let state = createRng(21)
    for (let i = 0; i < 100; i++) {
      const [big, nextBig] = nextBigInt(state, toBig(3), toBig(17))
      const [small, nextSmall] = nextInt(state, 3, 17)
      expect(big.eq(small)).toBe(true)
      expect(nextBig).toEqual(nextSmall)
      state = nextSmall
    }
  })

  it('min = max trả về đúng giá trị; khoảng an toàn lớn nhất vẫn đi đường nextInt', () => {
    expect(nextBigInt(createRng(1), toBig(5), toBig(5))[0].eq(5)).toBe(true)
    const max = toBig(Number.MAX_SAFE_INTEGER)
    const [value] = nextBigInt(createRng(1), toBig(1), max)
    expect(value.gte(1) && value.lte(max)).toBe(true)
  })

  it('khoảng cực lớn: số nguyên trong khoảng, trải đều cả hai nửa, tất định', () => {
    const min = toBig('1e300')
    const max = toBig('9e300')
    const middle = toBig('5e300')
    let state = createRng(8)
    let low = 0
    for (let i = 0; i < 400; i++) {
      let value
      ;[value, state] = nextBigInt(state, min, max)
      expect(value.isInteger() && value.gte(min) && value.lte(max)).toBe(true)
      if (value.lt(middle)) low++
    }
    expect(low).toBeGreaterThan(150)
    expect(low).toBeLessThan(250)
    expect(nextBigInt(createRng(8), min, max)).toEqual(nextBigInt(createRng(8), min, max))
  })

  it('báo lỗi khoảng sai: min > max, không phải số nguyên', () => {
    expect(() => nextBigInt(createRng(1), toBig(5), toBig(4))).toThrow(RangeError)
    expect(() => nextBigInt(createRng(1), toBig(1.5), toBig(4))).toThrow(RangeError)
    expect(() => nextBigInt(createRng(1), toBig('1e300'), toBig(Infinity))).toThrow(RangeError)
  })
})
