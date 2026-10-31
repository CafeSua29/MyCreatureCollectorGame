import { describe, expect, it } from 'vitest'
import { makeData } from '../testing'
import { toBig } from '../shared'
import { crystalExtractCost, itemBasePrice, itemBuyPrice, itemSellPrice } from './itemPrices'
import type { StackableItemRef } from '../model'

const data = makeData()

const stack = (itemId: string): StackableItemRef => ({ storage: 'stack', itemId })
const crystal = (traitId: string, level: number): StackableItemRef => ({
  storage: 'crystal',
  traitId,
  level
})

describe('crystalExtractCost', () => {
  it('extractCostBase × cấp² × hệ số loại (positive / negative ×1, rare ×3)', () => {
    expect(crystalExtractCost(data, 'fast', 1).toNumber()).toBe(100)
    expect(crystalExtractCost(data, 'cursed', 3).toNumber()).toBe(900)
    expect(crystalExtractCost(data, 'regen', 2).toNumber()).toBe(1200)
  })

  it('cấp cực lớn không tràn số (Decimal)', () => {
    const cost = crystalExtractCost(data, 'regen', Number.MAX_SAFE_INTEGER)
    expect(cost.isFinite()).toBe(true)
    expect(cost.gt(Number.MAX_SAFE_INTEGER)).toBe(true)
  })

  it('trait không có tinh thể: lỗi lập trình', () => {
    expect(() => crystalExtractCost(data, 'shiny', 1)).toThrow(/không có tinh thể/)
  })
})

describe('giá gốc, giá bán, giá mua', () => {
  it('vật phẩm tầng 1: giá gốc = price, mua = price, bán = 50% làm tròn xuống', () => {
    expect(itemBasePrice(data, stack('potion'), 1).toNumber()).toBe(50)
    expect(itemBuyPrice(data, stack('potion'), 1).toNumber()).toBe(50)
    expect(itemSellPrice(data, stack('potion'), 1).toNumber()).toBe(25)
    // price 1 → bán 0,5 → 0.
    expect(itemSellPrice(data, stack('dudBomb'), 1).toNumber()).toBe(0)
    // price 999 → 499.
    expect(itemSellPrice(data, stack('masterBall'), 1).toNumber()).toBe(499)
  })

  it('giá nhân tầng cao nhất đã mở (cả bùa fuse); bán 50% giá lúc bán', () => {
    expect(itemBuyPrice(data, stack('potion'), 7).toNumber()).toBe(350)
    expect(itemSellPrice(data, stack('potion'), 7).toNumber()).toBe(175)
    expect(itemBuyPrice(data, stack('fusionCharm'), 3).toNumber()).toBe(6000)
    expect(itemSellPrice(data, stack('fusionAmulet'), 2).toNumber()).toBe(10_000)
    // price 1 tầng 3 → bán 1,5 → 1.
    expect(itemSellPrice(data, stack('dudBomb'), 3).toNumber()).toBe(1)
  })

  it('fixedPrice: không nhân tầng', () => {
    expect(itemBuyPrice(data, stack('fireStone'), 1).toNumber()).toBe(500)
    expect(itemBuyPrice(data, stack('fireStone'), 1000).toNumber()).toBe(500)
    expect(itemSellPrice(data, stack('fireStone'), 1000).toNumber()).toBe(250)
  })

  it('tầng cực lớn: giá hữu hạn, đúng (Decimal)', () => {
    const price = itemBuyPrice(data, stack('potion'), Number.MAX_SAFE_INTEGER)
    expect(price.isFinite()).toBe(true)
    expect(price.eq(toBig(Number.MAX_SAFE_INTEGER).times(50))).toBe(true)
  })

  it('tinh thể: không nhân tầng; mua = 2 × giá extract, bán = 50% giá extract', () => {
    expect(itemBuyPrice(data, crystal('fast', 1), 1).toNumber()).toBe(200)
    expect(itemBuyPrice(data, crystal('fast', 1), 50).toNumber()).toBe(200)
    expect(itemSellPrice(data, crystal('fast', 1), 1).toNumber()).toBe(50)
    expect(itemBuyPrice(data, crystal('immunity', 1), 1).toNumber()).toBe(600)
    expect(itemSellPrice(data, crystal('immunity', 2), 1).toNumber()).toBe(600)
  })
})
