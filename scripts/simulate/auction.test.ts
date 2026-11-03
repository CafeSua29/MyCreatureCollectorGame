import { describe, expect, it } from 'vitest'
import { openAuctionSession, toBig, type GameState } from '@core'
import { makeData, makeGameState, makeMonster } from '@core/testing'
import { runAuction } from './auction'

const data = makeData()

const state = (money: number): GameState =>
  openAuctionSession(
    data,
    makeGameState({ seed: 5, party: [makeMonster({ id: 'a' })], money: toBig(money) }),
    0
  )

describe('runAuction', () => {
  it('dư tiền thì đặt giá 170 % khởi điểm cho mọi lô, không đặt lại', () => {
    const result = runAuction(data, state(1e9))
    expect(result.bids).toBe(2)
    for (const lot of result.state.auction.lots) {
      expect(lot.bid?.eq(lot.startPrice.times(1.7).floor())).toBe(true)
    }
    expect(runAuction(data, result.state).bids).toBe(0)
  })

  it('giá vượt 10 % tiền thì không đặt', () => {
    expect(runAuction(data, state(1)).bids).toBe(0)
  })
})
