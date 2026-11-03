// Đấu giá hành (docs/rules/auction.md): mở phiên tất định theo ngày, loại lô theo registry, giá trần
// NPC ẩn, đặt / đổi / rút giá kín (tiền bị giữ), thắng / thua khi đóng phiên, ký gửi bán được / trả
// về, phí, túi đầy (giữ hộ), kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount, itemBasePrice, itemSellPrice } from '../inventory'
import { toBig, type Decimal } from '../shared'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeData,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeMonster
} from '../testing'
import type {
  AuctionLot,
  AuctionLotKind,
  DayEvent,
  GameAction,
  GameData,
  GameState
} from '../model'
import { advanceTime } from './time'
import {
  auctionGoodValue,
  closeAuctionSession,
  openAuctionSession,
  visibleAuctionLots
} from './auction'

const data = makeData()
const DAY = 24

const town = (money = 1_000_000): GameState =>
  makeGameState({ seed: 11, party: [makeMonster({ id: 'a' })], money })

const act = (state: GameState, action: GameAction, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, action)

/** Phiên đang mở (ngày 0, đóng ngày 7). */
const opened = (state = town(), gameData: GameData = data): GameState =>
  openAuctionSession(gameData, state, 0)

const firstLot = (state: GameState): AuctionLot => defined(state.auction.lots[0])

/** Đặt giá trần NPC của lô đầu (để test thắng / thua tất định). */
function withNpcPrice(state: GameState, npcPrice: number): GameState {
  const lots = state.auction.lots.map((lot, i) =>
    i === 0 ? { ...lot, npcPrice: toBig(npcPrice) } : lot
  )
  return { ...state, auction: { ...state.auction, lots } }
}

const bid = (state: GameState, amount: Decimal | number, lotId = firstLot(state).id): GameState =>
  act(state, { type: 'placeAuctionBid', lotId, amount: toBig(amount) })

const close = (gameData: GameData, state: GameState): [GameState, DayEvent[]] => {
  const events: DayEvent[] = []
  return [closeAuctionSession(gameData, state, events), events]
}

describe('phiên đấu giá', () => {
  it('mở phiên tất định: 2 lô, giá khởi điểm theo giá trị, giá trần NPC trong [90 %, 250 %]', () => {
    const state = opened()
    expect(opened()).toEqual(state)
    expect(state.auction.lots).toHaveLength(2)
    expect(state.auction.lots.map((lot) => lot.id)).toEqual(['a1', 'a2'])
    expect(state.auction.closeDay).toBe(7)
    for (const lot of state.auction.lots) {
      expect(lot.kind).toBe('item')
      expect(lot.bid).toBeNull()
      expect(lot.startPrice.eq(auctionGoodValue(data, state, lot.good))).toBe(true)
      expect(lot.npcPrice.gte(lot.startPrice.times(0.9).floor())).toBe(true)
      expect(lot.npcPrice.lte(lot.startPrice.times(2.5))).toBe(true)
    }
    expect(validateGameState(data, state)).toEqual([])
    // Save ghi / đọc lại đúng (giá Decimal của lô).
    const loaded = migrateState(JSON.parse(JSON.stringify(serializeState(state))), data)
    expect(loaded.auction).toEqual(state.auction)
    expect(validateGameState(data, loaded)).toEqual([])
  })

  it('UI không thấy giá trần NPC', () => {
    for (const lot of visibleAuctionLots(opened())) expect('npcPrice' in lot).toBe(false)
  })

  it('việc theo ngày: phiên đầu mở ở lần qua ngày đầu, đóng / mở lại sau sessionDays', () => {
    const day1 = advanceTime(data, town(), DAY)
    expect(day1.auction.lots).toHaveLength(2)
    expect(day1.auction.closeDay).toBe(8)
    const day7 = advanceTime(data, day1, 6 * DAY)
    expect(day7.auction).toEqual(day1.auction)
    const day8 = advanceTime(data, day7, DAY)
    expect(day8.auction.closeDay).toBe(15)
    expect(day8.auction.lots.map((lot) => lot.id)).toEqual(['a3', 'a4'])
  })

  it('mỗi loại lô theo registry; unique chỉ khi đã gặp boss; loại không có hàng thì bỏ qua', () => {
    const only = (kind: AuctionLotKind): GameData =>
      makeEquipmentData((raw) => {
        for (const key of Object.keys(raw.config.auction.lotWeights) as AuctionLotKind[]) {
          raw.config.auction.lotWeights[key] = key === kind ? 1 : 0
        }
      })
    const goodKinds = (gameData: GameData, state: GameState): string[] =>
      opened(state, gameData).auction.lots.map((lot) =>
        lot.good.kind === 'egg' ? 'egg' : lot.good.entry.storage
      )
    expect(goodKinds(only('equipment'), town())).toEqual(['instance', 'instance'])
    expect(goodKinds(only('book'), town())).toEqual(['book', 'book'])
    expect(goodKinds(only('item'), town())).toEqual(['stack', 'stack'])
    // Chưa gặp boss nào có món unique: không có lô.
    expect(goodKinds(only('unique'), town())).toEqual([])
    const seen = { ...town(), dex: { ...town().dex, seen: ['strongling'] } }
    const unique = opened(seen, only('unique'))
    for (const lot of unique.auction.lots) {
      expect(lot.good.kind === 'item' && lot.good.entry.storage === 'instance').toBe(true)
      if (lot.good.kind === 'item' && lot.good.entry.storage === 'instance') {
        expect(lot.good.entry.instance.rarity).toBe('unique')
      }
    }
    expect(unique.nextItemId).toBe(seen.nextItemId + 2)
    expect(validateGameState(only('unique'), unique)).toEqual([])
    // Trứng: loài của map đã mở, id quái trong bộ đếm, nguồn gốc auction.
    const eggs = opened(town(), only('egg'))
    expect(eggs.nextMonsterId).toBe(town().nextMonsterId + 2)
    for (const lot of eggs.auction.lots) {
      expect(lot.good.kind).toBe('egg')
      if (lot.good.kind === 'egg') {
        expect(lot.good.egg.monster.history?.origin).toEqual({ kind: 'auction' })
      }
    }
    expect(validateGameState(only('egg'), eggs)).toEqual([])
  })
})

