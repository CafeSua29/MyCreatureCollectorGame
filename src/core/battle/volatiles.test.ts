// Trạng thái tạm của quái trên sân (mục "Skill" ở battle.md): skill chỉ dùng ở lượt đầu, Perish
// Song, thế thân, truyền khi rút về (Baton Pass, Shed Tail), lưu / đọc / kiểm tra trong save.

import { describe, expect, it } from 'vitest'
import {
  gameReducer,
  migrateState,
  serializeState,
  deserializeState,
  validateGameState
} from '../game'
import { toBig } from '../shared'
import {
  defined,
  makeBattleState,
  makeFieldMoveData,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, BattleEvent, GameData, GameState, Monster } from '../model'

const data: GameData = makeFieldMoveData()

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const use = (slot: number, skillId: string, switchTo?: string): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target: 0,
  switchTo
})

const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, ...overrides, skillIds: [...(overrides.skillIds ?? []), 'idle'] })
const foe = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], ...overrides })

const battleOf = (state: GameState): NonNullable<GameState['battle']> =>
  defined(state.battle, 'trận')

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const member = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id),
    `quái ${id}`
  )

/** Đội: a ở ô 0 đánh một mình, các quái sau dự bị. */
const solo = (party: Monster[], enemies: Monster[], isBoss = false): GameState => {
  const state = makeBattleState(party, enemies, { isBoss })
  const battle = battleOf(state)
  return {
    ...state,
    battle: {
      ...battle,
      playerSlots: [party[0].id, null],
      participants: [party[0].id],
      volatiles: { [party[0].id]: { firstTurn: 1 }, [enemies[0].id]: { firstTurn: 1 } }
    }
  }
}

describe('skill chỉ dùng ở lượt đầu trên sân (firstTurnOnly)', () => {
  it('lượt 1 dùng được, lượt sau thất bại', () => {
    const state = solo([ally('a', { skillIds: ['openingStrike'] })], [foe('e1')])
    const first = turn(state, use(0, 'openingStrike'))
    expect(eventsOf(first, 'damage')).toHaveLength(1)
    const second = turn(first, use(0, 'openingStrike'))
    expect(eventsOf(second, 'skillFailed')).toEqual([
      { type: 'skillFailed', monsterId: 'a', skillId: 'openingStrike', reason: 'notFirstTurn' }
    ])
  })

  it('quái vào giữa lượt: lượt sau là lượt đầu của nó', () => {
    const state = solo([ally('a'), ally('b', { skillIds: ['openingStrike'] })], [foe('e1')])
    const swapped = turn(state, { slot: 0, kind: 'switch', monsterId: 'b' })
    expect(battleOf(swapped).volatiles.b).toEqual({ firstTurn: 2 })
    const after = turn(swapped, use(0, 'openingStrike'))
    expect(eventsOf(after, 'skillFailed')).toEqual([])
  })
})

describe('Perish Song', () => {
  it('mọi quái trên sân gục sau 3 lần cuối lượt; đếm lại không đặt lại số', () => {
    let state = solo([ally('a', { skillIds: ['perishSong'] }), ally('b')], [foe('e1')])
    state = turn(state, use(0, 'perishSong'))
    expect(battleOf(state).volatiles.a.perishTurns).toBe(2)
    state = turn(state, use(0, 'perishSong'))
    expect(battleOf(state).volatiles.a.perishTurns).toBe(1)
    state = turn(state, use(0, 'idle'))
    expect(
      eventsOf(state, 'perished')
        .map((e) => e.monsterId)
        .sort()
    ).toEqual(['a', 'e1'])
    expect(battleOf(state).outcome).toBe('won')
  })

  it('boss hoang không bị; rút về thì mất đếm ngược', () => {
    const boss = solo([ally('a', { skillIds: ['perishSong'] }), ally('b')], [foe('e1')], true)
    const after = turn(boss, use(0, 'perishSong'))
    expect(battleOf(after).volatiles.e1.perishTurns).toBeUndefined()
    const swapped = turn(after, { slot: 0, kind: 'switch', monsterId: 'b' })
    expect(battleOf(swapped).volatiles.a).toBeUndefined()
  })
})

