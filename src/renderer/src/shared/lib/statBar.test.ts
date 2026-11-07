import { describe, expect, it } from 'vitest'
import { buildMonsterView, toBig } from '@core'
import { makeData, makeMonster, uniformStats } from '@core/testing'
import { statBarPercent, statBarScale } from './statBar'

const data = makeData()

describe('statBar', () => {
  it('thang chung = chỉ số lớn nhất trong các thẻ', () => {
    const monsters = [
      makeMonster({ id: 'a' }),
      makeMonster({ id: 'b', genes: { ...uniformStats(10), speed: 100 } })
    ]
    const views = monsters.map((m, index) =>
      buildMonsterView(data, m, {
        location: 'party',
        index,
        equipmentSlots: 3,
        scene: { party: [], place: null, aptitudeFloor: 1, time: 0 },
        highestFloor: 1
      })
    )
    expect(statBarScale(views)).toEqual(230) // 30 + 100 × 2
    expect(statBarScale([])).toEqual(1)
  })

  it('độ dài thanh (%) trong [0, 100], đúng cả với số rất lớn', () => {
    expect(statBarPercent(50, toBig(200))).toBe(25)
    expect(statBarPercent(300, toBig(200))).toBe(100)
    expect(statBarPercent(toBig('1e999'), toBig('1e1000'))).toBeCloseTo(10)
    expect(statBarPercent(5, toBig(0))).toBe(0)
  })
})
