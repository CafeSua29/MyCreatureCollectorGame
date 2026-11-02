import { describe, expect, it } from 'vitest'
import { rollTradeOffers } from '@core'
import { makeData, makeGameState, makeMonster } from '@core/testing'
import { runTrades } from './trades'

const data = makeData()

describe('runTrades', () => {
  it('đưa quái kho đúng yêu cầu (level thấp nhất), không đụng quái đội mẫu', () => {
    const base = makeGameState({ seed: 7, party: [makeMonster({ id: 'a' })] })
    const rolled = rollTradeOffers(data, base, 0)
    const want = { kind: 'species', speciesId: 'weakling', minLevel: 1 } as const
    const state = {
      ...rolled,
      storage: [makeMonster({ id: 's1', level: 5 }), makeMonster({ id: 's2', level: 3 })],
      trades: { ...rolled.trades, offers: rolled.trades.offers.map((o) => ({ ...o, want })) }
    }
    const result = runTrades(data, state, new Set(['a']))
    expect(result.trades).toBe(2)
    expect(result.state.trades.offers).toEqual([])
    expect(result.state.party.map((m) => m.id)).toContain('a')
  })

  it('không có quái kho hợp lệ thì không trao đổi', () => {
    const state = rollTradeOffers(
      data,
      makeGameState({ seed: 7, party: [makeMonster({ id: 'a' })] }),
      0
    )
    expect(runTrades(data, state, new Set(['a'])).trades).toBe(0)
  })
})
