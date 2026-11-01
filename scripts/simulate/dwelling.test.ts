import { describe, expect, it } from 'vitest'
import { createGameData, toBig, type GameState } from '@core'
import {
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText
} from '@core/testing'
import { runDwelling } from './dwelling'
import { newEconomyCount } from './economy'

const raw = makeRawData()
raw.items.push({ id: 'ore', category: 'material', price: 1 })
raw.buildings.push({
  id: 'forge',
  workType: 'kindling',
  startLevel: 0,
  slotsPerLevel: 1,
  cost: { money: 100, moneyGrowth: 2, items: [{ itemId: 'ore', count: 1 }] },
  effect: { type: 'produce', drops: [{ itemId: 'ore', perDay: 1 }] }
})
const data = createGameData(withFixtureText(raw))

describe('runDwelling', () => {
  it('lấy đồ, nâng công trình rẻ nhất trong ngân sách, giao quái có thiên phú đúng việc', () => {
    const base = makeGameState({ seed: 1, party: [makeMonster({ id: 'p' })] })
    const state: GameState = {
      ...base,
      money: toBig(1000),
      inventory: makeInventory({}),
      storage: [
        makeMonster({ id: 'grass', level: 50 }),
        makeMonster({ id: 'fire', level: 5, elementIds: ['fire'] })
      ],
      dwelling: { ...base.dwelling, storage: { stacks: { ore: 3 }, books: [] } }
    }
    const count = newEconomyCount()
    const next = runDwelling(data, state, count)
    expect(count).toMatchObject({ dwellingItems: 3, buildingUpgrades: 1, workersAssigned: 1 })
    // Linh điền (5000) quá ngân sách 20%: nâng Lò (100). Quái cỏ không có thiên phú luyện.
    expect(next.dwelling.buildings.forge).toEqual({ level: 1, workers: ['fire'] })
    expect(next.inventory.stacks.ore).toBe(3)
    // Bậc 2 cần 1 quặng (có 3) nhưng 200 > 20% của 900: lần sau không đổi gì.
    expect(runDwelling(data, next, newEconomyCount())).toBe(next)
  })
})

describe('runDwelling: hộp thức ăn', () => {
  it('có quái làm việc thì nấu Thức ăn linh thú đủ 7 ngày đói rồi bỏ hết vào hộp', () => {
    const feedRaw = makeRawData()
    feedRaw.items.push(
      { id: 'ore', category: 'material', price: 1 },
      { id: 'beastFeed', category: 'material', price: 1 }
    )
    feedRaw.recipes.push({
      id: 'beastFeed',
      station: 'cooking',
      output: { itemId: 'beastFeed', count: 5 },
      inputs: [{ itemId: 'ore', count: 1 }],
      money: 0,
      minLevel: 1,
      successChance: 100,
      exp: 1
    })
    feedRaw.config.dwelling = {
      ...feedRaw.config.dwelling,
      foods: { beastFeed: { fullness: 40, sanity: 0 } }
    }
    const feedData = createGameData(withFixtureText(feedRaw))
    const base = makeGameState({ seed: 1, party: [makeMonster({ id: 'p' })] })
    const state: GameState = {
      ...base,
      inventory: makeInventory({ ore: 10 }),
      storage: [makeMonster({ id: 'w', assignment: { kind: 'dwelling', id: 'field' } })]
    }
    const count = newEconomyCount()
    const next = runDwelling(feedData, state, count)
    // 1 quái × 7 ngày × 30 đói = 210 no → 6 món → nấu 2 lần (10 món), bỏ hết.
    expect(next.dwelling.feedBox).toEqual({ beastFeed: 10 })
    expect(count.feedStocked).toBe(10)
  })
})

describe('runDwelling: bệnh', () => {
  const sickRaw = makeRawData()
  sickRaw.ailments.push({ id: 'sprain', weight: 1, causes: ['work'], workPercent: 70, cureTier: 1 })
  sickRaw.items.push({
    id: 'med',
    category: 'consumable',
    price: 1,
    use: 'field',
    target: 'ally',
    effects: [{ type: 'cureAilment', params: { tier: 1 } }]
  })
  sickRaw.buildings.push({
    id: 'forge',
    workType: 'kindling',
    startLevel: 1,
    slotsPerLevel: 1,
    cost: { money: 1e9, moneyGrowth: 1, items: [] },
    effect: { type: 'produce', drops: [{ itemId: 'potion', perDay: 0 }] }
  })
  const sickData = createGameData(withFixtureText(sickRaw))
  const sickState = (stacks: Record<string, number>): GameState => {
    const base = makeGameState({ seed: 1, party: [makeMonster({ id: 'p' })] })
    return {
      ...base,
      inventory: makeInventory(stacks),
      storage: [
        makeMonster({
          id: 'w',
          assignment: { kind: 'dwelling', id: 'forge' },
          ailment: { id: 'sprain', restDays: 0 }
        })
      ],
      dwelling: {
        ...base.dwelling,
        buildings: { ...base.dwelling.buildings, forge: { level: 1, workers: ['w'] } }
      }
    }
  }

  it('có thuốc trong túi thì chữa; không có thì cho nghỉ việc (không giao lại khi còn bệnh)', () => {
    const count = newEconomyCount()
    const cured = runDwelling(sickData, sickState({ med: 1 }), count)
    expect(cured.storage[0].ailment).toBeNull()
    expect(count).toMatchObject({ sickWorkers: 1, ailmentsCured: 1 })
    const restCount = newEconomyCount()
    const rested = runDwelling(sickData, sickState({}), restCount)
    expect(rested.storage[0].assignment).toBeNull()
    expect(rested.dwelling.buildings.forge.workers).toEqual([])
    expect(restCount.sickRested).toBe(1)
  })

  it('cửa hàng bán thuốc thì mua sẵn 2 viên dự phòng rồi chữa quái trong đội bị chấn thương', () => {
    const base = sickState({})
    const state: GameState = {
      ...base,
      money: toBig(1000),
      shop: { stock: [{ storage: 'stack', itemId: 'med' }] },
      party: [makeMonster({ id: 'p', ailment: { id: 'sprain', restDays: 0 } })],
      storage: []
    }
    const count = newEconomyCount()
    const next = runDwelling(sickData, state, count)
    expect(next.party[0].ailment).toBeNull()
    expect(next.inventory.stacks.med).toBe(1)
    expect(count.ailmentsCured).toBe(1)
  })
})
