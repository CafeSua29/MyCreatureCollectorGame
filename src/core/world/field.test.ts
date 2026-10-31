import { describe, expect, it } from 'vitest'
import { ActionError, toBig } from '../shared'
import { gameReducer } from '../game'
import {
  atFloor,
  defined,
  makeBattleState,
  makeData,
  makeMonster,
  makeInventory,
  expectActionError,
  makeGameState
} from '../testing'
import type { GameAction, GameState, Location } from '../model'

const data = makeData()

function stateWith(overrides: Partial<GameState> = {}): GameState {
  return {
    ...makeGameState({
      seed: 1,
      money: toBig(1000),
      party: [
        makeMonster({ id: 'a', level: 5, exp: 125, damageTaken: 30 }),
        makeMonster({ id: 'b', level: 3, exp: 27 })
      ]
    }),
    ...overrides
  }
}

const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)

describe('rest', () => {
  it('hồi đầy cả đội, giá = restCostPerLevel × tổng level', () => {
    const state = stateWith()
    const next = run(state, { type: 'rest' })
    expect(next.money).toEqual(1000 - 2 * (5 + 3))
    expect(next.party.every((m) => m.damageTaken.isZero())).toBe(true)
    expect(state.party[0].damageTaken).toEqual(30)
  })

  it('báo lỗi khi đội đầy máu, thiếu tiền, hoặc đang trong trận', () => {
    const full = stateWith({ party: [makeMonster()] })
    expectActionError(() => run(full, { type: 'rest' }), 'partyFullHp')
    expectActionError(
      () => run(stateWith({ money: toBig(15) }), { type: 'rest' }),
      'notEnoughMoney',
      { need: toBig(16) }
    )
    const inBattle = makeBattleState([makeMonster({ damageTaken: 5 })], [makeMonster({ id: 'e' })])
    expect(() => run({ ...inBattle, money: toBig(1000) }, { type: 'rest' })).toThrow(ActionError)
  })
})

describe('useItem', () => {
  const withItems = stateWith({ inventory: makeInventory({ potion: 1, genderPotion: 2 }) })

  it('thuốc hồi % max HP và trừ vật phẩm', () => {
    // a level 5: max HP = 50 × 1,4 = 70; hồi 35 → damageTaken 30 → 0
    const next = run(withItems, { type: 'useItem', itemId: 'potion', monsterId: 'a' })
    expect(next.party[0].damageTaken).toEqual(0)
    expect(next.inventory.stacks).toEqual({ genderPotion: 2 })
    expect(withItems.inventory.stacks.potion).toEqual(1)
  })

  it('thuốc đổi gender', () => {
    const next = run(withItems, { type: 'useItem', itemId: 'genderPotion', monsterId: 'b' })
    expect(next.party[1].gender).toBe('male')
    expect(next.inventory.stacks.genderPotion).toEqual(1)
  })

  it('thuốc hồi máu không dùng được cho quái đã gục', () => {
    // b level 3: max HP = 50 × 1,2 = 60
    const fainted = stateWith({
      inventory: makeInventory({ potion: 1 }),
      party: [makeMonster({ id: 'b', level: 3, exp: 27, damageTaken: 60 })]
    })
    expectActionError(
      () => run(fainted, { type: 'useItem', itemId: 'potion', monsterId: 'b' }),
      'itemNoEffect'
    )
  })

  it('thuốc hồi sinh hồi quái đã gục với % max HP, không dùng được cho quái còn sống', () => {
    const state = stateWith({
      inventory: makeInventory({ revive: 2 }),
      party: [
        makeMonster({ id: 'a', level: 5, exp: 125, damageTaken: 10 }),
        makeMonster({ id: 'b', level: 3, exp: 27, damageTaken: 60 })
      ]
    })
    const next = run(state, { type: 'useItem', itemId: 'revive', monsterId: 'b' })
    expect(next.party[1].damageTaken).toEqual(30) // hồi 50% của 60
    expect(next.inventory.stacks).toEqual({ revive: 1 })
    expectActionError(
      () => run(state, { type: 'useItem', itemId: 'revive', monsterId: 'a' }),
      'itemNoEffect'
    )
  })

  it('quái được hồi sinh vào trận được', () => {
    const state = stateWith({
      inventory: makeInventory({ revive: 1 }),
      party: [makeMonster({ id: 'b', level: 3, exp: 27, damageTaken: 60 })]
    })
    expectActionError(() => run(atFloor(state, 1), { type: 'startWildBattle' }), 'noHealthyMonster')
    const revived = run(state, { type: 'useItem', itemId: 'revive', monsterId: 'b' })
    const battle = defined(run(atFloor(revived, 1), { type: 'startWildBattle' }).battle)
    expect(battle.playerSlots).toEqual(['b', null])
  })

  it('không có tác dụng thì báo lỗi và không mất vật phẩm', () => {
    expectActionError(
      () => run(withItems, { type: 'useItem', itemId: 'potion', monsterId: 'b' }),
      'itemNoEffect'
    )
  })

  it('dùng được lên quái trong kho (mục "Kẹo EXP và Kẹo Hiếm": đội hoặc kho)', () => {
    const stored = makeMonster({ id: 'c', level: 5, exp: 125, damageTaken: 30 })
    const state = stateWith({ storage: [stored], inventory: makeInventory({ potion: 1 }) })
    const next = run(state, { type: 'useItem', itemId: 'potion', monsterId: 'c' })
    expect(defined(next.storage[0], 'quái trong kho').damageTaken.isZero()).toBe(true)
    expect(next.party).toBe(state.party)
    expect(next.inventory.stacks).toEqual({})
  })

  it('báo lỗi vật phẩm không tồn tại, hết vật phẩm, quái không phải của ta', () => {
    expect(() => run(withItems, { type: 'useItem', itemId: 'nope', monsterId: 'a' })).toThrow(
      ActionError
    )
    expectActionError(
      () => run(stateWith(), { type: 'useItem', itemId: 'potion', monsterId: 'a' }),
      'notEnoughItem'
    )
    expectActionError(
      () => run(withItems, { type: 'useItem', itemId: 'potion', monsterId: 'z' }),
      'monsterNotOwned'
    )
  })
})

