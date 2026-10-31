import { describe, expect, it } from 'vitest'
import { toBig, type GameState } from '@core'
import { makeData, makeGameState, makeInventory, makeMonster } from '@core/testing'
import { upgradeSoulLevels } from './soulLevels'

const data = makeData()

const townState = (points: number, money: number): GameState => ({
  ...makeGameState({
    seed: 1,
    party: [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })]
  }),
  money: toBig(money),
  inventory: makeInventory({ soulSmall: points })
})

describe('upgradeSoulLevels', () => {
  it('dùng hết điểm, rải đều chỉ số cấp thấp nhất; chỉ quái đội mẫu', () => {
    const { state, upgrades } = upgradeSoulLevels(data, townState(5, 1e6), new Set(['a']))
    expect(upgrades).toBe(5)
    const a = state.party[0].soulLevels
    expect(Object.values(a).filter((level) => level === 1)).toHaveLength(5)
    expect(Object.values(state.party[1].soulLevels).every((level) => level === 0)).toBe(true)
  })

  it('hết tiền thì dừng, không lỗi', () => {
    const { upgrades } = upgradeSoulLevels(data, townState(10, 150), new Set(['a', 'b']))
    expect(upgrades).toBe(1)
  })
})
