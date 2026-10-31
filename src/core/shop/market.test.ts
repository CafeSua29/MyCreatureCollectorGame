// Giá thị trường động (mục "Giá thị trường động" ở world-items.md): tụt theo từng cái, sàn,
// hồi theo ngày, dao động và hàng được giá theo ngày, phạm vi áp dụng, kiểm tra save / dữ liệu.

import { describe, expect, it } from 'vitest'
import { toBig } from '../shared'
import { SAVE_VERSION, gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { advanceTime } from '../progression'
import {
  dataIssuesAfter,
  makeData,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeInventory,
  makeLegacyData,
  makeMonster
} from '../testing'
import {
  HOURS_PER_DAY,
  type GameAction,
  type GameData,
  type GameState,
  type MarketConfig,
  type StackableItemRef
} from '../model'
import { marketDayFactor, marketHotCategory, marketKey, marketSellTotal } from './market'
import { validateMarket } from './validateShop'

/** Thị trường không dao động, không được giá; giá ≤ 100 tụt 0,1 mỗi cái, đắt hơn tụt 0,25. */
const STEEP: MarketConfig = {
  minFactor: 0.3,
  recoveryPerDay: 0.8,
  removeBelow: 0.5,
  dayFactorMin: 1,
  dayFactorMax: 1,
  hotMultiplier: 1,
  dropTiers: [{ maxPrice: 100, dropPerUnit: 0.1 }, { dropPerUnit: 0.25 }]
}

function withMarket(market: Partial<MarketConfig> = {}, base: GameData = makeData()): GameData {
  return { ...base, config: { ...base.config, market: { ...STEEP, ...market } } }
}

const data = withMarket()
const potion: StackableItemRef = { storage: 'stack', itemId: 'potion' }
const ball: StackableItemRef = { storage: 'stack', itemId: 'ball' }
const masterBall: StackableItemRef = { storage: 'stack', itemId: 'masterBall' }
const immunity = (level: number): StackableItemRef => ({
  storage: 'crystal',
  traitId: 'immunity',
  level
})

function townState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...makeGameState({ seed: 1, money: 0, party: [makeMonster({ id: 'a' })] }),
    inventory: makeInventory({ potion: 100, ball: 10, masterBall: 5 }, [
      { traitId: 'immunity', level: 3, count: 1 },
      { traitId: 'immunity', level: 1, count: 1 }
    ]),
    shop: { stock: [potion] },
    ...overrides
  }
}

const run = (gameData: GameData, state: GameState, action: GameAction): GameState =>
  gameReducer(gameData, state, action)
const sell = (
  state: GameState,
  item: StackableItemRef,
  count: number,
  gameData = data
): GameState => run(gameData, state, { type: 'sellItem', item, count })