describe('useItem — bóng', () => {
  it('bóng chỉ dùng trong trận', () => {
    const state = stateWith({ inventory: makeInventory({ ball: 1 }) })
    expectActionError(
      () => run(state, { type: 'useItem', itemId: 'ball', monsterId: 'a' }),
      'itemWrongContext',
      { context: 'field' }
    )
  })

  it('tinh thể trait không dùng trực tiếp được (inject ở NPC)', () => {
    expectActionError(
      () => run(stateWith(), { type: 'useItem', itemId: 'traitCrystal', monsterId: 'a' }),
      'itemNotUsable'
    )
  })
})

describe('gameReducer', () => {
  it('action lạ ném ActionError', () => {
    expect(() => run(stateWith(), { type: 'dance' } as unknown as GameAction)).toThrow(ActionError)
  })
})

describe('di chuyển và NPC hồi máu', () => {
  it('travel tới tầng đã mở rồi về thị trấn', () => {
    const state = { ...stateWith(), highestFloor: 3 }
    const onFloor = run(state, { type: 'travel', to: { type: 'floor', floor: 3 } })
    expect(onFloor.location).toEqual({ type: 'floor', floor: 3 })
    expect(run(onFloor, { type: 'travel', to: { type: 'floor', floor: 1 } }).location).toEqual({
      type: 'floor',
      floor: 1
    })
    expect(run(onFloor, { type: 'travel', to: { type: 'town' } }).location).toEqual({
      type: 'town'
    })
  })

  it('travel báo lỗi: tầng chưa mở, tầng 0 / âm / số lẻ / không phải số, điểm đến lạ', () => {
    const state = { ...stateWith(), highestFloor: 2 }
    const go = (to: unknown): GameState =>
      // Ép kiểu để thử dữ liệu sai từ renderer.
      run(state, { type: 'travel', to: to as Location })
    expectActionError(() => go({ type: 'floor', floor: 3 }), 'floorLocked', {
      floor: 3,
      highestFloor: 2
    })
    for (const floor of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
      expect(() => go({ type: 'floor', floor })).toThrow(ActionError)
    }
    expectActionError(() => go({ type: 'zone', zoneId: 'meadow' }), 'malformedAction')
    expectActionError(() => go(null), 'malformedAction')
  })

  it('chỉ đánh quái hoang được khi đang ở một tầng', () => {
    expectActionError(() => run(stateWith(), { type: 'startWildBattle' }), 'notOnFloor')
  })

  it('NPC hồi máu ở thị trấn: miễn phí, hồi cả quái đã gục', () => {
    const state = stateWith({
      party: [makeMonster({ id: 'a', damageTaken: 999 }), makeMonster({ id: 'b', damageTaken: 5 })]
    })
    const next = run(state, { type: 'healParty' })
    expect(next.party.every((m) => m.damageTaken.isZero())).toBe(true)
    expect(next.money).toBe(state.money)
  })

  it('NPC hồi máu báo lỗi ngoài thị trấn hoặc khi đội đầy máu', () => {
    const hurt = stateWith()
    expectActionError(
      () => run({ ...hurt, location: { type: 'floor', floor: 1 } }, { type: 'healParty' }),
      'notInTown'
    )
    expectActionError(
      () => run(stateWith({ party: [makeMonster()] }), { type: 'healParty' }),
      'partyFullHp'
    )
  })

  it('nghỉ mất tiền vẫn dùng được ở vùng', () => {
    const onFloor = { ...stateWith(), location: { type: 'floor' as const, floor: 1 } }
    expect(run(onFloor, { type: 'rest' }).party[0].damageTaken).toEqual(0)
  })
})