describe('đặt giá kín', () => {
  it('tiền bị giữ; đổi giá thì hoàn giá cũ; rút giá thì hoàn tiền', () => {
    const state = opened()
    const lot = firstLot(state)
    const placed = bid(state, lot.startPrice.plus(10))
    expect(placed.money.eq(state.money.minus(lot.startPrice).minus(10))).toBe(true)
    expect(firstLot(placed).bid?.eq(lot.startPrice.plus(10))).toBe(true)
    const changed = bid(placed, lot.startPrice)
    expect(changed.money.eq(state.money.minus(lot.startPrice))).toBe(true)
    const cancelled = act(changed, { type: 'cancelAuctionBid', lotId: lot.id })
    expect(cancelled.money.eq(state.money)).toBe(true)
    expect(firstLot(cancelled).bid).toBeNull()
    expect(validateGameState(data, placed)).toEqual([])
  })

  it('lỗi: dưới giá khởi điểm, không nguyên, thiếu tiền, lô lạ, chưa đặt, ngoài thị trấn', () => {
    const state = opened()
    const lot = firstLot(state)
    expectActionError(() => bid(state, lot.startPrice.minus(1)), 'auctionBidTooLow', {
      lotId: lot.id
    })
    expectActionError(() => bid(state, lot.startPrice.plus(0.5)), 'auctionBidTooLow')
    expectActionError(
      () => bid({ ...state, money: lot.startPrice.minus(1) }, lot.startPrice),
      'notEnoughMoney'
    )
    expectActionError(() => bid(state, 1, 'a99'), 'auctionLotNotFound', { lotId: 'a99' })
    expectActionError(() => act(state, { type: 'cancelAuctionBid', lotId: lot.id }), 'auctionNoBid')
    const away: GameState = { ...state, location: { type: 'floor', floor: 1 } }
    expectActionError(() => bid(away, lot.startPrice), 'notInTown')
  })

  it('số cực lớn: giá đặt 1e300 vẫn đúng', () => {
    const state = { ...opened(), money: toBig('1e300') }
    const placed = bid(state, toBig('1e300'))
    expect(placed.money.eq(0)).toBe(true)
    const [won] = close(data, withNpcPrice(placed, 1))
    expect(won.money.eq(0)).toBe(true)
  })
})

