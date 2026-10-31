import { describe, expect, it } from 'vitest'
import { toBig } from '../shared'
import { gameReducer } from '../game'
import { getRefCount } from '../inventory'
import {
  atFloor,
  expectActionError,
  makeBattleState,
  makeData,
  makeInventory,
  makeMonster,
  makeGameState
} from '../testing'
import type { GameAction, GameState, StackableItemRef } from '../model'

const data = makeData()

const potion: StackableItemRef = { storage: 'stack', itemId: 'potion' }
const ball: StackableItemRef = { storage: 'stack', itemId: 'ball' }
const fast1: StackableItemRef = { storage: 'crystal', traitId: 'fast', level: 1 }
const regen1: StackableItemRef = { storage: 'crystal', traitId: 'regen', level: 1 }

/** State ở thị trấn, cửa hàng bán potion và tinh thể fast / regen cấp 1. */
function shopState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...makeGameState({ seed: 1, money: 1000, party: [makeMonster({ id: 'a' })] }),
    shop: { stock: [potion, fast1, regen1] },
    ...overrides
  }
}

const run = (state: GameState, action: GameAction): GameState => gameReducer(data, state, action)
const buy = (state: GameState, item: unknown, count: unknown): GameState =>
  // Ép kiểu để giả lập action sai dạng từ UI.
  run(state, { type: 'buyItem', item, count } as GameAction)
const sell = (state: GameState, item: unknown, count: unknown): GameState =>
  run(state, { type: 'sellItem', item, count } as GameAction)

