import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { validateMonster } from '../monster'
import { ActionError, toBig } from '../shared'
import { gameReducer } from '../game'
import {
  atFloor,
  defined,
  makeBattleState,
  makeData,
  makeMonster,
  expectActionError,
  makeGameState
} from '../testing'
import type { GameAction, GameState, Monster } from '../model'

// Fixture: đội tối đa 6, biệt danh tối đa 12 ký tự.
const data = makeData()

const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

const mon = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, ...overrides })

function stateWith(partyIds: string[], storageIds: string[] = []): GameState {
  return {
    ...makeGameState({ seed: 1, party: partyIds.map((id) => mon(id)) }),
    storage: storageIds.map((id) => mon(id))
  }
}

const idsOf = (state: GameState): { party: string[]; storage: string[] } => ({
  party: state.party.map((m) => m.id),
  storage: state.storage.map((m) => m.id)
})

describe('chuyển giữa đội và kho', () => {
  it('moveToStorage đưa vào cuối kho; state cũ không đổi', () => {
    const state = stateWith(['a', 'b'], ['x'])
    const next = run(state, { type: 'moveToStorage', monsterId: 'a' })
    expect(idsOf(next)).toEqual({ party: ['b'], storage: ['x', 'a'] })
    expect(idsOf(state)).toEqual({ party: ['a', 'b'], storage: ['x'] })
  })

  it('đội phải còn ít nhất 1 con, kể cả khi con còn lại đã gục', () => {
    expectActionError(
      () => run(stateWith(['a']), { type: 'moveToStorage', monsterId: 'a' }),
      'partyWouldBeEmpty'
    )
    const fainted = {
      ...stateWith(['a', 'b']),
      party: [mon('a'), mon('b', { damageTaken: toBig(999) })]
    }
    const next = run(fainted, { type: 'moveToStorage', monsterId: 'a' })
    expect(idsOf(next).party).toEqual(['b'])
  })

  it('moveToParty đưa vào cuối đội; báo lỗi khi đội đủ 6', () => {
    const next = run(stateWith(['a'], ['x', 'y']), { type: 'moveToParty', monsterId: 'y' })
    expect(idsOf(next)).toEqual({ party: ['a', 'y'], storage: ['x'] })
    const full = stateWith(['a', 'b', 'c', 'd', 'e', 'f'], ['x'])
    expectActionError(() => run(full, { type: 'moveToParty', monsterId: 'x' }), 'partyFull', {
      partySize: 6
    })
  })

  it('swapWithStorage đổi chỗ, mỗi con nhận vị trí của con kia (dùng được khi đội đầy)', () => {
    const full = stateWith(['a', 'b', 'c', 'd', 'e', 'f'], ['x', 'y'])
    const next = run(full, { type: 'swapWithStorage', partyMonsterId: 'c', storageMonsterId: 'y' })
    expect(idsOf(next)).toEqual({ party: ['a', 'b', 'y', 'd', 'e', 'f'], storage: ['x', 'c'] })
  })

  it('báo lỗi id không đúng chỗ', () => {
    const state = stateWith(['a', 'b'], ['x'])
    expectActionError(
      () => run(state, { type: 'moveToStorage', monsterId: 'x' }),
      'monsterNotInParty'
    )
    expectActionError(
      () => run(state, { type: 'moveToParty', monsterId: 'a' }),
      'monsterNotInStorage'
    )
    expect(() =>
      run(state, { type: 'swapWithStorage', partyMonsterId: 'x', storageMonsterId: 'a' })
    ).toThrow(ActionError)
  })
})

describe('reorderParty', () => {
  it('sắp lại thứ tự đội', () => {
    const next = run(stateWith(['a', 'b', 'c']), {
      type: 'reorderParty',
      monsterIds: ['c', 'a', 'b']
    })
    expect(idsOf(next).party).toEqual(['c', 'a', 'b'])
  })

  it('thứ tự đội quyết định ai ra sân trước', () => {
    const next = run(stateWith(['a', 'b', 'c']), {
      type: 'reorderParty',
      monsterIds: ['c', 'b', 'a']
    })
    const battle = defined(run(atFloor(next, 1), { type: 'startWildBattle' }).battle)
    expect(battle.playerSlots).toEqual(['c', 'b'])
  })

  it('báo lỗi khi thiếu, thừa, lặp hoặc lạ', () => {
    const state = stateWith(['a', 'b', 'c'])
    for (const monsterIds of [
      ['a', 'b'],
      ['a', 'b', 'c', 'd'],
      ['a', 'a', 'b'],
      ['a', 'b', 'x']
    ]) {
      expect(() => run(state, { type: 'reorderParty', monsterIds })).toThrow(ActionError)
    }
  })
})