describe('đóng phiên', () => {
  it('giá đặt ≥ giá trần NPC: thắng, nhận món, trả đúng giá đã đặt', () => {
    const state = opened()
    const lot = firstLot(state)
    const placed = bid(withNpcPrice(state, lot.startPrice.toNumber()), lot.startPrice)
    const [after, events] = close(data, placed)
    expect(after.money.eq(placed.money)).toBe(true)
    if (lot.good.kind !== 'item' || lot.good.entry.storage !== 'stack') throw new Error('lô item')
    const { itemId } = lot.good.entry
    expect(getItemCount(after.inventory, itemId)).toBe(
      getItemCount(placed.inventory, itemId) + lot.good.count
    )
    expect(events).toEqual([
      {
        type: 'auctionWon',
        lotId: lot.id,
        price: lot.startPrice,
        received: { kind: 'item', item: lot.good.entry, count: lot.good.count, held: false }
      }
    ])
    expect(after.auction.lots).toEqual([])
  })

  it('giá đặt < giá trần NPC: thua, hoàn tiền, log lộ giá NPC', () => {
    const state = opened()
    const lot = firstLot(state)
    const npcPrice = lot.startPrice.plus(1).toNumber()
    const placed = bid(withNpcPrice(state, npcPrice), lot.startPrice)
    const [after, events] = close(data, placed)
    expect(after.money.eq(state.money)).toBe(true)
    expect(events).toEqual([{ type: 'auctionLost', lotId: lot.id, npcPrice: toBig(npcPrice) }])
  })

  it('thắng trang bị khi túi đầy: giữ hộ, nhận lại khi có chỗ', () => {
    const equipmentData = makeEquipmentData((raw) => {
      raw.config.auction.lotWeights = { equipment: 1, unique: 0, egg: 0, book: 0, item: 0 }
      raw.config.capacity.bag.base = 1
    })
    const full: GameState = {
      ...town(),
      inventory: { ...town().inventory, equipment: [makeEquipment({ id: 'e900' })] },
      nextItemId: 901
    }
    const state = opened(full, equipmentData)
    const lot = firstLot(state)
    const placed = act(
      withNpcPrice(state, 1),
      { type: 'placeAuctionBid', lotId: lot.id, amount: lot.startPrice },
      equipmentData
    )
    const [after, events] = close(equipmentData, placed)
    expect(after.auction.held).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'auctionWon', received: { held: true } })
    expect(validateGameState(equipmentData, after)).toEqual([])
    const claim: GameAction = { type: 'claimAuctionHeld' }
    expectActionError(() => act(after, claim, equipmentData), 'bagFull')
    const roomy = { ...after, inventory: { ...after.inventory, equipment: [] } }
    const claimed = act(roomy, claim, equipmentData)
    expect(claimed.auction.held).toEqual([])
    expect(claimed.inventory.equipment).toHaveLength(1)
    expectActionError(() => act(claimed, claim, equipmentData), 'auctionNothingHeld')
  })

  it('thắng trứng: trứng vào danh sách trứng', () => {
    const eggData = makeEquipmentData((raw) => {
      raw.config.auction.lotWeights = { equipment: 0, unique: 0, egg: 1, book: 0, item: 0 }
    })
    const state = opened(town(), eggData)
    const lot = firstLot(state)
    const placed = act(
      withNpcPrice(state, 1),
      { type: 'placeAuctionBid', lotId: lot.id, amount: lot.startPrice },
      eggData
    )
    const [after] = close(eggData, placed)
    if (lot.good.kind !== 'egg') throw new Error('lô trứng')
    expect(after.eggs.map((egg) => egg.id)).toContain(lot.good.egg.id)
    expect(validateGameState(eggData, after)).toEqual([])
  })
})

