import { describe, expect, it } from 'vitest'
import { makeData, makeGameState, makeInventory, makeMonster } from '@core/testing'
import { feedCandies, isCandy } from './candy'

const data = makeData()

describe('feedCandies', () => {
  it('nhận ra kẹo theo hiệu ứng', () => {
    expect(isCandy(data, 'expCandyS')).toBe(true)
    expect(isCandy(data, 'rareCandy')).toBe(true)
    expect(isCandy(data, 'potion')).toBe(false)
    expect(isCandy(data, 'nope')).toBe(false)
  })

  it('dùng hết kẹo lên quái đội mẫu level thấp nhất, bỏ qua quái ngoài đội mẫu', () => {
    const state = {
      ...makeGameState({
        seed: 1,
        party: [
          makeMonster({ id: 'm1', level: 5, exp: 125 }),
          makeMonster({ id: 'm2', level: 3, exp: 27 }),
          makeMonster({ id: 'egg', level: 1, exp: 1 })
        ]
      }),
      inventory: makeInventory({ rareCandy: 2, potion: 1 })
    }
    const { state: next, used } = feedCandies(data, state, new Set(['m1', 'm2']))
    expect(used).toBe(2)
    expect(next.party.map((m) => m.level)).toEqual([5, 5, 1])
    expect(next.inventory.stacks).toEqual({ potion: 1 })
  })

  it('không có kẹo thì giữ nguyên', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'm1' })] })
    expect(feedCandies(data, state, new Set(['m1']))).toEqual({ state, used: 0 })
  })
})
