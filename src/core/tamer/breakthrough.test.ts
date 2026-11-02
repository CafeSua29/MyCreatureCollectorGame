// Đột phá cảnh giới (docs/rules/tamer.md): điều kiện, thất bại giữ EXP, thành công lên cảnh giới
// và nâng khế ước mọi quái đang sở hữu, tỉ lệ tối thiểu.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { computeStats } from '../monster'
import { toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeBattleState,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import type { GameState } from '../model'
import { breakthroughOutcome } from './breakthrough'

const data = makeData()

/** State ở thị trấn đủ điều kiện đột phá từ cảnh giới `realm` (EXP, tiền, đan dư). */
function ready(realm: number, overrides: Partial<GameState> = {}): GameState {
  const state = makeGameState({
    seed: 7,
    party: [makeMonster({ id: 'a' })],
    money: 1_000_000,
    tamerRealm: realm
  })
  return {
    ...state,
    storage: [makeMonster({ id: 'b', contractRealm: realm })],
    inventory: makeInventory({ breakthroughPill: 20 }),
    tamer: {
      bondDay: null,
      woundUntilDay: null,
      talentRanks: {},
      bonusTalentPoints: 0,
      realm,
      exp: toBig(1_000_000)
    },
    ...overrides
  }
}

const breakthrough = (state: GameState): GameState =>
  gameReducer(data, state, { type: 'tamerBreakthrough' })

describe('tamerBreakthrough', () => {
  it('thành công (100% ở cảnh giới 0): lên 1, trừ EXP cần (dư giữ), tiền, 1 đan, nâng khế ước', () => {
    const before = ready(0)
    const after = breakthrough(before)
    expect(breakthroughOutcome(before, after)).toBe('success')
    expect(after.tamer.realm).toBe(1)
    expect(after.tamer.exp.toNumber()).toBe(1_000_000 - 100)
    expect(after.money.toNumber()).toBe(1_000_000 - 1000)
    expect(after.inventory.stacks.breakthroughPill).toBe(19)
    expect(after.party[0].contractRealm).toBe(1)
    expect(after.storage[0].contractRealm).toBe(1)
    // Cộng hưởng 3% mọi chỉ số (HP 50 → 51,5 → 51).
    expect(computeStats(data, after.party[0]).percentBySource.contract.hp).toBe(3)
  })

  it('quái có cảnh giới khế ước cao hơn thì giữ nguyên (không hạ)', () => {
    const before = ready(0, { party: [makeMonster({ id: 'a', contractRealm: 5 })] })
    expect(breakthrough(before).party[0].contractRealm).toBe(5)
  })

  it('thất bại: mất đan và tiền, giữ EXP và cảnh giới', () => {
    // Cảnh giới 7: tỉ lệ tối thiểu 30%; tìm seed thất bại.
    const seeds = Array.from({ length: 50 }, (_, i) => i + 1)
    const failed = seeds
      .map((seed) => {
        const before = { ...ready(7), rng: seed }
        return { before, after: breakthrough(before) }
      })
      .find(({ before, after }) => breakthroughOutcome(before, after) === 'failed')
    const { before, after } = defined(failed, 'lần thất bại')
    expect(after.tamer).toEqual(before.tamer)
    expect(after.money.toNumber()).toBe(1_000_000 - 1000 * 64)
    expect(after.inventory.stacks.breakthroughPill).toBe(20 - 8)
    expect(after.party[0].contractRealm).toBe(7)
  })

  it('thiếu EXP / tiền / đan: lỗi đúng mã, state giữ nguyên', () => {
    const lowExp = ready(2, {
      tamer: {
        bondDay: null,
        woundUntilDay: null,
        talentRanks: {},
        bonusTalentPoints: 0,
        realm: 2,
        exp: toBig(899)
      }
    })
    expectActionError(() => breakthrough(lowExp), 'tamerExpTooLow', {
      need: toBig(900),
      have: toBig(899)
    })
    expectActionError(() => breakthrough(ready(0, { money: toBig(999) })), 'notEnoughMoney')
    expectActionError(
      () => breakthrough(ready(2, { inventory: makeInventory({ breakthroughPill: 2 }) })),
      'notEnoughItem',
      { itemId: 'breakthroughPill', have: 2, need: 3 }
    )
  })

  it('EXP vừa khít (biên): đột phá được, còn 0 EXP', () => {
    const exact = ready(0, {
      tamer: {
        bondDay: null,
        woundUntilDay: null,
        talentRanks: {},
        bonusTalentPoints: 0,
        realm: 0,
        exp: toBig(100)
      }
    })
    expect(breakthrough(exact).tamer.exp.toNumber()).toBe(0)
  })

  it('chỉ ở thị trấn, ngoài trận', () => {
    expectActionError(
      () => breakthrough(ready(0, { location: { type: 'floor', floor: 1 } })),
      'notInTown'
    )
    const battle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    expectActionError(() => breakthrough({ ...ready(0), battle: battle.battle }), 'inBattle')
  })
})