describe('ký gửi', () => {
  const withPotions: GameState = {
    ...town(),
    inventory: { ...town().inventory, stacks: { potion: 10 } }
  }
  const consign = (state: GameState, reservePrice: number | Decimal, count = 4): GameState =>
    act(state, {
      type: 'consignItem',
      item: { storage: 'stack', itemId: 'potion' },
      count,
      reservePrice: toBig(reservePrice)
    })

  it('đồ rời túi; giá sàn 0 thì bán, nhận giá NPC trừ phí 10 %', () => {
    const state = consign(withPotions, 0)
    expect(getItemCount(state.inventory, 'potion')).toBe(6)
    expect(state.auction.consignments).toHaveLength(1)
    expect(validateGameState(data, state)).toEqual([])
    const [after, events] = close(data, state)
    const sold = defined(events[0])
    if (sold.type !== 'consignmentSold') throw new Error('phải bán được')
    expect(after.money.eq(state.money.plus(sold.earned))).toBe(true)
    const shop = itemSellPrice(data, { storage: 'stack', itemId: 'potion' }, 1).times(4)
    // Giá NPC trong [60 %, 180 %] giá bán ở cửa hàng, nhận 90 %.
    expect(sold.earned.gte(shop.times(0.6).times(0.9).floor().minus(1))).toBe(true)
    expect(sold.earned.lte(shop.times(1.8).times(0.9))).toBe(true)
    expect(after.auction.consignments).toEqual([])
    expect(after.market.saturation.potion).toBe(4)
  })

  it('giá NPC dưới giá sàn: trả đồ về túi, log giá NPC', () => {
    const state = consign(withPotions, toBig('1e30'))
    const [after, events] = close(data, state)
    expect(getItemCount(after.inventory, 'potion')).toBe(10)
    expect(after.money.eq(state.money)).toBe(true)
    expect(events[0]).toMatchObject({ type: 'consignmentReturned', received: { held: false } })
  })

  it('rút đồ ký gửi; lỗi: giá sàn âm / lẻ, đồ không rời túi, không đủ, id lạ', () => {
    const state = consign(withPotions, 0)
    const id = defined(state.auction.consignments[0]).id
    const back = act(state, { type: 'withdrawConsignment', consignmentId: id })
    expect(getItemCount(back.inventory, 'potion')).toBe(10)
    expect(back.auction.consignments).toEqual([])
    expectActionError(() => consign(withPotions, -1), 'auctionInvalidReserve')
    expectActionError(() => consign(withPotions, 1.5), 'auctionInvalidReserve')
    expectActionError(() => consign(withPotions, 0, 11), 'notEnoughItem')
    const keyItem = { ...town(), inventory: { ...town().inventory, stacks: { megaRing: 1 } } }
    expectActionError(
      () =>
        act(keyItem, {
          type: 'consignItem',
          item: { storage: 'stack', itemId: 'megaRing' },
          count: 1,
          reservePrice: toBig(0)
        }),
      'keyItemLocked'
    )
    expectActionError(
      () => act(state, { type: 'withdrawConsignment', consignmentId: 'a99' }),
      'auctionConsignmentNotFound'
    )
  })

  it('món trang bị ký gửi không bán được mà túi đầy: giữ hộ', () => {
    const equipmentData = makeEquipmentData((raw) => {
      raw.config.capacity.bag.base = 1
    })
    const instance = makeEquipment({ id: 'e5' })
    const state = act(
      { ...town(), inventory: { ...town().inventory, equipment: [instance] }, nextItemId: 6 },
      {
        type: 'consignItem',
        item: { storage: 'instance', instanceId: 'e5' },
        count: 1,
        reservePrice: toBig('1e30')
      },
      equipmentData
    )
    expect(state.inventory.equipment).toEqual([])
    expect(validateGameState(equipmentData, state)).toEqual([])
    const refilled = {
      ...state,
      inventory: { ...state.inventory, equipment: [makeEquipment({ id: 'e1' })] }
    }
    const [after, events] = close(equipmentData, refilled)
    expect(after.auction.held.map((entry) => entry.id)).toEqual(['e5'])
    expect(events[0]).toMatchObject({ type: 'consignmentReturned', received: { held: true } })
    expect(itemBasePrice(equipmentData, { storage: 'instance', instance }, 1).gt(0)).toBe(true)
  })
})

describe('dữ liệu, save', () => {
  it('kiểm tra config.auction', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.auction.lotCount = { min: 3, max: 1 }
      raw.config.auction.lotWeights.egg = -1
      raw.config.auction.npcMinPercent = 300
      raw.config.auction.feePercent = 101
      raw.config.auction.eggRankMultipliers = []
    })
    expect(issues.join('\n')).toMatch(/config.auction.lotCount: max phải ≥ min/)
    expect(issues.join('\n')).toMatch(/config.auction.lotWeights.egg/)
    expect(issues.join('\n')).toMatch(/config.auction.npcMinPercent phải ≤ npcMaxPercent/)
    expect(issues.join('\n')).toMatch(/config.auction.feePercent/)
    expect(issues.join('\n')).toMatch(/config.auction.eggRankMultipliers/)
  })

  it('kiểm tra save: id, giá đặt dưới khởi điểm, trùng id món', () => {
    const state = bid(opened(), firstLot(opened()).startPrice)
    const lot = firstLot(state)
    const bad = (auction: GameState['auction']): string[] =>
      validateGameState(data, { ...state, auction })
    expect(bad({ ...state.auction, nextId: 1 }).join('\n')).toMatch(/nhỏ hơn nextId/)
    const low = { ...lot, bid: lot.startPrice.minus(1) }
    expect(bad({ ...state.auction, lots: [low] }).join('\n')).toMatch(/bid phải ≥ startPrice/)
    expect(bad({ ...state.auction, lots: [lot, lot] }).join('\n')).toMatch(/bị trùng/)
  })

  it('migrate v98 → v99: chưa có phiên', () => {
    const raw = serializeState(town()) as Record<string, unknown>
    const { auction: _auction, ...old } = raw
    const migrated = migrateState({ ...old, version: 98 }, data)
    expect(migrated.auction).toEqual({
      lots: [],
      closeDay: 0,
      consignments: [],
      held: [],
      nextId: 1
    })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
