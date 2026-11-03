// Thao tác item hàng loạt (docs/rules/bulk-actions.md): lọc túi, vứt nhiều dòng trong một action.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import {
  expectActionError,
  makeBattleState,
  makeData,
  makeEquipment,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import type { GameAction, GameState, Inventory } from '../model'
import { filterBagItems, type BagItemQuery } from './bulkItems'

const data = makeData()

const bag = (): Inventory =>
  makeInventory(
    { potion: 3, megaRing: 1 },
    [
      { traitId: 'fast', level: 1, count: 2 },
      { traitId: 'fast', level: 4, count: 1 },
      { traitId: 'regen', level: 2, count: 5 }
    ],
    [
      makeEquipment({ id: 'e1', rarity: 'common', level: 1 }),
      makeEquipment({ id: 'e2', rarity: 'epic', level: 3 })
    ]
  )

const refsOf = (inventory: Inventory, query: BagItemQuery = {}): unknown[] =>
  filterBagItems(data, inventory, query).map((line) => line.item)

describe('filterBagItems', () => {
  it('không lọc: mọi dòng đủ số lượng theo thứ tự túi, bỏ vật phẩm chìa khóa', () => {
    const lines = filterBagItems(data, bag())
    expect(lines).toHaveLength(6)
    expect(lines[0]).toEqual({ item: { storage: 'stack', itemId: 'potion' }, count: 3 })
    expect(lines.some((line) => JSON.stringify(line).includes('megaRing'))).toBe(false)
    expect(lines.at(-1)).toEqual({ item: { storage: 'instance', instanceId: 'e2' }, count: 1 })
  })

  it('theo category, bậc hiếm, trait, cấp', () => {
    expect(refsOf(bag(), { categories: ['equipment'] })).toHaveLength(2)
    expect(refsOf(bag(), { rarities: ['common'] })).toEqual([
      { storage: 'instance', instanceId: 'e1' }
    ])
    expect(refsOf(bag(), { traitIds: ['fast'], maxLevel: 1 })).toEqual([
      { storage: 'crystal', traitId: 'fast', level: 1 }
    ])
    // Cấp áp cho tinh thể và trang bị; item không có cấp bị loại.
    expect(refsOf(bag(), { minLevel: 3 })).toEqual([
      { storage: 'crystal', traitId: 'fast', level: 4 },
      { storage: 'instance', instanceId: 'e2' }
    ])
    expect(refsOf(bag(), { categories: [] })).toEqual([])
  })

  it('túi rỗng: danh sách rỗng', () => {
    expect(filterBagItems(data, makeInventory())).toEqual([])
  })
})

describe('discardItems', () => {
  const potion = { storage: 'stack', itemId: 'potion' }
  const state = (): GameState => ({
    ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
    inventory: bag()
  })
  const discard = (current: GameState, items: unknown): GameState =>
    // Ép kiểu để giả lập action sai dạng từ UI.
    gameReducer(data, current, { type: 'discardItems', items } as GameAction)

  it('vứt mọi dòng của bộ lọc trong một action, không nhận gì', () => {
    const before = state()
    const next = discard(before, filterBagItems(data, before.inventory, { traitIds: ['fast'] }))
    expect(next.inventory.crystals).toEqual([{ traitId: 'regen', level: 2, count: 5 }])
    expect(next.money).toEqual(before.money)
    expect(before.inventory.crystals).toHaveLength(3)
  })

  it('số lượng cực lớn', () => {
    const max = Number.MAX_SAFE_INTEGER
    const big = { ...state(), inventory: makeInventory({ potion: max }) }
    expect(discard(big, [{ item: potion, count: max }]).inventory.stacks).toEqual({})
  })

  it('lỗi: một dòng sai thì cả lệnh lỗi; danh sách rỗng / sai dạng; trong trận', () => {
    const keyItem = { storage: 'stack', itemId: 'megaRing' }
    expectActionError(
      () =>
        discard(state(), [
          { item: potion, count: 1 },
          { item: keyItem, count: 1 }
        ]),
      'keyItemLocked'
    )
    expectActionError(
      () =>
        discard(state(), [
          { item: potion, count: 2 },
          { item: potion, count: 2 }
        ]),
      'notEnoughItem'
    )
    for (const items of [[], [null], 'potion']) {
      expectActionError(() => discard(state(), items), 'malformedAction')
    }
    const inBattle = makeBattleState([makeMonster({ id: 'a' })], [makeMonster({ id: 'e' })])
    expectActionError(() => discard(inBattle, [{ item: potion, count: 1 }]), 'inBattle')
  })
})