describe('trạng thái bất thường ngoài trận', () => {
  const poison = [{ statusId: 'poison', turnsLeft: 4 }]
  const sleep = [{ statusId: 'sleep', turnsLeft: 2 }]

  it('NPC hồi máu chữa mọi trạng thái, kể cả khi đội đã đầy máu', () => {
    const state = stateWith({
      party: [makeMonster({ id: 'a', statuses: [...poison, ...sleep] }), makeMonster({ id: 'b' })]
    })
    const next = run(state, { type: 'healParty' })
    expect(next.party.map((m) => m.statuses)).toEqual([[], []])
    expect(state.party[0].statuses).toHaveLength(2)
  })

  it('NPC hồi máu báo lỗi chỉ khi đầy máu và không có trạng thái nào', () => {
    expectActionError(
      () => run(stateWith({ party: [makeMonster({ statuses: [] })] }), { type: 'healParty' }),
      'partyFullHp'
    )
  })

  it('nghỉ ngơi không chữa trạng thái; đầy máu mà có trạng thái vẫn báo partyFullHp', () => {
    const hurt = stateWith({ party: [makeMonster({ id: 'a', damageTaken: 10, statuses: poison })] })
    expect(run(hurt, { type: 'rest' }).party[0].statuses).toEqual(poison)
    const full = stateWith({ party: [makeMonster({ id: 'a', statuses: poison })] })
    expectActionError(() => run(full, { type: 'rest' }), 'partyFullHp')
  })

  it('thuốc giải dùng ngoài trận: chữa đúng trạng thái, trừ vật phẩm', () => {
    const state = stateWith({
      party: [makeMonster({ id: 'a', statuses: [...poison, ...sleep] })],
      inventory: makeInventory({ antidote: 1, fullHeal: 1 })
    })
    const antidote = run(state, { type: 'useItem', itemId: 'antidote', monsterId: 'a' })
    expect(antidote.party[0].statuses).toEqual(sleep)
    expect(antidote.inventory.stacks.antidote).toBeUndefined()
    const full = run(state, { type: 'useItem', itemId: 'fullHeal', monsterId: 'a' })
    expect(full.party[0].statuses).toEqual([])
  })

  it('thuốc giải không có trạng thái cần chữa: itemNoEffect, không mất thuốc', () => {
    const state = stateWith({
      party: [makeMonster({ id: 'a', statuses: sleep })],
      inventory: makeInventory({ antidote: 1, fullHeal: 1 })
    })
    expectActionError(
      () => run(state, { type: 'useItem', itemId: 'antidote', monsterId: 'a' }),
      'itemNoEffect',
      { itemId: 'antidote', monsterId: 'a' }
    )
    const clean = stateWith({
      party: [makeMonster({ id: 'a' })],
      inventory: makeInventory({ fullHeal: 1 })
    })
    expectActionError(
      () => run(clean, { type: 'useItem', itemId: 'fullHeal', monsterId: 'a' }),
      'itemNoEffect'
    )
  })

  it('vật phẩm ném không dùng được ngoài trận', () => {
    const state = stateWith({ inventory: makeInventory({ poisonBomb: 1 }) })
    expectActionError(
      () => run(state, { type: 'useItem', itemId: 'poisonBomb', monsterId: 'a' }),
      'itemWrongContext',
      { itemId: 'poisonBomb', context: 'field' }
    )
  })
})
