import { describe, expect, it } from 'vitest'
import { makeData, makeMonster } from '@core/testing'
import { assumedAffinity, withAssumedAffinity } from './affinity'

const data = makeData()

describe('thân mật giả định của quét tầng', () => {
  it('tầng 1 như quái khởi đầu, từ tầng 2 tối đa', () => {
    expect(assumedAffinity(data, 1)).toBe(70)
    expect(assumedAffinity(data, 2)).toBe(255)
    expect(withAssumedAffinity(data, [makeMonster()], 5)[0].affinity).toBe(255)
  })
})
