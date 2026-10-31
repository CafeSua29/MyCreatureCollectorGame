import { describe, expect, it } from 'vitest'
import { addEquipment, addItems, getItemCount, toBig, type GameState, type Monster } from '@core'
import {
  makeEquipment,
  makeEquipmentData,
  makeEventData,
  makeGameState,
  makeMonster,
  makeTransformData,
  makeZMoveData
} from '@core/testing'
import {
  bindBondWhenPossible,
  buyFromTempShop,
  buyPlotWhenCheap,
  expandCapacityWhenFull,
  holdCritItems,
  holdMegaStones,
  holdZCrystals,
  newEconomyCount,
  sellSurplus
} from './economy'

const town = (overrides: Partial<GameState> = {}): GameState => ({
  ...makeGameState({ seed: 2, party: [makeMonster({ id: 'h' })], money: 1_000_000 }),
  ...overrides
})

describe('economy: bán đồ dư', () => {
  it('bán trang bị trong túi và nguyên liệu quá materialKeep; cửa hàng đóng thì không bán', () => {
    const data = makeEquipmentData()
    const base = town()
    const state = { ...base, inventory: addEquipment(base.inventory, makeEquipment({ id: 'e1' })) }
    const count = newEconomyCount()
    const sold = sellSurplus(data, state, count)
    expect(sold.inventory.equipment).toEqual([])
    expect(sold.money.gt(state.money)).toBe(true)
    expect(count.itemsSold).toBe(1)
    const closed = { ...state, events: { ...state.events, shopClosedUntilDay: 99 } }
    expect(sellSurplus(data, closed, newEconomyCount())).toBe(closed)
  })
})

describe('economy: cửa hàng tạm', () => {
  it('mua món dùng được ở cửa hàng tạm tại chỗ đang đứng, trong giới hạn tiền', () => {
    const data = makeEventData()
    const base = town()
    const shop = {
      stock: [{ entry: { storage: 'stack' as const, itemId: 'potion' }, remaining: 5 }],
      priceMultiplier: 1,
      floor: null
    }
    const state = { ...base, events: { ...base.events, tempShop: shop } }
    const count = newEconomyCount()
    const after = buyFromTempShop(data, state, count)
    expect(getItemCount(after.inventory, 'potion')).toBe(3)
    expect(count.tempShopBought).toBe(3)
    const poor = { ...state, money: toBig(0) }
    expect(buyFromTempShop(data, poor, newEconomyCount())).toBe(poor)
  })
})