describe('giá bán tụt theo số đã bán', () => {
  it('tính từng cái theo saturation tăng dần, làm tròn xuống từng cái', () => {
    // Potion bán thường 25: hệ số 1; 0,9; 0,8 → 25 + 22 + 20.
    const next = sell(townState(), potion, 3)
    expect(next.money.toNumber()).toBe(67)
    expect(next.market.saturation).toEqual({ potion: 3 })
  })

  it('bán một lần bằng đúng tổng bán lẻ (tiền và saturation)', () => {
    let retail = townState()
    for (let i = 0; i < 12; i++) retail = sell(retail, potion, 1)
    const bulk = sell(townState(), potion, 12)
    expect(bulk.money.eq(retail.money)).toBe(true)
    expect(bulk.market).toEqual(retail.market)
  })

  it('kẹp ở minFactor (không sai lệch số thực ở 1 − 6 × 0,1)', () => {
    // 7 cái đầu: 25 22 20 17 15 12 10 = 121; từ cái thứ 8 hệ số 0,3 → 7 mỗi cái.
    expect(sell(townState(), potion, 20).money.toNumber()).toBe(121 + 13 * 7)
  })

  it('món đắt tụt nhanh hơn (bậc theo price gốc, không nhân tầng)', () => {
    // masterBall price 999 > 100: tụt 0,25 → 499 + ⌊499 × 0,75⌋.
    expect(sell(townState(), masterBall, 2).money.toNumber()).toBe(499 + 374)
    // Ở tầng 3 giá × 3 nhưng vẫn bậc 0,25 (potion 150 không đổi sang bậc đắt).
    const high = { ...townState(), highestFloor: 3, floorBiomeIds: ['field', 'field', 'field'] }
    expect(sell(high, potion, 2).money.toNumber()).toBe(75 + 67)
  })

  it('giá bán thường > 0 thì mỗi cái tối thiểu 1; giá thường 0 thì vẫn 0', () => {
    const lowFloor = withMarket({ minFactor: 0.01, dropTiers: [{ dropPerUnit: 0.5 }] })
    // Ball bán thường 10: 10, 5, rồi ⌊0,1⌋ = 0 → 1.
    expect(sell(townState(), ball, 3, lowFloor).money.toNumber()).toBe(16)
    const dud = townState({ inventory: makeInventory({ dudBomb: 2 }) })
    expect(sell(dud, { storage: 'stack', itemId: 'dudBomb' }, 2).money.toNumber()).toBe(0)
  })

  it('số lượng cực lớn: không lặp từng cái, tiền chính xác, saturation kẹp MAX_SAFE_INTEGER', () => {
    const max = Number.MAX_SAFE_INTEGER
    const state = townState({ inventory: makeInventory({ potion: max }) })
    const next = sell(state, potion, max)
    expect(
      next.money.eq(
        toBig(max - 7)
          .times(7)
          .plus(121)
      )
    ).toBe(true)
    expect(next.market.saturation.potion).toBe(max)
    const again = sell({ ...next, inventory: makeInventory({ potion: 1 }) }, potion, 1)
    expect(again.market.saturation.potion).toBe(max)
  })

  it('mỗi món một key; tinh thể chung key theo trait (mọi cấp)', () => {
    const afterPotion = sell(townState(), potion, 5)
    expect(sell(afterPotion, ball, 1).money.toNumber()).toBe(afterPotion.money.toNumber() + 10)
    // Tinh thể rare cấp 3 = 2700 (bán 1350), cấp 1 = 300 (bán 150, bậc 0,25).
    const crystal3 = sell(townState(), immunity(3), 1)
    expect(crystal3.market.saturation).toEqual({ 'crystal:immunity': 1 })
    expect(sell(crystal3, immunity(1), 1).money.toNumber()).toBe(1350 + 112)
    expect(marketKey(immunity(7))).toBe('crystal:immunity')
  })

  it('giá mua không đổi khi đã bán nhiều', () => {
    const flooded = { ...sell(townState(), potion, 50), money: toBig(1000) }
    const bought = run(data, flooded, { type: 'buyItem', item: potion, count: 2 })
    expect(bought.money.toNumber()).toBe(1000 - 100)
  })

  it('trang bị không áp giá thị trường, không có saturation', () => {
    const equipmentData = withMarket({}, makeEquipmentData())
    const sword = makeEquipment({ id: 'e1' })
    const state = townState({ inventory: makeInventory({}, [], [sword]), nextItemId: 2 })
    const item = { storage: 'instance', instanceId: 'e1' } as const
    const next = run(equipmentData, state, { type: 'sellItem', item, count: 1 })
    // Kiếm common price 100: bán 50 như cũ.
    expect(next.money.toNumber()).toBe(50)
    expect(next.market.saturation).toEqual({})
  })
})

describe('hồi theo ngày', () => {
  const sold = (): GameState => sell(townState(), potion, 10)

  it('mỗi ngày saturation × recoveryPerDay, giá hồi lên', () => {
    const nextDay = advanceTime(data, sold(), HOURS_PER_DAY)
    expect(nextDay.market.saturation.potion).toBeCloseTo(8)
    const twoDays = advanceTime(data, sold(), 2 * HOURS_PER_DAY)
    expect(twoDays.market.saturation.potion).toBeCloseTo(6.4)
    // Chưa qua nửa đêm thì không hồi.
    expect(advanceTime(data, sold(), 1).market).toEqual(sold().market)
    // Ngay sau khi bán: 1 − 10 × 0,1 chạm sàn → 7; hai ngày sau 1 − 0,64 = 0,36 → 9.
    expect(marketSellTotal(data, sold(), potion, 1).toNumber()).toBe(7)
    expect(marketSellTotal(data, twoDays, potion, 1).toNumber()).toBe(9)
  })

  it('dưới removeBelow thì xóa key', () => {
    const state = { ...townState(), market: { saturation: { potion: 0.6, ball: 10 } } }
    const next = advanceTime(data, state, HOURS_PER_DAY)
    expect(next.market.saturation).toEqual({ ball: 8 })
  })
})