describe('releaseMonster', () => {
  it('thả quái trong đội hoặc trong kho, không nhận gì', () => {
    const state = { ...stateWith(['a', 'b'], ['x']), money: toBig(50) }
    expect(idsOf(run(state, { type: 'releaseMonster', monsterId: 'a' }))).toEqual({
      party: ['b'],
      storage: ['x']
    })
    const fromStorage = run(state, { type: 'releaseMonster', monsterId: 'x' })
    expect(idsOf(fromStorage)).toEqual({ party: ['a', 'b'], storage: [] })
    expect(fromStorage.money).toEqual(50)
  })

  it('không thả được con cuối cùng trong đội hoặc quái không sở hữu', () => {
    expectActionError(
      () => run(stateWith(['a']), { type: 'releaseMonster', monsterId: 'a' }),
      'partyWouldBeEmpty'
    )
    expect(() => run(stateWith(['a']), { type: 'releaseMonster', monsterId: 'z' })).toThrow(
      ActionError
    )
  })
})

describe('renameMonster', () => {
  const rename = (state: GameState, monsterId: string, nickname: string | null): GameState =>
    run(state, { type: 'renameMonster', monsterId, nickname })

  it('đặt biệt danh cho quái trong đội hoặc kho; cắt khoảng trắng hai đầu', () => {
    const state = stateWith(['a'], ['x'])
    expect(rename(state, 'a', '  Bé Lửa  ').party[0].nickname).toBe('Bé Lửa')
    expect(rename(state, 'x', 'Kho').storage[0].nickname).toBe('Kho')
  })

  it('null hoặc chuỗi rỗng thì xóa biệt danh', () => {
    const named = rename(stateWith(['a']), 'a', 'Tên')
    expect(rename(named, 'a', null).party[0].nickname).toBeNull()
    expect(rename(named, 'a', '   ').party[0].nickname).toBeNull()
  })

  it('giới hạn độ dài theo ký tự Unicode (tiếng Việt có dấu tính 1 ký tự)', () => {
    const state = stateWith(['a'])
    const twelve = 'Đặng Hữu Ước' // 12 ký tự
    expect(rename(state, 'a', twelve).party[0].nickname).toBe(twelve)
    expectActionError(() => rename(state, 'a', 'Mười ba ký tự'), 'nicknameTooLong', {
      maxLength: 12
    })
  })

  it('quái có biệt danh vẫn hợp lệ; biệt danh sai thì validateMonster báo lỗi', () => {
    expect(validateMonster(data, mon('a', { nickname: 'Ok' }))).toEqual([])
    expect(validateMonster(data, mon('a', { nickname: ' x' })).join()).toMatch(/biệt danh/)
    expect(validateMonster(data, mon('a', { nickname: '' })).join()).toMatch(/biệt danh/)
  })
})

describe('chỉ dùng ngoài trận', () => {
  it('mọi action quản lý báo lỗi khi đang trong trận', () => {
    const state = { ...makeBattleState([mon('a'), mon('b')], [mon('e')]), storage: [mon('x')] }
    const actions: GameAction[] = [
      { type: 'moveToStorage', monsterId: 'a' },
      { type: 'moveToParty', monsterId: 'x' },
      { type: 'swapWithStorage', partyMonsterId: 'a', storageMonsterId: 'x' },
      { type: 'reorderParty', monsterIds: ['b', 'a'] },
      { type: 'releaseMonster', monsterId: 'x' },
      { type: 'renameMonster', monsterId: 'a', nickname: 'X' }
    ]
    for (const action of actions) {
      expectActionError(() => run(state, action), 'inBattle')
    }
  })
})
