import { describe, expect, it } from 'vitest'
import { makeData, makeMonster } from '@core/testing'
import { masteryExpForLevel, toBig } from '@core'
import { averageMastery, teamMastery, withAssumedMastery } from './mastery'

const data = makeData()

describe('withAssumedMastery', () => {
  const party = [makeMonster({ id: 'm1', skillIds: ['strike', 'quick'] })]

  it('tầng 1 hoặc không giả định: giữ nguyên (cấp 1)', () => {
    expect(withAssumedMastery(data, party, 1, { expPerFloor: 100 })[0].skillMastery).toEqual({})
    expect(withAssumedMastery(data, party, 5, null)[0].skillMastery).toEqual({})
  })

  it('mọi skill đang biết nhận exp = expPerFloor × (tầng − 1), cấp tính ngược từ exp', () => {
    const [monster] = withAssumedMastery(data, party, 3, { expPerFloor: 50 })
    const level = monster.skillMastery.strike.level
    expect(monster.skillMastery.strike.exp.toString()).toBe('100')
    expect(masteryExpForLevel(data, level).lte(100)).toBe(true)
    expect(masteryExpForLevel(data, level + 1).gt(100)).toBe(true)
    expect(monster.skillMastery.quick).toEqual(monster.skillMastery.strike)
    expect(party[0].skillMastery).toEqual({})
  })
})

describe('averageMastery', () => {
  it('trung bình trên mọi skill đang biết của đội mẫu (skill chưa có mục = cấp 1, exp 0)', () => {
    const party = [
      makeMonster({
        id: 'm1',
        skillIds: ['strike', 'quick'],
        skillMastery: { strike: { level: 5, exp: toBig(200) } }
      }),
      makeMonster({ id: 'egg', skillMastery: { strike: { level: 99, exp: toBig(1e6) } } })
    ]
    expect(averageMastery(party, new Set(['m1']))).toEqual({ level: 3, exp: 100 })
    expect(averageMastery([], new Set())).toEqual({ level: 1, exp: 0 })
  })
})

describe('teamMastery', () => {
  it('số riêng của đội đè số chung; không có giả định chung thì không giả định', () => {
    const spec = { expPerFloor: 30 }
    expect(teamMastery({ masteryExpPerFloor: null }, spec)).toEqual(spec)
    expect(teamMastery({ masteryExpPerFloor: 60 }, spec)).toEqual({ expPerFloor: 60 })
    expect(teamMastery({ masteryExpPerFloor: 60 }, null)).toBeNull()
  })
})