describe('dao động ngày và hàng được giá', () => {
  const swinging = withMarket({ dayFactorMin: 0.9, dayFactorMax: 1.1, hotMultiplier: 1.5 })

  it('hệ số ngày tất định, trong [0,9; 1,1], khác nhau giữa các ngày', () => {
    const factors = Array.from({ length: 50 }, (_, day) =>
      marketDayFactor(swinging, day, 'consumable')
    )
    for (const factor of factors) {
      expect(factor).toBeGreaterThanOrEqual(0.9)
      expect(factor).toBeLessThanOrEqual(1.1)
    }
    expect(new Set(factors).size).toBeGreaterThan(40)
    expect(marketDayFactor(swinging, 7, 'ball')).toBe(marketDayFactor(swinging, 7, 'ball'))
    expect(marketDayFactor(swinging, 7, 'ball')).not.toBe(marketDayFactor(swinging, 7, 'held'))
  })

  it('hàng được giá: chỉ category áp giá động có trong dữ liệu, mọi category đều có lượt', () => {
    const hot = new Set(Array.from({ length: 300 }, (_, day) => marketHotCategory(data, day)))
    const present = new Set(Object.values(data.items).map((item) => item.category))
    present.delete('keyItem')
    present.delete('equipment')
    // Bùa không bán lại được (fixture có cần câu / cuốc, docs/rules/gathering.md).
    present.delete('charm')
    expect(hot).toEqual(present)
    expect(marketHotCategory(data, 9)).toBe(marketHotCategory(data, 9))
    expect(marketHotCategory({ ...data, items: {} }, 0)).toBeNull()
  })

  it('bán đúng hàng được giá trong ngày: × hotMultiplier; giá theo ngày của state.time', () => {
    const hotOnly = withMarket({ hotMultiplier: 1.5 })
    const hotDay = Array.from({ length: 300 }, (_, day) => day).find(
      (day) => marketHotCategory(hotOnly, day) === 'consumable'
    )
    const coldDay = Array.from({ length: 300 }, (_, day) => day).find(
      (day) => marketHotCategory(hotOnly, day) !== 'consumable'
    )
    if (hotDay === undefined || coldDay === undefined) throw new Error('không tìm thấy ngày')
    const at = (day: number): GameState => ({ ...townState(), time: day * HOURS_PER_DAY + 3 })
    expect(sell(at(hotDay), potion, 1, hotOnly).money.toNumber()).toBe(37)
    expect(sell(at(coldDay), potion, 1, hotOnly).money.toNumber()).toBe(25)
  })

  it('dao động nhân vào giá bán', () => {
    const day = 4
    const state = { ...townState(), time: day * HOURS_PER_DAY }
    const hot = marketHotCategory(swinging, day) === 'consumable' ? 1.5 : 1
    const expected = toBig(25)
      .times(marketDayFactor(swinging, day, 'consumable'))
      .times(hot)
      .floor()
    expect(sell(state, potion, 1, swinging).money.eq(expected)).toBe(true)
  })
})

describe('kiểm tra save và dữ liệu', () => {
  it('validateMarket: rỗng / số dương hợp lệ; số ≤ 0, NaN, sai dạng báo lỗi', () => {
    expect(validateMarket({ saturation: {} })).toEqual([])
    expect(validateMarket({ saturation: { potion: 0.5, 'crystal:fast': 1e300 } })).toEqual([])
    expect(validateMarket({ saturation: { potion: 0, ball: -1, x: 'a' } })).toHaveLength(3)
    expect(validateMarket(null)).toEqual(['market.saturation phải là object'])
    expect(validateMarket({ saturation: [] })).toEqual(['market.saturation phải là object'])
  })

  it('config.market sai: hệ số ngoài khoảng, bậc không tăng dần, bậc cuối có maxPrice, trường lạ', () => {
    const text = dataIssuesAfter((raw) => {
      raw.config.market = {
        ...raw.config.market,
        minFactor: 0,
        recoveryPerDay: 1.5,
        dayFactorMin: 1.2,
        dayFactorMax: 1.1,
        dropTiers: [
          { maxPrice: 100, dropPerUnit: 0.00001 },
          // Giả lập JSON sai (trường lạ).
          { maxPrice: 50, dropPerUnit: 0.1, speed: 1 } as never,
          { maxPrice: 900, dropPerUnit: 0 }
        ]
      }
    }).join('\n')
    expect(text).toMatch(/config\.market\.minFactor/)
    expect(text).toMatch(/config\.market\.recoveryPerDay/)
    expect(text).toMatch(/config\.market\.dayFactorMax/)
    expect(text).toMatch(/dropTiers\[0\]\.dropPerUnit/)
    expect(text).toMatch(/dropTiers\[1\]: trường "speed"/)
    expect(text).toMatch(/dropTiers\[1\]\.maxPrice phải tăng dần/)
    expect(text).toMatch(/dropTiers\[2\]: bậc cuối không ghi maxPrice/)
    const empty = dataIssuesAfter((raw) => {
      raw.config.market = { ...raw.config.market, dropTiers: [] }
    }).join('\n')
    expect(empty).toMatch(/dropTiers cần ít nhất một bậc/)
  })
})

describe('migrate v25 → v26', () => {
  it('thêm thị trường chưa bán gì, state hợp lệ; save có market sai thì báo lỗi', () => {
    const legacyData = makeLegacyData()
    const state = makeGameState({ seed: 3, party: [makeMonster({ id: 'a' })] })
    const { market: _market, ...rest } = JSON.parse(JSON.stringify(serializeState(state)))
    const migrated = migrateState({ ...rest, version: 25 }, legacyData)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(migrated.market).toEqual({ saturation: {} })
    expect(validateGameState(legacyData, migrated)).toEqual([])
    const broken = { ...migrated, market: { saturation: { potion: -1 } } }
    expect(validateGameState(legacyData, broken).join('\n')).toMatch(/market\.saturation/)
  })
})
