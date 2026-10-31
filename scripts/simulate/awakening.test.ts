import { describe, expect, it } from 'vitest'
import { createGameState, toBig, type GameState, type Monster } from '@core'
import { defined, makeData, makeMonster } from '@core/testing'
import { awakenWhilePossible, readyToAwaken } from './awakening'

const data = makeData()
const PILL = defined(data.config.awakening.pillItemIds.normal, 'đan hệ normal')

function town(monster: Monster, pills: number): GameState {
  const state = createGameState({
    seed: 3,
    party: [monster],
    location: { type: 'town' },
    floorBiomeIds: ['field'],
    lifespanEnabled: false
  })
  const stacks = { ...state.inventory.stacks, [PILL]: pills }
  return { ...state, money: toBig(1e7), inventory: { ...state.inventory, stacks } }
}

const hero = (overrides: Parameters<typeof makeMonster>[0] = {}): Monster =>
  makeMonster({ id: 'm1', level: 60, skillIds: ['strike', 'idle'], ...overrides })

describe('độ kiếp của người chơi mô phỏng', () => {
  const ids = new Set(['m1'])

  it('đủ level, không trọng thương, còn đường lui thì sẵn sàng', () => {
    expect(readyToAwaken(data, town(hero(), 1), ids)).toBe(true)
    // Chưa có đan trong túi: không về thị trấn riêng để độ kiếp.
    expect(readyToAwaken(data, town(hero(), 0), ids)).toBe(false)
    expect(readyToAwaken(data, town(hero({ level: 49 }), 1), ids)).toBe(false)
    expect(readyToAwaken(data, town(hero({ injuryBattlesLeft: 1 }), 1), ids)).toBe(false)
    expect(readyToAwaken(data, town(hero({ tribulationFailures: 5 }), 1), ids)).toBe(false)
  })

  it('độ kiếp tới khi hết đan / thua; đếm thắng + thua bằng số lần thử, đội hồi máu', () => {
    const tried = awakenWhilePossible(data, town(hero(), 1), ids)
    expect(tried.successes + tried.failures).toBe(1)
    expect(tried.state.battle).toBeNull()
    expect(tried.state.party[0].damageTaken.toString()).toBe('0')
    const none = awakenWhilePossible(data, town(hero(), 0), ids)
    expect(none.successes + none.failures).toBe(0)
  })
})
