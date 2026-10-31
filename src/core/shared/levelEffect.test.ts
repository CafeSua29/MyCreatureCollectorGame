import { describe, expect, it } from 'vitest'
import { levelEffectScale } from './levelEffect'

describe('levelEffectScale', () => {
  it('tuyến tính 1 + 0,2 × (cấp − 1): trait +10% → cấp 2 12%, cấp 5 18%, cấp 10 28%, cấp 20 48%, cấp 50 108%', () => {
    const percentAt = (level: number): number => 10 * levelEffectScale(0.2, level)
    expect(percentAt(1)).toBeCloseTo(10)
    expect(percentAt(2)).toBeCloseTo(12)
    expect(percentAt(5)).toBeCloseTo(18)
    expect(percentAt(10)).toBeCloseTo(28)
    expect(percentAt(20)).toBeCloseTo(48)
    expect(percentAt(50)).toBeCloseTo(108)
  })

  it('cấp cực lớn vẫn hữu hạn', () => {
    expect(Number.isFinite(levelEffectScale(0.2, 1e12))).toBe(true)
  })
})
