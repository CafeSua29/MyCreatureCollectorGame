import { describe, expect, it } from 'vitest'
import { findMinOffset, memoizeByOffset, winRateOf, type SearchPoint } from './levelSearch'

/** Hàm đo giả: tỉ lệ thắng = offset / 10 (kẹp 1), đếm số lần đo thật. */
function fakeMeasure(): { measure: (offset: number) => SearchPoint; calls: number[] } {
  const calls: number[] = []
  const measure = memoizeByOffset((offset: number) => {
    calls.push(offset)
    return { offset, won: Math.min(offset, 10), played: 10 }
  })
  return { measure, calls }
}

describe('findMinOffset', () => {
  it('ra offset nhỏ nhất đạt mục tiêu', () => {
    const { measure } = fakeMeasure()
    expect(findMinOffset(0.5, 60, measure)?.offset).toBe(5)
    expect(findMinOffset(0.8, 60, measure)?.offset).toBe(8)
    expect(findMinOffset(0, 60, measure)?.offset).toBe(0)
  })

  it('không đạt kể cả ở maxOffset thì null; maxOffset 0 chỉ đo một điểm', () => {
    const { measure, calls } = fakeMeasure()
    expect(findMinOffset(0.5, 3, measure)).toBeNull()
    expect(findMinOffset(0, 0, fakeMeasure().measure)?.offset).toBe(0)
    expect(calls).toEqual([3])
  })

  it('đo lại cùng offset thì lấy từ bộ nhớ, số lần đo ~ log2', () => {
    const { measure, calls } = fakeMeasure()
    findMinOffset(0.5, 60, measure)
    const first = calls.length
    expect(first).toBeLessThanOrEqual(8)
    findMinOffset(0.5, 60, measure)
    expect(calls.length).toBe(first)
  })
})

describe('winRateOf', () => {
  it('0 trận thì 0', () => {
    expect(winRateOf({ offset: 0, won: 0, played: 0 })).toBe(0)
    expect(winRateOf({ offset: 0, won: 3, played: 4 })).toBe(0.75)
  })
})
