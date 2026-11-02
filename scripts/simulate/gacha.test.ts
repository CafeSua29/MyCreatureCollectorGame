import { describe, expect, it } from 'vitest'
import { toBig, type GameState } from '@core'
import { makeData, makeGameState, makeMonster } from '@core/testing'
import { runGacha } from './gacha'

const data = makeData()

const state = (money: number): GameState =>
  makeGameState({ seed: 5, party: [makeMonster({ id: 'a' })], money: toBig(money) })

describe('runGacha', () => {
  it('dư tiền gấp 3 lần giá thì quay ×10', () => {
    const result = runGacha(data, state(2700))
    expect(result.eggs).toBe(10)
    expect(result.state.eggs).toHaveLength(10)
  })

  it('không đủ tiền dư thì không quay', () => {
    const result = runGacha(data, state(2699))
    expect(result.eggs).toBe(0)
    expect(result.state.eggs).toHaveLength(0)
  })

  it('kho không đủ chỗ cho trứng thì không quay', () => {
    const base = state(1_000_000)
    const full = {
      ...base,
      storage: Array.from({ length: data.config.capacity.storage.base }, (_, i) =>
        makeMonster({ id: `s${i}` })
      )
    }
    expect(runGacha(data, full).eggs).toBe(0)
  })
})
