import { describe, expect, it } from 'vitest'
import { shouldStopEarly, wilsonInterval } from './earlyStop'

describe('wilsonInterval', () => {
  it('khớp giá trị tính tay (8 / 10 thắng)', () => {
    const { low, high } = wilsonInterval(8, 10)
    expect(low).toBeCloseTo(0.4902, 3)
    expect(high).toBeCloseTo(0.9433, 3)
  })

  it('0 trận: [0, 1]; thắng 0% / 100% vẫn nằm trong [0, 1]', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 })
    expect(wilsonInterval(0, 20).low).toBe(0)
    expect(wilsonInterval(20, 20).high).toBe(1)
    expect(wilsonInterval(20, 20).low).toBeGreaterThan(0.8)
  })

  it('số trận rất lớn: khoảng rất hẹp quanh tỉ lệ, không ra NaN', () => {
    const { low, high } = wilsonInterval(5e8, 1e9)
    expect(high - low).toBeLessThan(1e-4)
    expect(low).toBeLessThan(0.5)
    expect(high).toBeGreaterThan(0.5)
  })
})

describe('shouldStopEarly', () => {
  const spec = { minBattles: 20, ciWidth: 0.3 }

  it('chưa đủ minBattles thì không dừng dù khoảng đã hẹp', () => {
    expect(shouldStopEarly(19, 19, { minBattles: 20, ciWidth: 1 })).toBe(false)
  })

  it('đủ trận: dừng khi khoảng ≤ ciWidth', () => {
    // 20 / 20: khoảng [0,839; 1] rộng ≈ 0,16; 10 / 20: rộng ≈ 0,40.
    expect(shouldStopEarly(20, 20, spec)).toBe(true)
    expect(shouldStopEarly(10, 20, spec)).toBe(false)
  })

  it('null = tắt dừng sớm', () => {
    expect(shouldStopEarly(1000, 1000, null)).toBe(false)
  })
})
