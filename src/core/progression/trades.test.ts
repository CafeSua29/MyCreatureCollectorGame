// Trao đổi với NPC (docs/rules/trades.md): ra bảng tất định theo ngày, yêu cầu theo loại, nhận quái /
// vật phẩm, chặn bản mệnh / quái bận / sai yêu cầu, trang bị về túi, lý lịch nguồn gốc trade, thêm
// EXP, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { getItemCount, itemStorage } from '../inventory'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeData,
  makeGameState,
  makeMonster,
  type MonsterOverrides
} from '../testing'
import { BATTLE_FORM_KINDS } from '../model'
import type { GameState, Monster, TradeOffer, TradeWant } from '../model'
import { advanceTime } from './time'
import {
  TRADE_WANTS,
  meetsTradeWant,
  rollTradeOffers,
  tradeExpMultiplier,
  tradeItemPool,
  tradeSpeciesPool
} from './trades'

const data = makeData()
const DAY = 24

const town = (party: Monster[] = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })]): GameState =>
  makeGameState({ seed: 7, party })

/** Bảng có đúng một đề nghị cho trước (để test nhận). */
function withOffer(state: GameState, offer: Partial<TradeOffer> = {}): GameState {
  const rolled = rollTradeOffers(data, state, 0)
  const base = defined(rolled.trades.offers.find((o) => o.give.kind === 'monster'))
  const full: TradeOffer = {
    ...base,
    want: { kind: 'species', speciesId: 'weakling', minLevel: 1 },
    ...offer
  }
  return { ...rolled, trades: { ...rolled.trades, offers: [full] } }
}

const accept = (
  state: GameState,
  monsterId: string,
  offerId = state.trades.offers[0]?.id ?? 'x'
): GameState => gameReducer(data, state, { type: 'acceptTrade', offerId, monsterId })

describe('bảng trao đổi', () => {
  it('ra 2 đề nghị tất định theo seed; quái NPC đưa giữ id trong bộ đếm; làm mới sau 7 ngày', () => {
    const state = town()
    const rolled = rollTradeOffers(data, state, 0)
    expect(rollTradeOffers(data, state, 0)).toEqual(rolled)
    expect(rolled.trades.offers).toHaveLength(2)
    expect(rolled.trades.refreshDay).toBe(7)
    const monsters = rolled.trades.offers.filter((o) => o.give.kind === 'monster').length
    expect(rolled.nextMonsterId).toBe(state.nextMonsterId + monsters)
    expect(validateGameState(data, rolled)).toEqual([])
    // Game test bắt đầu với bảng trống, ngày làm mới 0: lần qua ngày đầu ra bảng.
    const day1 = advanceTime(data, state, DAY)
    expect(day1.trades.offers).toHaveLength(2)
    const later = advanceTime(data, day1, 7 * DAY)
    expect(later.trades.offers.map((o) => o.id)).not.toEqual(day1.trades.offers.map((o) => o.id))
    // Save có quái NPC đưa ghi / đọc lại đúng (trường Decimal của quái trong đề nghị).
    const loaded = migrateState(JSON.parse(JSON.stringify(serializeState(rolled))), data)
    expect(validateGameState(data, loaded)).toEqual([])
  })

  it('yêu cầu theo loại: loài / race / hệ và level tối thiểu', () => {
    const monster = makeMonster({ id: 'a', level: 5 })
    const wants: TradeWant[] = [
      { kind: 'species', speciesId: monster.speciesId, minLevel: 5 },
      { kind: 'race', raceId: monster.raceId, minLevel: 1 },
      { kind: 'element', elementId: defined(monster.elementIds[0]), minLevel: 1 }
    ]
    for (const want of wants) expect(meetsTradeWant(data, want, monster)).toBe(true)
    expect(meetsTradeWant(data, { ...wants[0], minLevel: 6 }, monster)).toBe(false)
    expect(meetsTradeWant(data, { kind: 'species', speciesId: 'nope', minLevel: 1 }, monster)).toBe(
      false
    )
    expect(
      TRADE_WANTS.element.isValid(data, { kind: 'element', elementId: 'nope', minLevel: 1 })
    ).toBe(false)
  })
})

describe('mọi kết quả hợp lệ đều có cơ hội', () => {
  it('loài: mọi loài thường có trọng số > 0, kể cả loài không gặp ở map nào; không có dạng trong trận', () => {
    const pool = new Set(tradeSpeciesPool(data).map((entry) => entry.speciesId))
    for (const species of Object.values(data.species)) {
      if (species.kind !== 'normal') continue
      const battleForm = BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate')
      expect(pool.has(species.id)).toBe(!battleForm)
    }
    const wild = new Set(
      Object.values(data.biomes).flatMap((b) => b.encounters.map((e) => e.speciesId))
    )
    expect([...pool].some((id) => !wild.has(id))).toBe(true)
  })

  it('vật phẩm: mọi vật phẩm gộp chồng có giá đều có cơ hội, đắt hơn thì trọng số cao hơn', () => {
    const pool = tradeItemPool(data)
    const ids = pool.map((entry) => entry.itemId)
    for (const item of Object.values(data.items)) {
      const sellable = itemStorage(item.category) === 'stack' && 'price' in item && item.price > 0
      expect(ids.includes(item.id)).toBe(sellable)
    }
    expect(pool.every((entry) => entry.weight > 0 && Number.isFinite(entry.weight))).toBe(true)
    const weightOf = (itemId: string): number =>
      defined(pool.find((entry) => entry.itemId === itemId)).weight
    expect(weightOf('rareCandy')).toBeGreaterThan(weightOf('potion'))
  })
})

