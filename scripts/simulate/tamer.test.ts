import { describe, expect, it } from 'vitest'
import { toBig, type GameState } from '@core'
import { makeData, makeGameState, makeInventory, makeMonster } from '@core/testing'
import { assumedTamerRealm, breakthroughWhilePossible, readyToBreakthrough } from './tamer'

const data = makeData()

/** Ở thị trấn, cảnh giới 0, EXP đủ lên 2 cảnh giới (100 + 400), tiền dư. */
function town(overrides: Partial<GameState> = {}): GameState {
  return {
    ...makeGameState({ seed: 3, party: [makeMonster({ id: 'm1' })], money: 1_000_000 }),
    tamer: {
      bondDay: null,
      woundUntilDay: null,
      talentRanks: {},
      bonusTalentPoints: 0,
      realm: 0,
      exp: toBig(500)
    },
    ...overrides
  }
}

describe('đột phá trong mô phỏng', () => {
  it('cảnh giới giả định theo tầng: 10 tầng một cảnh giới', () => {
    expect(assumedTamerRealm(1)).toBe(0)
    expect(assumedTamerRealm(10)).toBe(0)
    expect(assumedTamerRealm(11)).toBe(1)
  })

  it('đủ EXP và đan: đột phá liên tục tới khi hết EXP (fixture: cảnh giới 0, 1 chắc thành công 100% / 90%)', () => {
    const state = town({ inventory: makeInventory({ breakthroughPill: 10 }) })
    expect(readyToBreakthrough(data, state)).toBe(true)
    const tried = breakthroughWhilePossible(data, state)
    expect(tried.successes + tried.failures).toBeGreaterThanOrEqual(1)
    expect(tried.state.tamer.realm).toBe(tried.successes)
    expect(readyToBreakthrough(data, tried.state)).toBe(false)
  })

  it('không có đan và cửa hàng không bán: không thử', () => {
    const tried = breakthroughWhilePossible(data, town())
    expect(tried).toMatchObject({ successes: 0, failures: 0 })
    expect(tried.state.tamer.realm).toBe(0)
  })

  it('cửa hàng có bán thì mua cho đủ rồi đột phá', () => {
    const shop = { stock: [{ storage: 'stack', itemId: 'breakthroughPill' } as const] }
    const tried = breakthroughWhilePossible(data, town({ shop }))
    expect(tried.successes).toBeGreaterThanOrEqual(1)
  })

  it('thiếu EXP: không làm gì', () => {
    const state = town({
      tamer: {
        bondDay: null,
        woundUntilDay: null,
        talentRanks: {},
        bonusTalentPoints: 0,
        realm: 0,
        exp: toBig(99)
      }
    })
    expect(readyToBreakthrough(data, state)).toBe(false)
    expect(breakthroughWhilePossible(data, state).state).toBe(state)
  })
})