describe('buyItem', () => {
  it('mua vật phẩm: trừ price × số lượng, thêm vào túi, không sửa state cũ', () => {
    const state = shopState()
    const next = buy(state, potion, 3)
    expect(next.money.toNumber()).toBe(1000 - 3 * 50)
    expect(next.inventory.stacks.potion).toBe(3)
    expect(state.inventory.stacks.potion).toBeUndefined()
    // Không giới hạn số lượng mỗi món: danh sách hàng giữ nguyên.
    expect(next.shop).toEqual(state.shop)
  })

  it('mua tinh thể: 2 × giá extract cấp 1 (rare ×3)', () => {
    const next = buy(buy(shopState(), fast1, 2), regen1, 1)
    expect(next.money.toNumber()).toBe(1000 - 2 * 200 - 600)
    expect(getRefCount(next.inventory, fast1)).toBe(2)
    expect(getRefCount(next.inventory, regen1)).toBe(1)
  })

  it('đủ tiền vừa đúng thì mua được', () => {
    const next = buy(shopState({ money: toBig(200) }), potion, 4)
    expect(next.money.isZero()).toBe(true)
  })

  it('món không có trong hàng: notInShop', () => {
    expectActionError(() => buy(shopState(), ball, 1), 'notInShop')
    expectActionError(() => buy(shopState(), { ...fast1, level: 2 }, 1), 'notInShop')
    expectActionError(() => buy(shopState({ shop: { stock: [] } }), potion, 1), 'notInShop')
  })

  it('thiếu tiền: notEnoughMoney, state giữ nguyên', () => {
    const state = shopState({ money: toBig(149) })
    expectActionError(() => buy(state, potion, 3), 'notEnoughMoney', {
      need: toBig(150),
      have: toBig(149)
    })
    expect(state.inventory.stacks).toEqual({})
  })

  it('không ở thị trấn / đang trong trận', () => {
    expectActionError(() => buy(atFloor(shopState(), 1), potion, 1), 'notInTown')
    const inBattle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    expectActionError(() => buy({ ...inBattle, shop: { stock: [potion] } }, potion, 1), 'inBattle')
  })

  it('số lượng sai dạng và định danh sai', () => {
    for (const count of [0, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
      expectActionError(() => buy(shopState(), potion, count), 'malformedAction')
    }
    expectActionError(() => buy(shopState(), { storage: 'stack' }, 1), 'malformedAction')
    expectActionError(() => buy(shopState(), { storage: 'stack', itemId: 'x' }, 1), 'unknownItem')
  })

  it('số lượng cực lớn: vừa tới MAX_SAFE_INTEGER thì được, vượt 1 thì stackLimitReached', () => {
    const max = Number.MAX_SAFE_INTEGER
    const rich = shopState({ money: toBig('1e30'), inventory: makeInventory({ potion: 10 }) })
    const full = buy(rich, potion, max - 10)
    expect(full.inventory.stacks.potion).toBe(max)
    expect(full.money.eq(toBig('1e30').minus(toBig(max - 10).times(50)))).toBe(true)
    expectActionError(() => buy(rich, potion, max - 9), 'stackLimitReached', { max })
    expectActionError(() => buy(full, potion, 1), 'stackLimitReached')
    const crystals = shopState({
      money: toBig('1e30'),
      inventory: makeInventory({}, [{ traitId: 'fast', level: 1, count: max }])
    })
    expectActionError(() => buy(crystals, fast1, 1), 'stackLimitReached')
  })
})

describe('sellItem', () => {
  const stocked = (): GameState =>
    shopState({
      inventory: makeInventory({ potion: 5, masterBall: 1 }, [
        { traitId: 'immunity', level: 3, count: 2 }
      ])
    })

  it('bán vật phẩm: nhận 50% price mỗi món, làm tròn xuống', () => {
    const next = sell(sell(stocked(), potion, 2), { storage: 'stack', itemId: 'masterBall' }, 1)
    expect(next.money.toNumber()).toBe(1000 + 2 * 25 + 499)
    expect(next.inventory.stacks).toEqual({ potion: 3 })
  })

  it('bán được cả món không có trong danh sách hàng', () => {
    const next = sell(stocked(), { storage: 'stack', itemId: 'masterBall' }, 1)
    expect(next.inventory.stacks.masterBall).toBeUndefined()
  })

  it('bán tinh thể: 50% giá extract theo cấp và loại', () => {
    const immunity3: StackableItemRef = { storage: 'crystal', traitId: 'immunity', level: 3 }
    const next = sell(stocked(), immunity3, 2)
    // Giá extract rare cấp 3 = 100 × 9 × 3 = 2700, bán 1350 mỗi tinh thể.
    expect(next.money.toNumber()).toBe(1000 + 2 * 1350)
    expect(next.inventory.crystals).toEqual([])
  })

  it('bán số lượng cực lớn: tiền là Decimal, không mất chính xác', () => {
    const max = Number.MAX_SAFE_INTEGER
    const state = shopState({ money: toBig(0), inventory: makeInventory({ potion: max }) })
    const next = sell(state, potion, max)
    expect(next.money.eq(toBig(max).times(25))).toBe(true)
  })

  it('không đủ hàng / không ở thị trấn / trong trận / sai dạng', () => {
    expectActionError(() => sell(stocked(), potion, 6), 'notEnoughItem', { have: 5, need: 6 })
    expectActionError(() => sell(stocked(), fast1, 1), 'notEnoughCrystals')
    expectActionError(() => sell(atFloor(stocked(), 1), potion, 1), 'notInTown')
    const inBattle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    expectActionError(() => sell(inBattle, potion, 1), 'inBattle')
    expectActionError(() => sell(stocked(), potion, 0), 'malformedAction')
    expectActionError(
      () => sell(stocked(), { storage: 'crystal', traitId: 'shiny', level: 1 }, 1),
      'malformedAction'
    )
  })
})

describe('giá theo tầng cao nhất đã mở', () => {
  const atHighest = (highestFloor: number): GameState => ({
    ...shopState(),
    highestFloor,
    shop: { stock: [potion, fast1] }
  })

  it('mua / bán vật phẩm theo price × highestFloor; tinh thể không nhân tầng', () => {
    const bought = buy(atHighest(4), potion, 2)
    expect(bought.money.toNumber()).toBe(1000 - 2 * 50 * 4)
    expect(sell(bought, potion, 1).money.toNumber()).toBe(1000 - 400 + 100)
    expect(buy(atHighest(4), fast1, 1).money.toNumber()).toBe(1000 - 200)
  })

  it('bán bùa fuse: 50% giá cửa hàng lúc bán', () => {
    const state = { ...atHighest(3), inventory: makeInventory({ fusionCharm: 1 }) }
    expect(sell(state, { storage: 'stack', itemId: 'fusionCharm' }, 1).money.toNumber()).toBe(
      1000 + 3000
    )
  })
})
