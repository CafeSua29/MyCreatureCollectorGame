import { describe, expect, it } from 'vitest'
import { createRng, toBig } from '../shared'
import { gameReducer } from '../game'
import {
  expectActionError,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeMonster
} from '../testing'
import type { GameState, ItemRef } from '../model'
import { rollShopStock } from './shopStock'
import { validateShop } from './validateShop'

const data = makeEquipmentData()
// Kiếm common: price 100 × 1 × tầng; epic × 10.
const shopSword = makeEquipment({
  id: 'e5',
  rarity: 'epic',
  rolls: [{ lineId: 'main', value: 40 }]
})
const bagSword = makeEquipment({ id: 'e1' })
const instanceRef = (instanceId: string): ItemRef => ({ storage: 'instance', instanceId })

function shopState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...makeGameState({ seed: 1, money: 10_000, party: [makeMonster({ id: 'a' })] }),
    shop: { stock: [{ storage: 'instance', instance: shopSword }] },
    inventory: makeInventory({}, [], [bagSword]),
    nextItemId: 6,
    ...overrides
  }
}

describe('mua / bán / vứt trang bị', () => {
  it('mua món trong danh sách: trả giá theo bậc, món vào túi và mất khỏi danh sách', () => {
    const next = gameReducer(data, shopState(), {
      type: 'buyItem',
      item: instanceRef('e5'),
      count: 1
    })
    expect(next.money.toNumber()).toBe(10_000 - 1000)
    expect(next.inventory.equipment).toEqual([bagSword, shopSword])
    expect(next.shop.stock).toEqual([])
  })

  it('mua: không có trong danh sách, số lượng khác 1, thiếu tiền', () => {
    const state = shopState()
    expectActionError(
      () => gameReducer(data, state, { type: 'buyItem', item: instanceRef('e1'), count: 1 }),
      'notInShop'
    )
    expectActionError(
      () => gameReducer(data, state, { type: 'buyItem', item: instanceRef('e5'), count: 2 }),
      'malformedAction'
    )
    expectActionError(
      () =>
        gameReducer(data, shopState({ money: toBig(999) }), {
          type: 'buyItem',
          item: instanceRef('e5'),
          count: 1
        }),
      'notEnoughMoney'
    )
  })

  it('bán món trong túi: 50% giá theo bậc × tầng; không có món thì equipmentNotFound', () => {
    const state = shopState({ highestFloor: 3, floorBiomeIds: ['field', 'lair', 'pairs'] })
    const next = gameReducer(data, state, { type: 'sellItem', item: instanceRef('e1'), count: 1 })
    expect(next.money.toNumber()).toBe(10_000 + 150)
    expect(next.inventory.equipment).toEqual([])
    expectActionError(
      () => gameReducer(data, next, { type: 'sellItem', item: instanceRef('e1'), count: 1 }),
      'equipmentNotFound',
      { instanceId: 'e1' }
    )
  })

  it('vứt món trong túi ở đâu cũng được; instanceId sai dạng là malformedAction', () => {
    const next = gameReducer(data, shopState(), {
      type: 'discardItem',
      item: instanceRef('e1'),
      count: 1
    })
    expect(next.inventory.equipment).toEqual([])
    expectActionError(
      () =>
        gameReducer(data, shopState(), {
          type: 'discardItem',
          item: { storage: 'instance', instanceId: 5 } as never,
          count: 1
        }),
      'malformedAction'
    )
  })
})

describe('danh sách hàng có trang bị', () => {
  it('trang bị shop: true thành món đã random sẵn, bậc tối đa epic, id từ nextItemId', () => {
    const swordOnly = makeEquipmentData((raw) => {
      for (const item of raw.items) {
        if (item.category !== 'equipment' && 'price' in item) {
          delete item.shop
          delete item.shopWeight
        }
      }
      raw.config.shop = {
        ...raw.config.shop,
        crystalWeights: { positive: 0, negative: 0, rare: 0 }
      }
    })
    const rarities = new Set<string>()
    for (let seed = 0; seed < 200; seed++) {
      const roll = rollShopStock(swordOnly, createRng(seed), {
        highestFloor: 1,
        options: { lifespanEnabled: false, permadeathEnabled: false },
        nextItemId: 7,
        inventory: { stacks: {}, crystals: [], books: [], equipment: [], souls: [] }
      })
      expect(roll.stock).toHaveLength(1)
      const [entry] = roll.stock
      if (entry.storage !== 'instance') throw new Error('phải là món trang bị')
      expect(entry.instance.id).toBe('e7')
      expect(entry.instance.baseItemId).toBe('sword')
      expect(roll.nextItemId).toBe(8)
      rarities.add(entry.instance.rarity)
    }
    expect([...rarities].sort()).toEqual(['common', 'epic', 'rare', 'uncommon'])
  })

  it('validateShop: món trang bị hợp lệ; món hỏng và id trùng báo lỗi kèm đường dẫn', () => {
    expect(validateShop(data, shopState().shop)).toEqual([])
    const broken = {
      stock: [
        { storage: 'instance', instance: shopSword },
        { storage: 'instance', instance: shopSword },
        { storage: 'instance', instance: { ...shopSword, baseItemId: 'potion' } },
        { storage: 'instance', instanceId: 'e5' }
      ]
    }
    expect(validateShop(data, broken)).toEqual([
      'shop.stock[1]: trùng món',
      'shop.stock[2].instance.baseItemId: trang bị không tồn tại "potion"',
      // Món trang bị trong danh sách phải kèm nội dung món, không chỉ id.
      'shop.stock[3].instance: không phải món trang bị hợp lệ'
    ])
  })
})
