import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import {
  atFloor,
  expectActionError,
  makeBattleState,
  makeData,
  makeInventory,
  makeMonster,
  makeGameState
} from '../testing'
import type { GameAction, GameState, ItemRef } from '../model'

const data = makeData()

const potion: ItemRef = { storage: 'stack', itemId: 'potion' }
const fast2: ItemRef = { storage: 'crystal', traitId: 'fast', level: 2 }

function stateWith(overrides: Partial<GameState> = {}): GameState {
  return {
    ...makeGameState({ seed: 1, money: 100, party: [makeMonster({ id: 'a' })] }),
    inventory: makeInventory({ potion: 3 }, [{ traitId: 'fast', level: 2, count: 2 }]),
    ...overrides
  }
}

const discard = (state: GameState, item: unknown, count: unknown): GameState =>
  // Ép kiểu để giả lập action sai dạng từ UI.
  gameReducer(data, state, { type: 'discardItem', item, count } as GameAction)

describe('discardItem', () => {
  it('vứt vật phẩm và tinh thể, không nhận gì, không sửa state cũ', () => {
    const state = stateWith()
    const next = discard(discard(state, potion, 2), fast2, 2)
    expect(next.inventory).toEqual(makeInventory({ potion: 1 }))
    expect(next.money).toEqual(state.money)
    expect(state.inventory.stacks.potion).toBe(3)
  })

  it('vứt hết thì xóa chồng', () => {
    expect(discard(stateWith(), potion, 3).inventory.stacks).toEqual({})
  })

  it('dùng được ở tầng (ở đâu cũng được, ngoài trận)', () => {
    expect(discard(atFloor(stateWith(), 1), potion, 1).inventory.stacks.potion).toBe(2)
  })

  it('số lượng cực lớn', () => {
    const max = Number.MAX_SAFE_INTEGER
    const state = stateWith({ inventory: makeInventory({ potion: max }) })
    expect(discard(state, potion, max).inventory.stacks).toEqual({})
    expectActionError(() => discard(stateWith(), potion, max), 'notEnoughItem')
  })

  it('báo lỗi: trong trận, không đủ, số lượng / định danh sai', () => {
    const inBattle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    expectActionError(
      () => discard({ ...inBattle, inventory: makeInventory({ potion: 1 }) }, potion, 1),
      'inBattle'
    )
    expectActionError(() => discard(stateWith(), potion, 4), 'notEnoughItem')
    expectActionError(() => discard(stateWith(), { ...fast2, level: 1 }, 1), 'notEnoughCrystals')
    for (const count of [0, -2, 0.5, null]) {
      expectActionError(() => discard(stateWith(), potion, count), 'malformedAction')
    }
    expectActionError(() => discard(stateWith(), { itemId: 'potion' }, 1), 'malformedAction')
    expectActionError(
      () => discard(stateWith(), { storage: 'crystal', traitId: 'zzz', level: 1 }, 1),
      'unknownTrait'
    )
  })
})