describe('nhận đề nghị', () => {
  it('quái NPC đưa thế chỗ quái đưa đi; lý lịch trade với tên NPC; đề nghị dùng một lần', () => {
    const state = withOffer(town())
    const offer = defined(state.trades.offers[0])
    const traded = accept(state, 'a')
    const received = defined(traded.party[0])
    expect(offer.give.kind === 'monster' && received.id).toBe(
      offer.give.kind === 'monster' ? offer.give.monster.id : false
    )
    expect(received.history?.origin).toEqual({ kind: 'trade', npcNameId: offer.npcNameId })
    expect(received.contractRealm).toBeNull()
    expect(traded.trades.offers).toEqual([])
    expect(tradeExpMultiplier(data, received)).toBe(1.5)
    expect(tradeExpMultiplier(data, defined(traded.party[1]))).toBe(1)
    expect(validateGameState(data, traded)).toEqual([])
    expectActionError(() => accept(traded, 'b', offer.id), 'tradeNotFound')
  })

  it('vật phẩm: quái đi mất, nhận vật phẩm; quái duy nhất của đội thì không đưa được', () => {
    const itemOffer = { give: { kind: 'item', itemId: 'rareCandy', count: 2 } } as const
    const traded = accept(withOffer(town(), itemOffer), 'b')
    expect(traded.party.map((m) => m.id)).toEqual(['a'])
    expect(getItemCount(traded.inventory, 'rareCandy')).toBe(2)
    expectActionError(
      () => accept(withOffer(town([makeMonster({ id: 'a' })]), itemOffer), 'a'),
      'partyWouldBeEmpty'
    )
  })

  it('lỗi: sai yêu cầu, quái lạ, bản mệnh, đang bận, ngoài thị trấn; state giữ nguyên', () => {
    const hero = (overrides: MonsterOverrides): Monster => makeMonster({ id: 'a', ...overrides })
    const state = withOffer(town(), {
      want: { kind: 'species', speciesId: 'weakling', minLevel: 50 }
    })
    expectActionError(() => accept(state, 'a'), 'tradeWantNotMet', { monsterId: 'a' })
    expectActionError(() => accept(state, 'zzz'), 'monsterNotOwned')
    const bonded = withOffer(
      town([hero({ bond: true, contractRealm: 0 }), makeMonster({ id: 'b' })])
    )
    expectActionError(
      () => accept({ ...bonded, tamer: { ...bonded.tamer, bondDay: 0 } }, 'a'),
      'isBondBeast'
    )
    const locked = withOffer(town([hero({ locked: true }), makeMonster({ id: 'b' })]))
    expectActionError(() => accept(locked, 'a'), 'monsterLocked', { monsterId: 'a' })
    const onFloor = { ...withOffer(town()), location: { type: 'floor', floor: 1 } as const }
    expectActionError(() => accept(onFloor, 'a'), 'notInTown')
  })
})

describe('kiểm tra dữ liệu / save', () => {
  it('dữ liệu: khoảng số đề nghị, trọng số, vật phẩm lạ', () => {
    expect(
      dataIssuesAfter((raw) => {
        raw.config.trades.offerCount = { min: 3, max: 1 }
        raw.config.trades.wantWeights.species = -1
        raw.config.trades.itemWeightPower = -1
        raw.config.trades.giveRankWeights = []
      })
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('offerCount'),
        expect.stringContaining('wantWeights.species'),
        expect.stringContaining('itemWeightPower'),
        expect.stringContaining('giveRankWeights')
      ])
    )
  })

  it('save: id đề nghị trùng / quá bộ đếm, yêu cầu lạ, quái NPC trùng id quái đội', () => {
    const state = rollTradeOffers(data, town(), 0)
    const [first] = state.trades.offers
    const bad = (offers: TradeOffer[], patch: Partial<GameState['trades']> = {}): string[] =>
      validateGameState(data, { ...state, trades: { ...state.trades, offers, ...patch } })
    expect(bad([first, first]).length).toBeGreaterThan(0)
    expect(bad(state.trades.offers, { nextOfferId: 1 }).length).toBeGreaterThan(0)
    expect(bad([{ ...first, want: { kind: 'race', raceId: 'nope', minLevel: 1 } }])).toHaveLength(1)
    const clash = { ...first, give: { kind: 'monster', monster: defined(state.party[0]) } } as const
    expect(bad([clash]).length).toBeGreaterThan(0)
  })

  it('migrate v94 → v95: bảng trống, ra ở lần qua ngày đầu', () => {
    const raw = serializeState(town()) as Record<string, unknown>
    const { trades: _trades, ...old } = raw
    const migrated = migrateState({ ...old, version: 94 }, data)
    expect(migrated.trades).toEqual({ offers: [], refreshDay: 0, nextOfferId: 1 })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