describe('thế thân', () => {
  it('mất 25% max HP, thế thân nhận đòn thay và vỡ khi hết máu', () => {
    const attacker = foe('e1', { skillIds: ['strike'] })
    let state = solo([ally('a', { skillIds: ['substitute'] })], [attacker])
    state = turn(state, use(0, 'substitute'))
    // 50 × 25% = 12,5 → 13 (làm tròn lên).
    expect(eventsOf(state, 'substituteCreated')[0].hp.toNumber()).toBe(13)
    expect(member(state, 'a').damageTaken.toNumber()).toBeGreaterThanOrEqual(13)
    let rounds = 0
    while (battleOf(state).volatiles.a?.substituteHp !== undefined && rounds < 5) {
      state = turn(state, use(0, 'idle'))
      rounds++
    }
    expect(battleOf(state).log.some((e) => e.type === 'substituteBroken')).toBe(true)
  })

  it('chặn đổi bậc / trạng thái của địch lên quái núp sau', () => {
    const shielded = solo([ally('a')], [foe('e1', { skillIds: ['growl', 'toxicMove'] })])
    const battle = battleOf(shielded)
    const state = {
      ...shielded,
      battle: {
        ...battle,
        volatiles: { ...battle.volatiles, a: { firstTurn: 1, substituteHp: toBig(10) } }
      }
    }
    for (let i = 0; i < 4; i++) {
      const after = turn({ ...state, rng: i + 1 }, use(0, 'idle'))
      expect(battleOf(after).stages.a).toBeUndefined()
      expect(member(after, 'a').statuses).toEqual([])
    }
  })

  it('không đủ máu hoặc đã có thế thân thì thất bại, không mất máu', () => {
    const weak = turn(
      solo([ally('a', { skillIds: ['substitute'], damageTaken: 38 })], [foe('e1')]),
      use(0, 'substitute')
    )
    expect(eventsOf(weak, 'skillFailed')[0].reason).toBe('notEnoughHp')
    expect(member(weak, 'a').damageTaken.toNumber()).toBe(38)
    const once = turn(
      solo([ally('a', { skillIds: ['substitute'] })], [foe('e1')]),
      use(0, 'substitute')
    )
    const twice = turn(once, use(0, 'substitute'))
    expect(eventsOf(twice, 'skillFailed')[0].reason).toBe('alreadyActive')
  })
})

describe('truyền khi rút về', () => {
  it('Baton Pass: quái vào thay nhận bậc trận, thế thân, Perish Song, Focus Energy', () => {
    const state = solo([ally('a', { skillIds: ['batonPass'] }), ally('b')], [foe('e1')])
    const battle = battleOf(state)
    const prepared = {
      ...state,
      battle: {
        ...battle,
        stages: { a: { attack: 2 } },
        volatiles: {
          ...battle.volatiles,
          a: { firstTurn: 1, substituteHp: toBig(5), perishTurns: 3, focusStages: 2 }
        }
      }
    }
    const after = turn(prepared, use(0, 'batonPass', 'b'))
    expect(battleOf(after).playerSlots[0]).toBe('b')
    expect(battleOf(after).stages.b).toEqual({ attack: 2 })
    // Perish Song giảm 1 cuối lượt.
    expect(battleOf(after).volatiles.b).toMatchObject({ perishTurns: 2, focusStages: 2 })
    expect(battleOf(after).volatiles.b.substituteHp?.toNumber()).toBe(5)
    expect(eventsOf(after, 'passedOn')).toEqual([
      { type: 'passedOn', monsterId: 'a', toMonsterId: 'b' }
    ])
  })

  it('Shed Tail: mất 50% max HP, chỉ truyền thế thân', () => {
    const state = solo([ally('a', { skillIds: ['shedTail'] }), ally('b')], [foe('e1')])
    const prepared = { ...state, battle: { ...battleOf(state), stages: { a: { attack: 2 } } } }
    const after = turn(prepared, use(0, 'shedTail', 'b'))
    expect(member(after, 'a').damageTaken.toNumber()).toBe(25)
    expect(battleOf(after).stages.b).toBeUndefined()
    expect(battleOf(after).volatiles.b.substituteHp?.toNumber()).toBe(25)
  })
})

describe('trạng thái tạm trong save', () => {
  it('lưu / đọc giữ thế thân là Decimal, state hợp lệ', () => {
    const state = solo([ally('a')], [foe('e1')])
    const battle = battleOf(state)
    const withSub = {
      ...state,
      battle: {
        ...battle,
        volatiles: { ...battle.volatiles, a: { firstTurn: 1, substituteHp: toBig('1e300') } }
      }
    }
    const loaded = migrateState(
      deserializeState(JSON.parse(JSON.stringify(serializeState(withSub)))),
      data
    )
    expect(validateGameState(data, loaded)).toEqual([])
    expect(battleOf(loaded).volatiles.a.substituteHp?.eq(toBig('1e300'))).toBe(true)
  })

  it('validateGameState báo trạng thái tạm sai', () => {
    const state = solo([ally('a')], [foe('e1')])
    const bad = {
      ...state,
      battle: {
        ...battleOf(state),
        volatiles: {
          a: { firstTurn: 0, perishTurns: 1.5, substituteHp: toBig(0) },
          zz: { firstTurn: 1 }
        }
      }
    }
    const issues = validateGameState(data, bad).join('\n')
    expect(issues).toMatch(/battle\.volatiles\.a\.firstTurn/)
    expect(issues).toMatch(/battle\.volatiles\.a\.perishTurns/)
    expect(issues).toMatch(/battle\.volatiles\.a\.substituteHp phải lớn hơn 0/)
    expect(issues).toMatch(/battle\.volatiles\.zz: quái không ở trên sân/)
  })

  it('migrate v16 → v17: quái trên sân có firstTurn 1, không trong trận thì giữ nguyên', () => {
    const state = solo([ally('a')], [foe('e1')])
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    delete raw.battle.volatiles
    raw.version = 16
    const migrated = migrateState(deserializeState(raw), data)
    expect(battleOf(migrated).volatiles).toEqual({ a: { firstTurn: 1 }, e1: { firstTurn: 1 } })
    expect(validateGameState(data, migrated)).toEqual([])
    const idle = JSON.parse(JSON.stringify(serializeState({ ...state, battle: null })))
    idle.version = 16
    expect(migrateState(deserializeState(idle), data).battle).toBeNull()
  })
})
