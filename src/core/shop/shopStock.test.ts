import { describe, expect, it } from 'vitest'
import { rawGameData } from '@data'
import { createRng, type RngState } from '../shared'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { isSameItemRef, shopEntryRef } from '../inventory'
import { makeData, makeMonster, makeRawData, makeGameState } from '../testing'
import { enterTown, rollShopStock } from './shopStock'
import type { GameData, RawGameData, ShopEntry } from '../model'

const data = makeData()

function dataWith(edit: (raw: RawGameData) => void): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(raw)
}

/** Bỏ mọi vật phẩm khỏi cửa hàng (chỉ còn tinh thể). */
function removeShopItems(raw: RawGameData): void {
  for (const item of raw.items) {
    if (!('price' in item)) continue
    delete item.shop
    delete item.shopWeight
  }
}

/** Random hàng ở tầng 1, bộ đếm id món từ 1; trả [hàng, RNG] cho gọn. */
function rollStock(gameData: GameData, rng: RngState): [ShopEntry[], RngState] {
  const { stock, rng: next } = rollShopStock(gameData, rng, {
    highestFloor: 1,
    options: { lifespanEnabled: false },
    nextItemId: 1,
    inventory: { stacks: {}, crystals: [], books: [], equipment: [], souls: [] }
  })
  return [stock, next]
}

const key = (entry: ShopEntry): string => {
  if (entry.storage === 'stack') return entry.itemId
  if (entry.storage === 'crystal') return `${entry.traitId}#${entry.level}`
  if (entry.storage === 'book') return `book:${entry.skillId}#${entry.reusable}`
  return entry.instance.baseItemId
}

/** Gom số lần xuất hiện của mỗi món qua nhiều seed. */
function countAppearances(gameData: GameData, seeds: number): Map<string, number> {
  const counts = new Map<string, number>()
  for (let seed = 0; seed < seeds; seed++) {
    const [stock] = rollStock(gameData, createRng(seed))
    for (const ref of stock) counts.set(key(ref), (counts.get(key(ref)) ?? 0) + 1)
  }
  return counts
}

describe('rollShopStock', () => {
  it('cùng RNG cho cùng danh sách, không trùng món', () => {
    const rng = createRng(42)
    const [first, rngAfter] = rollStock(data, rng)
    const [second] = rollStock(data, rng)
    expect(second).toEqual(first)
    expect(rngAfter).not.toBe(rng)
    expect(first).toHaveLength(3)
    for (let seed = 0; seed < 50; seed++) {
      const [stock] = rollStock(data, createRng(seed))
      const unique = stock.filter(
        (ref, i) => stock.findIndex((o) => isSameItemRef(shopEntryRef(o), shopEntryRef(ref))) === i
      )
      expect(unique).toEqual(stock)
    }
  })

  it('chỉ có vật phẩm shop: true và tinh thể cấp 1 của trait positive / negative / rare', () => {
    const counts = countAppearances(data, 300)
    const allowedItems = ['potion', 'antidote', 'ball']
    for (const name of counts.keys()) {
      if (!name.includes('#')) {
        expect(allowedItems).toContain(name)
        continue
      }
      const [traitId, level] = name.split('#')
      expect(level).toBe('1')
      expect(['shiny', 'bossBlood']).not.toContain(traitId)
    }
    // Ngẫu nhiên tối đa: mọi món có trọng số đều có cơ hội.
    for (const traitId of ['fast', 'slow', 'regen', 'immunity']) {
      expect(counts.get(`${traitId}#1`) ?? 0).toBeGreaterThan(0)
    }
    for (const itemId of allowedItems) expect(counts.get(itemId) ?? 0).toBeGreaterThan(0)
  })

  it('trọng số tinh thể là tổng của loại, chia đều cho các trait trong loại', () => {
    // Chỉ bán tinh thể, 1 món: positive (3 trait) tổng 10, negative (2 trait) tổng 10, rare 0.
    const gameData = dataWith((raw) => {
      removeShopItems(raw)
      raw.config.shop = {
        ...raw.config.shop,
        stockMin: 1,
        stockMax: 1,
        crystalWeights: { positive: 10, negative: 10, rare: 0 }
      }
    })
    const counts = countAppearances(gameData, 3000)
    const ofKind = (ids: string[]): number =>
      ids.reduce((sum, id) => sum + (counts.get(`${id}#1`) ?? 0), 0)
    const positive = ofKind(['fast', 'armored', 'mighty'])
    const negative = ofKind(['slow', 'cursed'])
    expect(positive / 3000).toBeCloseTo(0.5, 1)
    expect(negative / 3000).toBeCloseTo(0.5, 1)
    expect(ofKind(['regen', 'immunity', 'bruteSlayer', 'thickSkin', 'friendly'])).toBe(0)
  })

  it('số món tung trong [stockMin, stockMax]; ít ứng viên thì lấy hết', () => {
    const ranged = dataWith((raw) => {
      raw.config.shop = { ...raw.config.shop, stockMin: 1, stockMax: 4 }
    })
    const sizes = new Set<number>()
    for (let seed = 0; seed < 200; seed++) sizes.add(rollStock(ranged, createRng(seed))[0].length)
    expect([...sizes].sort()).toEqual([1, 2, 3, 4])

    // 3 vật phẩm + 10 tinh thể = 13 ứng viên < 20 món.
    const big = dataWith((raw) => {
      raw.config.shop = { ...raw.config.shop, stockMin: 20, stockMax: 20 }
    })
    expect(rollStock(big, createRng(1))[0]).toHaveLength(13)
  })

  it('không có ứng viên nào thì danh sách rỗng', () => {
    const empty = dataWith((raw) => {
      removeShopItems(raw)
      raw.config.shop = {
        ...raw.config.shop,
        crystalWeights: { positive: 0, negative: 0, rare: 0 }
      }
    })
    expect(rollStock(empty, createRng(1))[0]).toEqual([])
  })
})

