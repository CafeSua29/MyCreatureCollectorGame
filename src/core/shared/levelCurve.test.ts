// Đường cong cấp đa thức dùng chung (thuần thục skill, luyện đan).

import { describe, expect, it } from 'vitest'
import { DataError } from './errors'
import { toBig } from './big'
import { curveExpForLevel, curveLevelFromExp } from './levelCurve'

const curve = { base: 10, power: 2 }

describe('đường cong cấp', () => {
  it('exp theo cấp: cấp 1 = 0, ⌈base × (L − 1)^power⌉', () => {
    expect(curveExpForLevel(curve, 1).toNumber()).toBe(0)
    expect(curveExpForLevel(curve, 4).toNumber()).toBe(90)
    expect(curveExpForLevel({ base: 1.5, power: 1 }, 2).toNumber()).toBe(2)
  })

  it('cấp tính ngược đúng ở biên mỗi cấp; exp ≤ 0 là cấp 1', () => {
    expect(curveLevelFromExp(curve, toBig(0), 'x')).toBe(1)
    expect(curveLevelFromExp(curve, toBig(-5), 'x')).toBe(1)
    expect(curveLevelFromExp(curve, toBig(89), 'x')).toBe(3)
    expect(curveLevelFromExp(curve, toBig(90), 'x')).toBe(4)
    // Số lớn: cấp vẫn khớp hàm thuận.
    const level = curveLevelFromExp(curve, toBig('1e20'), 'x')
    expect(curveExpForLevel(curve, level).lte('1e20')).toBe(true)
    expect(curveExpForLevel(curve, level + 1).gt('1e20')).toBe(true)
  })

  it('exp cho cấp vượt số nguyên an toàn: DataError', () => {
    expect(() => curveLevelFromExp(curve, toBig('1e400'), 'thử')).toThrow(DataError)
  })
})
