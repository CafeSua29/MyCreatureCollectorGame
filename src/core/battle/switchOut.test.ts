// Skill rút về (hiệu ứng switchOut, mục "Skill" ở battle.md): quái dùng rút về sau chiêu, quái
// dự bị vào thay ngay (chọn sẵn trong lệnh bằng switchTo hoặc mặc định), trait vào sân, kiểm tra
// lệnh và dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import {
  dataIssues,
  defined,
  expectActionError,
  makeBattleState,
  makeEnvironmentRawData,
  makeMonster,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { BattleCommand, BattleEvent, GameData, GameState, Monster, Skill } from '../model'

const skill = (overrides: Partial<Skill> & Pick<Skill, 'id'>): Skill => ({
  elementId: 'normal',
  category: 'physical',
  power: 50,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...overrides
})

const switchOut = { type: 'switchOut', params: {} }

function pivotRaw(): ReturnType<typeof makeEnvironmentRawData> {
  const raw = makeEnvironmentRawData()
  raw.skills.push(
    // Kiểu U-turn: đánh rồi rút về.
    skill({ id: 'pivot', effects: [switchOut] }),
    skill({ id: 'wildPivot', accuracy: 1, effects: [switchOut] }),
    // Kiểu Chilly Reception: đặt bão rồi rút về.
    skill({
      id: 'chill',
      category: 'status',
      power: 0,
      target: 'self',
      effects: [{ type: 'setField', params: { layer: 'weather', fieldId: 'storm' } }, switchOut]
    })
  )
  return withFixtureText(raw)
}

const data: GameData = createGameData(pivotRaw())

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
  makeMonster({
    id,
    elementIds: ['ghost'],
    skillIds: ['pivot', 'chill', 'wildPivot', 'idle'],
    ...overrides
  })

/** Quái địch hệ normal, chậm (đánh sau quái ta), chỉ biết strike. */
const foe = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    elementIds: ['normal'],
    skillIds: ['strike'],
    traits: [{ id: 'slow', level: 1 }],
    ...overrides
  })

/** Đội 3 quái: a ở ô 0 (đánh một mình), b, c dự bị. */
const solo = (party: Monster[], enemies: Monster[] = [foe('e1')]): GameState => {
  const state = makeBattleState(party, enemies)
  const battle = defined(state.battle, 'trận')
  return {
    ...state,
    battle: { ...battle, playerSlots: [party[0].id, null], participants: [party[0].id] }
  }
}

const slotsOf = (state: GameState): (string | null)[] => defined(state.battle, 'trận').playerSlots

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const member = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id),
    `quái ${id}`
  )

describe('skill rút về', () => {
  it('trúng thì rút về, quái switchTo vào ngay ô đó và chịu đòn sau trong lượt; bậc trận mất', () => {
    // c hệ cỏ (không miễn đòn hệ thường của địch như hệ ma).
    const state = solo([ally('a'), ally('b'), ally('c', { elementIds: ['grass'] })])
    const withStages = {
      ...state,
      battle: { ...defined(state.battle, 'trận'), stages: { a: { attack: 2 } } }
    }
    const after = turn(withStages, use(0, 'pivot', 'c'))
    expect(slotsOf(after)).toEqual(['c', null])
    expect(eventsOf(after, 'enter')).toEqual([
      { type: 'enter', side: 'player', slot: 0, monsterId: 'c' }
    ])
    // Địch đánh sau nên trúng quái vừa vào.
    expect(member(after, 'c').damageTaken.toNumber()).toBeGreaterThan(0)
    expect(member(after, 'a').damageTaken.toNumber()).toBe(0)
    expect(defined(after.battle, 'trận').stages.a).toBeUndefined()
    expect(defined(after.battle, 'trận').participants).toContain('c')
  })

  it('bỏ trống switchTo: quái dự bị còn sống đầu tiên theo thứ tự đội', () => {
    const party = [ally('a'), ally('b', { damageTaken: 50 }), ally('c')]
    expect(slotsOf(turn(solo(party), use(0, 'pivot')))).toEqual(['c', null])
  })

  it('trượt thì không rút về', () => {
    let missed = 0
    for (let seed = 0; seed < 30; seed++) {
      const state = { ...solo([ally('a'), ally('b')]), rng: seed }
      const after = turn(state, use(0, 'wildPivot', 'b'))
      if (eventsOf(after, 'miss').length > 0) {
        missed++
        expect(slotsOf(after)).toEqual(['a', null])
      } else {
        expect(slotsOf(after)).toEqual(['b', null])
      }
    }
    expect(missed).toBeGreaterThan(0)
  })

  it('không còn dự bị thì ở lại sân; quái hoang (không có dự bị) cũng vậy', () => {
    expect(slotsOf(turn(solo([ally('a')]), use(0, 'pivot')))).toEqual(['a', null])
    const enemyPivot = foe('e1', { skillIds: ['pivot'] })
    const after = turn(solo([ally('a', { skillIds: ['idle'] })], [enemyPivot]), use(0, 'idle'))
    expect(defined(after.battle, 'trận').enemySlots[0]).toBe('e1')
  })

  it('skill status đặt môi trường rồi rút về; quái vào chạy trait vào sân', () => {
    const party = [ally('a'), ally('b', { traits: [{ id: 'rainCaller', level: 1 }] })]
    const after = turn(solo(party), use(0, 'chill', 'b'))
    // Bão do skill đặt, rồi quái b vào sân gọi mưa thay.
    expect(eventsOf(after, 'fieldChanged').map((e) => e.fieldId)).toEqual(['storm', 'rain'])
    expect(slotsOf(after)).toEqual(['b', null])
  })
})

describe('kiểm tra lệnh switchTo', () => {
  const state = makeBattleState(
    [ally('a'), ally('b'), ally('c'), ally('d', { damageTaken: 50 })],
    [foe('e1')]
  )

  it('chỉ cho skill rút về', () => {
    expectActionError(() => turn(state, use(0, 'idle', 'c'), use(1, 'idle')), 'malformedAction')
  })

  it('quái phải trong đội, chưa ra sân, còn sống, không bị chọn hai lần', () => {
    expectActionError(
      () => turn(state, use(0, 'pivot', 'zz'), use(1, 'idle')),
      'monsterNotInParty',
      {
        monsterId: 'zz'
      }
    )
    expectActionError(
      () => turn(state, use(0, 'pivot', 'b'), use(1, 'idle')),
      'monsterAlreadyActive',
      {
        monsterId: 'b'
      }
    )
    expectActionError(() => turn(state, use(0, 'pivot', 'd'), use(1, 'idle')), 'monsterFainted', {
      monsterId: 'd'
    })
    expectActionError(
      () => turn(state, use(0, 'pivot', 'c'), { slot: 1, kind: 'switch', monsterId: 'c' }),
      'monsterChosenTwice',
      { monsterId: 'c' }
    )
  })
})

describe('dữ liệu', () => {
  it('switchOut chỉ có tham số passOn và không dùng cho vật phẩm ném', () => {
    const raw = pivotRaw()
    raw.skills.push(
      skill({ id: 'badPivot', effects: [{ type: 'switchOut', params: { now: true } }] })
    )
    raw.items.push({
      id: 'smokeBomb',
      category: 'consumable',
      price: 10,
      use: 'battle',
      target: 'enemy',
      effects: [switchOut]
    })
    const issues = dataIssues(withFixtureText(raw)).join('\n')
    expect(issues).toMatch(/"badPivot".*hook này chỉ có tham số passOn/)
    expect(issues).toMatch(/"smokeBomb".*chỉ dùng cho skill, không dùng cho vật phẩm ném/)
  })
})
