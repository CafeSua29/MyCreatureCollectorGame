import { describe, expect, it } from 'vitest'
import { hashToUnit } from './hash'

describe('hashToUnit', () => {
  it('tất định: cùng đầu vào cùng kết quả', () => {
    expect(hashToUnit('market', 5, 'ball')).toBe(hashToUnit('market', 5, 'ball'))
  })

  it('luôn trong [0, 1), kể cả số cực lớn và chuỗi rỗng', () => {
    for (const parts of [[], [''], [0], [Number.MAX_SAFE_INTEGER], ['a', 1e300]]) {
      const value = hashToUnit(...parts)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('phân bố đều theo ngày liên tiếp (không dồn một phía)', () => {
    const values = Array.from({ length: 1000 }, (_, day) => hashToUnit('day', day))
    const low = values.filter((value) => value < 0.5).length
    expect(low).toBeGreaterThan(400)
    expect(low).toBeLessThan(600)
    expect(new Set(values).size).toBeGreaterThan(990)
  })
})