describe('economy: đá Mega, Z-Crystal, ô linh điền', () => {
  it('có Vòng Mega thì quái cầm đá Mega của loài nó', () => {
    const data = makeTransformData()
    const monster: Monster = makeMonster({ id: 'h' })
    const base = town({ party: [monster] })
    const withStone = {
      ...base,
      inventory: addItems(addItems(base.inventory, 'weaklingite', 1), 'megaRing', 1)
    }
    const count = newEconomyCount()
    const after = holdMegaStones(data, withStone, new Set(['h']), count)
    expect(after.party[0].equipment).toContainEqual({ storage: 'stack', itemId: 'weaklingite' })
    expect(count.megaStonesHeld).toBe(1)
    // Đã cầm thì không cầm lại.
    expect(holdMegaStones(data, after, new Set(['h']), newEconomyCount())).toBe(after)
  })

  it('có Vòng Z thì quái cầm Z-Crystal hợp skill có trong túi; không Vòng Z / không crystal thì không', () => {
    const data = makeZMoveData()
    const monster: Monster = makeMonster({ id: 'h', skillIds: ['strike'] })
    const base = town({ party: [monster] })
    const bag = addItems(base.inventory, 'normalZCrystal', 1)
    const count = newEconomyCount()
    const noRing = { ...base, inventory: bag }
    expect(holdZCrystals(data, noRing, new Set(['h']), count)).toBe(noRing)
    const ringed = { ...base, inventory: addItems(bag, 'zRing', 1) }
    const after = holdZCrystals(data, ringed, new Set(['h']), count)
    expect(after.party[0].equipment).toContainEqual({ storage: 'stack', itemId: 'normalZCrystal' })
    expect(count.zCrystalsHeld).toBe(1)
    expect(holdZCrystals(data, after, new Set(['h']), newEconomyCount())).toBe(after)
    const empty = { ...base, inventory: addItems(base.inventory, 'zRing', 1) }
    expect(holdZCrystals(data, empty, new Set(['h']), newEconomyCount())).toBe(empty)
  })

  it('mua đồ cầm chí mạng tốt nhất cửa hàng đang bán cho quái đúng loài, cầm vào ô trống', () => {
    const data = makeEquipmentData((raw) => {
      raw.items.push(
        {
          id: 'claw',
          category: 'held',
          price: 10,
          hooks: [{ type: 'critStage', params: { stages: 1 } }],
          persistent: true
        },
        {
          id: 'leekOther',
          category: 'held',
          price: 10,
          hooks: [{ type: 'critStage', params: { stages: 2 } }],
          persistent: true,
          speciesIds: ['strongling']
        }
      )
    })
    const stock = ['claw', 'leekOther'].map((itemId) => ({ storage: 'stack' as const, itemId }))
    const base = town({ shop: { stock } })
    const count = newEconomyCount()
    const after = holdCritItems(data, base, new Set(['h']), count)
    // Quái h (weakling) không hợp Leek của strongling: cầm claw.
    expect(after.party[0].equipment).toEqual([{ storage: 'stack', itemId: 'claw' }])
    expect(after.money.lt(base.money)).toBe(true)
    expect(count.critItemsHeld).toBe(1)
    expect(holdCritItems(data, after, new Set(['h']), newEconomyCount())).toBe(after)
    const poor = town({ shop: { stock }, money: toBig(0) })
    expect(holdCritItems(data, poor, new Set(['h']), newEconomyCount())).toBe(poor)
  })

  it('mua ô linh điền khi giá ≤ plotSpendFraction tiền', () => {
    const data = makeEventData()
    const count = newEconomyCount()
    const rich = town()
    const after = buyPlotWhenCheap(data, rich, count)
    expect(after.garden.plots.length).toBe(rich.garden.plots.length + 1)
    const poor = town({ money: toBig(0) })
    expect(buyPlotWhenCheap(data, poor, newEconomyCount())).toBe(poor)
  })
})

describe('economy: bản mệnh thú', () => {
  it('chưa có bản mệnh: kết với quái đội mẫu đủ thân mật mạnh nhất; đã có thì thôi', () => {
    const data = makeEventData()
    const weak = makeMonster({ id: 'w', affinity: 250 })
    const strong = makeMonster({ id: 's', affinity: 250, level: 40 })
    const shy = makeMonster({ id: 'x', affinity: 10, level: 90 })
    const state = town({ party: [weak, strong, shy] })
    const count = newEconomyCount()
    const bound = bindBondWhenPossible(data, state, new Set(['w', 's', 'x']), count)
    expect(bound.party.find((m) => m.bond)?.id).toBe('s')
    expect(count.bondsBound).toBe(1)
    expect(bindBondWhenPossible(data, bound, new Set(['w', 's', 'x']), count)).toBe(bound)
  })
})

describe('economy: sức chứa', () => {
  it('còn ≤ capacityMargin chỗ thì mở rộng khi đủ tiền; ghi chỗ dùng cao nhất', () => {
    const data = makeEquipmentData((raw) => {
      raw.config.capacity.bag = { ...raw.config.capacity.bag, base: 6, realmBonus: 0 }
    })
    const bag = ['e1', 'e2'].reduce(
      (inventory, id) => addEquipment(inventory, makeEquipment({ id })),
      town().inventory
    )
    const count = newEconomyCount()
    const next = expandCapacityWhenFull(data, town({ inventory: bag }), count)
    expect(next.capacity).toEqual({ storage: 0, bag: 1 })
    expect(count).toMatchObject({ capacityExpansions: 1, bagPeak: 2, storagePeak: 0 })
    const poor = town({ inventory: bag, money: toBig(100) })
    expect(expandCapacityWhenFull(data, poor, newEconomyCount()).capacity.bag).toBe(0)
  })
})
