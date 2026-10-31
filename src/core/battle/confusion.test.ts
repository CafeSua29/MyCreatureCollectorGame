// Lú lẫn kiểu Pokémon (hook `selfHit`, cờ `endsOnLeave`; mục "Lú lẫn" ở battle-statuses.md): tự đánh
// mình thay vì dùng skill, mất khi rời sân; kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { createRng } from '../shared'
import {
  dataIssues,
  defined,
  makeBattleState,
  makeMonster,
  makeRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, BattleEvent, GameState, Monster, StatusDef } from '../model'

const confusion = (chance: number): StatusDef => ({
  id: `confusion${chance}`,
  kind: 'debuff',
  duration: { min: 2, max: 5 },
  hooks: [{ type: 'selfHit', params: { chance, power: 40 } }],
  battleOnly: true,
  endsOnLeave: true
})

function makeConfusionRaw(): ReturnType<typeof makeRawData> {
  const raw = makeRawData()
  raw.statuses.push(confusion(100), confusion(33))
  raw.config.ai.statusWeights = {
    ...raw.config.ai.statusWeights,
    confusion100: 0.25,
    confusion33: 0.25
  }
  return raw
}
const data = createGameData(withFixtureText(makeConfusionRaw()))

const fighter = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, elementIds: ['ghost'], skillIds: ['strike', 'idle'], ...overrides })
const passive = (id: string): Monster =>
  makeMonster({ id, elementIds: ['normal'], skillIds: ['idle'] })
const confused = (chance: number): MonsterOverrides => ({
  statuses: [{ statusId: `confusion${chance}`, turnsLeft: 5 }]
})

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })
const strike: BattleCommand = { slot: 0, kind: 'skill', skillId: 'strike', target: 0 }
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  defined(state.battle, 'trận').log.filter(
    (e): e is Extract<BattleEvent, { type: T }> => e.type === type
  )

describe('lú lẫn kiểu Pokémon (selfHit)', () => {
  it('trúng tỉ lệ: tự đánh mình (công / thủ của chính nó), không dùng skill', () => {
    const next = turn(makeBattleState([fighter('a', confused(100))], [passive('e1')]), strike)
    const [hit] = eventsOf(next, 'selfHit')
    expect(hit).toMatchObject({ monsterId: 'a', statusId: 'confusion100' })
    expect(hit.amount.gt(0)).toBe(true)
    expect(next.party[0].damageTaken.eq(hit.amount)).toBe(true)
    expect(eventsOf(next, 'useSkill').filter((e) => e.monsterId === 'a')).toEqual([])
    expect(defined(next.battle, 'trận').enemies[0].damageTaken.toNumber()).toBe(0)
  })

  it('tỉ lệ 33%: tự đánh khoảng 1/3 số lần, tất định theo seed', () => {
    let hits = 0
    const tries = 300
    for (let seed = 0; seed < tries; seed++) {
      const state = {
        ...makeBattleState([fighter('a', confused(33))], [passive('e1')]),
        rng: createRng(seed)
      }
      if (eventsOf(turn(state, strike), 'selfHit').length > 0) hits++
    }
    expect(hits / tries).toBeGreaterThan(0.25)
    expect(hits / tries).toBeLessThan(0.41)
  })

  it('máu cực ít: tự đánh tới gục, không âm máu', () => {
    const weak = fighter('a', { ...confused(100), damageTaken: 49 })
    const next = turn(makeBattleState([weak], [passive('e1')]), strike)
    expect(eventsOf(next, 'selfHit')[0].amount.toNumber()).toBe(1)
    expect(eventsOf(next, 'faint')).toContainEqual({ type: 'faint', monsterId: 'a' })
  })

  it('endsOnLeave: rút về thì mất lú lẫn; trạng thái khác (độc) giữ', () => {
    const user = fighter('a', {
      statuses: [
        { statusId: 'confusion100', turnsLeft: 5 },
        { statusId: 'poison', turnsLeft: 4 }
      ]
    })
    const state = makeBattleState([user, fighter('b'), fighter('c')], [passive('e1')])
    const next = turn(
      state,
      { slot: 0, kind: 'switch', monsterId: 'c' },
      { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
    )
    const benched = defined(
      next.party.find((m) => m.id === 'a'),
      'a'
    )
    expect(benched.statuses.map((s) => s.statusId)).toEqual(['poison'])
  })

  it('kiểm tra dữ liệu: selfHit cần chance 0–100 và power > 0; endsOnLeave chỉ là true', () => {
    const raw = makeConfusionRaw()
    raw.statuses.push(
      {
        id: 'badHit',
        kind: 'debuff',
        hooks: [{ type: 'selfHit', params: { chance: 120, power: 0 } }]
      },
      {
        id: 'badLeave',
        kind: 'debuff',
        hooks: [{ type: 'selfHit', params: { chance: 10, power: 40 } }],
        endsOnLeave: false as unknown as true
      }
    )
    const text = dataIssues(withFixtureText(raw)).join('\n')
    expect(text).toMatch(/"badHit".*chance/)
    expect(text).toMatch(/"badHit".*power/)
    expect(text).toMatch(/"badLeave": endsOnLeave chỉ được là true/)
  })
})