describe('dữ liệu thật', () => {
  it('5–10 món hàng thường (có cả vật phẩm và tinh thể) cộng kệ sách, qua nhiều lần random', () => {
    const real = createGameData(rawGameData)
    const { stockMin, stockMax } = real.config.shop
    const { shopMin, shopMax } = real.config.skillBook
    let crystals = 0
    for (let seed = 0; seed < 100; seed++) {
      const [stock] = rollStock(real, createRng(seed))
      const books = stock.filter((ref) => ref.storage === 'book').length
      expect(books).toBeGreaterThanOrEqual(shopMin)
      expect(books).toBeLessThanOrEqual(shopMax)
      expect(stock.length - books).toBeGreaterThanOrEqual(stockMin)
      expect(stock.length - books).toBeLessThanOrEqual(stockMax)
      crystals += stock.filter((ref) => ref.storage === 'crystal').length
    }
    expect(crystals).toBeGreaterThan(0)
  })
})

describe('vào thị trấn', () => {
  const party = [makeMonster({ id: 'a' })]

  it('enterTown: về thị trấn, random lại hàng, đổi RNG', () => {
    const state = makeGameState({ seed: 7, party, location: { type: 'floor', floor: 1 } })
    const entered = enterTown(data, state)
    expect(entered.location).toEqual({ type: 'town' })
    expect(entered.shop.stock).toEqual(rollStock(data, state.rng)[0])
    expect(entered.rng).not.toBe(state.rng)
  })

  it('travel từ tầng về thị trấn random lại hàng', () => {
    const state = makeGameState({ seed: 7, party, location: { type: 'floor', floor: 1 } })
    const next = gameReducer(data, state, { type: 'travel', to: { type: 'town' } })
    expect(next.shop.stock).toHaveLength(3)
    expect(next.shop.stock).toEqual(rollStock(data, state.rng)[0])
  })

  it('travel thị trấn → thị trấn giữ nguyên hàng và RNG', () => {
    const state = makeGameState({ seed: 7, party })
    const stocked = { ...state, shop: { stock: [{ storage: 'stack', itemId: 'ball' } as const] } }
    const next = gameReducer(data, stocked, { type: 'travel', to: { type: 'town' } })
    expect(next.shop).toEqual(stocked.shop)
    expect(next.rng).toBe(stocked.rng)
  })

  it('travel lên tầng không đổi hàng', () => {
    const state = makeGameState({ seed: 7, party })
    const next = gameReducer(data, state, { type: 'travel', to: { type: 'floor', floor: 1 } })
    expect(next.shop).toEqual(state.shop)
    expect(next.rng).toBe(state.rng)
  })
})
