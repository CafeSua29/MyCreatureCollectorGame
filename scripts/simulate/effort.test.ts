import { describe, expect, it } from 'vitest'
import { effortTotal } from '@core'
import { makeData, makeMonster } from '@core/testing'
import { EFFORT_PER_FLOOR, assumedEffortValues, withAssumedEffort } from './effort'

const data = makeData()

describe('điểm nỗ lực giả định của quét tầng', () => {
  it('tầng × EFFORT_PER_FLOOR, chia đều 6 chỉ số', () => {
    expect(effortTotal(assumedEffortValues(data, 0))).toBe(0)
    expect(effortTotal(assumedEffortValues(data, 1))).toBe(EFFORT_PER_FLOOR)
    const floor2 = assumedEffortValues(data, 2)
    expect(effortTotal(floor2)).toBe(2 * EFFORT_PER_FLOOR)
    expect(
      Math.max(...Object.values(floor2)) - Math.min(...Object.values(floor2))
    ).toBeLessThanOrEqual(1)
  })

  it('không vượt trần tổng ở tầng rất cao; giữ điểm sẵn có nếu cao hơn', () => {
    expect(effortTotal(assumedEffortValues(data, 1e6))).toBe(data.config.effort.maxTotal)
    const trained = makeMonster({
      effortValues: { hp: 252, attack: 252, defense: 6, spAttack: 0, spDefense: 0, speed: 0 }
    })
    expect(withAssumedEffort(data, [trained], 2)[0]).toBe(trained)
    expect(effortTotal(withAssumedEffort(data, [makeMonster()], 3)[0].effortValues)).toBe(
      Math.min(data.config.effort.maxTotal, 3 * EFFORT_PER_FLOOR)
    )
  })
})
