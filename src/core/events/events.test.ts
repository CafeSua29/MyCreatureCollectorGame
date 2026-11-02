// Hệ thống event (docs/rules/events.md): gặp event ở tầng (startWildBattle, explore, điều kiện, tỉ
// lệ, hệ số), chặn action khi có event chờ, chọn lựa chọn và từng loại kết quả, modifier (thời hạn,
// hiệu ứng), cửa hàng tạm, trận event (onWin / onLoss, không chạy), chuỗi event, event thị trấn.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { addItems, getItemCount, itemBuyPrice, skillLearnerCount } from '../inventory'
import { expForLevel, getMaxHp } from '../monster'
import { floorLevelRange } from '../world'
import { startWildBattle, suggestBattleCommands, suggestReplacements } from '../battle'
import { toBig } from '../shared'
import { syncDex } from '../roster'
import {
  defined,
  expectActionError,
  makeData,
  makeEventData,
  makeGameState,
  makeInventory,
  makeMonster,
  uniformStats,
  withPendingEvent
} from '../testing'
import type { EventDef, GameData, GameState, Monster, RawGameData } from '../model'

const data = makeEventData()

/** Data có tỉ lệ event riêng (mặc định fixture: 10 / 30 / 15). */
const dataWith = (edit: (raw: RawGameData) => void): GameData => makeEventData(edit)

const always = dataWith((raw) => {
  raw.config.events.wildBattleChance = 100
  raw.config.events.exploreChance = 100
  raw.config.events.townChance = 100
})

const never = dataWith((raw) => {
  raw.config.events.wildBattleChance = 0
  raw.config.events.exploreChance = 0
  raw.config.events.townChance = 0
})

/** Quái ta rất mạnh: thắng mọi trận ở tầng thấp. */
const hero = (id = 'h'): Monster =>
  makeMonster({
    id,
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike']
  })

/** Quái ta rất yếu: thua mọi trận. */
const weakling = (id = 'w'): Monster => makeMonster({ id, genes: uniformStats(1) })

function floorState({
  party = [hero()],
  floor = 1,
  money = 1000,
  seed = 7
}: Partial<{
  party: Monster[]
  floor: number
  money: number
  seed: number
}> = {}): GameState {
  return makeGameState({
    seed,
    party,
    money,
    location: { type: 'floor', floor },
    highestFloor: Math.max(3, floor)
  })
}

const act = (
  state: GameState,
  action: Parameters<typeof gameReducer>[2],
  gameData = data
): GameState => gameReducer(gameData, state, action)

const choose = (state: GameState, optionId: string, gameData = data): GameState =>
  act(state, { type: 'chooseEventOption', optionId }, gameData)

/** Đánh trận đang mở tới hết rồi rời trận. */
function fightAndLeave(state: GameState, gameData: GameData = data): GameState {
  let current = state
  for (let i = 0; i < 200 && current.battle?.phase !== 'ended'; i++) {
    const phase = defined(current.battle, 'trận').phase
    current =
      phase === 'chooseReplacement'
        ? act(
            current,
            { type: 'replaceFainted', replacements: suggestReplacements(gameData, current) },
            gameData
          )
        : act(
            current,
            {
              type: 'submitTurn',
              commands: suggestBattleCommands(gameData, current, { transforms: false })
            },
            gameData
          )
  }
  expect(current.battle?.phase).toBe('ended')
  return act(current, { type: 'leaveBattle' }, gameData)
}

describe('gặp event ở tầng', () => {
  it('startWildBattle gặp event khám phá thay cho trận (tỉ lệ 100%)', () => {
    const next = act(floorState(), { type: 'startWildBattle' }, always)
    expect(next.battle).toBeNull()
    expect(next.events.pending).toEqual({ eventId: 'treasure', floor: 1, chainId: null })
  })

  it('event giới hạn thời khắc / mùa / tuần trăng chỉ gặp đúng lúc (docs/rules/calendar.md)', () => {
    const limited = (limit: Partial<EventDef>): GameData =>
      dataWith((raw) => {
        raw.config.events.wildBattleChance = 100
        for (const event of raw.events) Object.assign(event, limit)
      })
    const at = (gameData: GameData, time: number): GameState =>
      act({ ...floorState(), time }, { type: 'startWildBattle' }, gameData)
    const night = limited({ dayPhases: ['night'] })
    expect(at(night, 22).events.pending?.eventId).toBe('treasure')
    expect(at(night, 12).events.pending).toBeNull()
    expect(at(night, 12).battle).not.toBeNull()
    // 10 ngày một năm: ngày 8 là mùa đông; tuần trăng 8 ngày: ngày 4 trăng tròn.
    const winter = limited({ seasons: ['winter'] })
    expect(at(winter, 8 * 24).events.pending).not.toBeNull()
    expect(at(winter, 0).events.pending).toBeNull()
    const fullMoon = limited({ moonPhases: ['full'] })
    expect(at(fullMoon, 4 * 24 + 1).events.pending).not.toBeNull()
    expect(at(fullMoon, 5 * 24).events.pending).toBeNull()
  })

  it('tỉ lệ 0 hoặc không có event: ra trận như cũ, không tốn RNG', () => {
    const state = floorState()
    // Reducer ghi Bộ sưu tập sau action (docs/rules/dex.md).
    expect(act(state, { type: 'startWildBattle' }, never)).toEqual(
      syncDex(never, startWildBattle(never, state))
    )
    const plain = makeData()
    expect(gameReducer(plain, state, { type: 'startWildBattle' })).toEqual(
      syncDex(plain, startWildBattle(plain, state))
    )
  })

  it('explore: exploreChance % gặp event, còn lại trận quái hoang (không tung lại tỉ lệ event)', () => {
    const met = act(floorState(), { type: 'explore' }, always)
    expect(met.events.pending?.eventId).toBe('treasure')
    const onlyWild = dataWith((raw) => {
      raw.config.events.wildBattleChance = 100
      raw.config.events.exploreChance = 0
    })
    const fought = act(floorState(), { type: 'explore' }, onlyWild)
    expect(fought.battle).not.toBeNull()
    expect(fought.events.pending).toBeNull()
  })

  it('explore cần đứng ở tầng, không trong trận, còn quái đánh được', () => {
    const town = makeGameState({ seed: 1, party: [hero()] })
    expectActionError(() => act(town, { type: 'explore' }), 'notOnFloor')
    expectActionError(
      () => act(floorState({ party: [makeMonster({ damageTaken: 10_000 })] }), { type: 'explore' }),
      'noHealthyMonster'
    )
  })

  it('điều kiện xuất hiện: tầng tối thiểu và map', () => {
    const onlyDeep = dataWith((raw) => {
      raw.config.events.wildBattleChance = 100
      for (const event of raw.events) if (event.id === 'treasure') event.weight = 0
    })
    // Tầng 5 là lair (fixtureFloorBiomeIds): "deep" xuất hiện được.
    expect(
      act(floorState({ floor: 5 }), { type: 'startWildBattle' }, onlyDeep).events.pending?.eventId
    ).toBe('deep')
    // Tầng 4 là field, tầng 2 là lair nhưng dưới tầng tối thiểu: không có event nào nên ra trận.
    expect(
      act(floorState({ floor: 4 }), { type: 'startWildBattle' }, onlyDeep).battle
    ).not.toBeNull()
    expect(
      act(floorState({ floor: 2 }), { type: 'startWildBattle' }, onlyDeep).battle
    ).not.toBeNull()
  })

  it('kỹ năng đồng hành eventChancePercent và modifier nhân tỉ lệ event (kẹp 100)', () => {
    const half = (raw: RawGameData): void => {
      raw.config.events.wildBattleChance = 50
    }
    const withPartner = dataWith((raw) => {
      half(raw)
      raw.partnerSkills[0].effects = [{ type: 'eventChancePercent', params: { percent: 100 } }]
    })
    const plain = dataWith(half)
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1)
    const metWith = seeds.filter(
      (seed) => act(floorState({ seed }), { type: 'startWildBattle' }, withPartner).events.pending
    )
    const metPlain = seeds.filter(
      (seed) => act(floorState({ seed }), { type: 'startWildBattle' }, plain).events.pending
    )
    expect(metWith).toHaveLength(seeds.length)
    expect(metPlain.length).toBeLessThan(seeds.length)
    const lured = (seed: number): GameState => {
      const state = floorState({ seed })
      return {
        ...state,
        events: { ...state.events, modifiers: [{ modifierId: 'lure', battlesLeft: 5 }] }
      }
    }
    expect(
      seeds.every((seed) => act(lured(seed), { type: 'startWildBattle' }, plain).events.pending)
    ).toBe(true)
  })

  it('event thay cho trận tính một trận cho modifier; cửa hàng tạm cũ mất', () => {
    const state = floorState()
    const withExtras: GameState = {
      ...state,
      events: {
        ...state.events,
        modifiers: [
          { modifierId: 'lucky', battlesLeft: 2 },
          { modifierId: 'sale', battlesLeft: null }
        ],
        tempShop: { stock: [], priceMultiplier: 1, floor: 1 }
      }
    }
    const next = act(withExtras, { type: 'startWildBattle' }, always)
    expect(next.events.modifiers).toEqual([
      { modifierId: 'lucky', battlesLeft: 1 },
      { modifierId: 'sale', battlesLeft: null }
    ])
    expect(next.events.tempShop).toBeNull()
  })

  it('tất định: cùng state, cùng action cho cùng kết quả', () => {
    const state = floorState({ seed: 99 })
    expect(act(state, { type: 'explore' })).toEqual(act(state, { type: 'explore' }))
  })
})

describe('event đang chờ', () => {
  const pending = withPendingEvent(floorState(), 'treasure', { floor: 1 })

  it('chặn mọi action khác, chỉ chooseEventOption được làm', () => {
    expectActionError(
      () => act(pending, { type: 'travel', to: { type: 'town' } }),
      'eventPending',
      {
        eventId: 'treasure'
      }
    )
    expectActionError(() => act(pending, { type: 'startWildBattle' }), 'eventPending')
    expectActionError(
      () => act(pending, { type: 'renameMonster', monsterId: 'h', nickname: 'x' }),
      'eventPending'
    )
  })

  it('không có event chờ / lựa chọn không có: báo lỗi', () => {
    expectActionError(() => choose(floorState(), 'take'), 'noPendingEvent')
    expectActionError(() => choose(pending, 'dance'), 'eventOptionUnknown', {
      eventId: 'treasure',
      optionId: 'dance'
    })
  })

  it('chọn xong: hết chờ, áp kết quả, ghi log, tốn giờ event', () => {
    const next = choose(pending, 'take')
    expect(next.events.pending).toBeNull()
    expect(getItemCount(next.inventory, 'potion')).toBe(2)
    const money = toBig(data.config.rewards.moneyPerLevel)
      .times(floorLevelRange(data, 1).max)
      .times(2)
    expect(next.money.eq(toBig(1000).plus(money))).toBe(true)
    expect(next.events.log.map((entry) => entry.type)).toEqual([
      'eventResolved',
      'itemGained',
      'moneyGained'
    ])
    expect(next.time).toBe(pending.time + data.config.clock.hours.event)
  })

  it('lựa chọn không có kết quả (Bỏ đi): chỉ hết chờ', () => {
    const next = choose(pending, 'leave')
    expect(next.events.pending).toBeNull()
    expect(next.inventory).toEqual(pending.inventory)
    expect(next.money.eq(pending.money)).toBe(true)
  })

  it('tung kết quả theo trọng số qua RNG của save', () => {
    const outcomes = new Set(
      Array.from({ length: 20 }, (_, i) => {
        const next = choose(
          withPendingEvent(floorState({ seed: i + 1 }), 'gamble', { floor: 1 }),
          'try'
        )
        return next.events.log[1].type
      })
    )
    expect(outcomes).toEqual(new Set(['moneyGained', 'moneyLost']))
  })
})

describe('kết quả event', () => {
  it('costItems: thiếu thì không chọn được; đủ thì tiêu, quái đi theo (chưa khế ước, lý lịch event)', () => {
    const state = withPendingEvent(floorState(), 'injured', { floor: 1 })
    expectActionError(() => choose(state, 'heal'), 'notEnoughItem', {
      itemId: 'potion',
      have: 0,
      need: 1
    })
    const stocked = { ...state, inventory: addItems(state.inventory, 'potion', 1) }
    const next = choose(stocked, 'heal')
    expect(getItemCount(next.inventory, 'potion')).toBe(0)
    expect(next.party).toHaveLength(2)
    const joined = next.party[1]
    expect(joined.history?.origin).toEqual({ kind: 'event', eventId: 'injured' })
    expect(joined.contractRealm).toBeNull() // chưa khế ước (tamer.md mục "Khế ước")
    expect(next.events.log.map((entry) => entry.type)).toEqual([
      'eventResolved',
      'itemSpent',
      'monsterJoined'
    ])
  })

  it('giveMonster: đội đầy thì vào kho', () => {
    const party = Array.from({ length: data.config.partySize }, (_, i) => hero(`h${i}`))
    const state = withPendingEvent(floorState({ party }), 'injured', { floor: 1 })
    const next = choose({ ...state, inventory: addItems(state.inventory, 'potion', 1) }, 'heal')
    expect(next.storage).toHaveLength(1)
  })

  it('healParty: hồi đầy, chữa mọi trạng thái', () => {
    const hurt = {
      ...hero(),
      damageTaken: toBig(50),
      statuses: [{ statusId: 'poison', turnsLeft: null }]
    }
    const next = choose(
      withPendingEvent(floorState({ party: [hurt] }), 'spring', { floor: 1 }),
      'drink'
    )
    expect(next.party[0].damageTaken.eq(0)).toBe(true)
    expect(next.party[0].statuses).toEqual([])
  })

  it('applyStatus: count quái còn sống đầu đội dính trạng thái, bỏ qua quái đã gục', () => {
    // Hệ lửa (fixture: hệ cỏ miễn độc).
    const fire = (id: string): Monster => ({ ...hero(id), elementIds: ['fire'] })
    const fainted = makeMonster({ id: 'f', damageTaken: 10_000, elementIds: ['fire'] })
    const party = [
      fainted,
      fire('a'),
      { ...hero('g'), elementIds: ['grass'] },
      fire('b'),
      fire('c')
    ]
    const next = choose(withPendingEvent(floorState({ party }), 'swamp', { floor: 1 }), 'continue')
    expect(next.party.map((m) => m.statuses.map((s) => s.statusId))).toEqual([
      [],
      ['poison'],
      [],
      [],
      []
    ])
    expect(next.events.log.slice(1)).toEqual([
      { type: 'statusApplied', monsterId: 'a', statusId: 'poison' },
      { type: 'statusImmune', monsterId: 'g', statusId: 'poison' }
    ])
  })

  it('addModifier: thêm, đến lần nữa thì làm mới thời hạn', () => {
    const first = choose(withPendingEvent(floorState(), 'omen', { floor: 1 }), 'accept')
    expect(first.events.modifiers).toEqual([{ modifierId: 'lucky', battlesLeft: 2 }])
    const used = {
      ...first,
      events: { ...first.events, modifiers: [{ modifierId: 'lucky', battlesLeft: 1 }] }
    }
    const again = choose(withPendingEvent(used, 'omen', { floor: 1 }), 'accept')
    expect(again.events.modifiers).toEqual([{ modifierId: 'lucky', battlesLeft: 2 }])
  })

  it('giveEgg: trứng loài của map, lý lịch event, tăng bộ đếm id', () => {
    const state = withPendingEvent(floorState(), 'nest', { floor: 1 })
    const next = choose(state, 'steal')
    expect(next.eggs).toHaveLength(1)
    expect(next.eggs[0].monster.history?.origin).toEqual({ kind: 'event', eventId: 'nest' })
    expect(next.eggs[0].monster.level).toBe(1)
    expect(next.nextMonsterId).toBe(state.nextMonsterId + 1)
  })

  it('loseMoneyPercent: mất % tiền (làm tròn xuống), kể cả số cực lớn', () => {
    const state = withPendingEvent(floorState({ money: 999 }), 'bandits', { floor: 1 })
    expect(choose(state, 'pay').money.eq(900)).toBe(true)
    const rich = { ...state, money: toBig('1e300') }
    expect(choose(rich, 'pay').money.eq(toBig('9e299'))).toBe(true)
    const broke = { ...state, money: toBig(0) }
    expect(choose(broke, 'pay').money.eq(0)).toBe(true)
  })

  it('giveMoney scale theo tầng', () => {
    const low = choose(
      withPendingEvent(floorState({ floor: 1, money: 0 }), 'treasure', { floor: 1 }),
      'take'
    )
    const high = choose(
      withPendingEvent(floorState({ floor: 30, money: 0 }), 'treasure', { floor: 30 }),
      'take'
    )
    expect(high.money.gt(low.money.times(10))).toBe(true)
  })
})

describe('modifier', () => {
  it('trận trên tầng (thắng / thua / chạy) bớt 1 trận, hết thì mất', () => {
    const state = floorState({ seed: 3 })
    const lucky: GameState = {
      ...state,
      events: { ...state.events, modifiers: [{ modifierId: 'lucky', battlesLeft: 2 }] }
    }
    const once = fightAndLeave(act(lucky, { type: 'startWildBattle' }, never), never)
    expect(once.events.modifiers).toEqual([{ modifierId: 'lucky', battlesLeft: 1 }])
    const twice = fightAndLeave(act(once, { type: 'startWildBattle' }, never), never)
    expect(twice.events.modifiers).toEqual([])
  })

  it('fixedField: trận trên tầng lấy môi trường của modifier', () => {
    const state = floorState()
    const rainy: GameState = {
      ...state,
      events: { ...state.events, modifiers: [{ modifierId: 'downpour', battlesLeft: 2 }] }
    }
    const battle = defined(act(rainy, { type: 'startWildBattle' }, never).battle, 'trận')
    expect(battle.field.weather.id).toBe('rain')
    expect(battle.log).toContainEqual({
      type: 'fieldChanged',
      layer: 'weather',
      fieldId: 'rain',
      source: 'event'
    })
  })

  it('bossChancePercent nhân tỉ lệ gặp boss', () => {
    const bossy = dataWith((raw) => {
      raw.config.events.wildBattleChance = 0
      for (const biome of raw.biomes) if (biome.id === 'lair') biome.bossChance = 5
    })
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1)
    const bosses = (withMoon: boolean): number =>
      seeds.filter((seed) => {
        const state = floorState({ floor: 2, seed })
        const modifiers = withMoon ? [{ modifierId: 'bloodMoon', battlesLeft: 3 }] : []
        return act(
          { ...state, events: { ...state.events, modifiers } },
          { type: 'startWildBattle' },
          bossy
        ).battle?.isBoss
      }).length
    expect(bosses(true)).toBeGreaterThan(bosses(false))
  })

  it('moneyPercent nhân tiền thắng trận trên tầng', () => {
    const state = floorState({ seed: 5 })
    const won = (modifiers: GameState['events']['modifiers']): GameState => {
      const opened = act(
        { ...state, events: { ...state.events, modifiers } },
        { type: 'startWildBattle' },
        never
      )
      return fightAndLeave(opened, never)
    }
    const plain = won([]).money.minus(state.money)
    const doubled = won([{ modifierId: 'bounty', battlesLeft: 1 }]).money.minus(state.money)
    expect(doubled.eq(plain.times(2))).toBe(true)
  })

  it('shopPricePercent giảm giá cửa hàng thị trấn; rời thị trấn thì modifier "tới khi rời thị trấn" mất', () => {
    const town = makeGameState({ seed: 1, party: [hero()], money: 100_000 })
    const stock = [{ storage: 'stack' as const, itemId: 'potion' }]
    const shopState = { ...town, shop: { stock } }
    const sale: GameState = {
      ...shopState,
      events: { ...shopState.events, modifiers: [{ modifierId: 'sale', battlesLeft: null }] }
    }
    const full = itemBuyPrice(data, stock[0], town.highestFloor)
    const bought = act(sale, { type: 'buyItem', item: stock[0], count: 1 })
    expect(town.money.minus(bought.money).eq(full.times(0.5).floor())).toBe(true)
    const left = act(sale, { type: 'travel', to: { type: 'floor', floor: 1 } })
    expect(left.events.modifiers).toEqual([])
  })
})

describe('cửa hàng tạm', () => {
  it('thương nhân: hàng như cửa hàng thị trấn, giá × hệ số, món gộp chồng không giới hạn', () => {
    const state = choose(
      withPendingEvent(floorState({ money: 100_000 }), 'merchant', { floor: 1 }),
      'browse'
    )
    const shop = defined(state.events.tempShop, 'cửa hàng tạm')
    expect(shop.stock).toHaveLength(2)
    expect(shop.priceMultiplier).toBe(0.5)
    const stack = defined(
      shop.stock.find((entry) => entry.entry.storage === 'stack'),
      'món gộp chồng'
    )
    expect(stack.remaining).toBeNull()
    if (stack.entry.storage !== 'stack') throw new Error('cần món gộp chồng')
    const bought = act(state, { type: 'buyEventItem', item: stack.entry, count: 3 })
    const price = itemBuyPrice(data, stack.entry, state.highestFloor).times(0.5).floor().times(3)
    expect(state.money.minus(bought.money).eq(price)).toBe(true)
    expect(getItemCount(bought.inventory, stack.entry.itemId)).toBe(
      getItemCount(state.inventory, stack.entry.itemId) + 3
    )
  })

  it('chợ đen: món số lượng giới hạn, hết hàng thì mất; mua quá số còn lại báo lỗi', () => {
    const state = choose(
      withPendingEvent(floorState({ money: 100_000 }), 'market', { floor: 1 }),
      'browse'
    )
    const shop = defined(state.events.tempShop, 'cửa hàng tạm')
    // Fixture: trang bị / sách trọng số 0; mỗi lượt một vật phẩm hiếm (không có cờ shop), 1 cái.
    expect(shop.stock).toHaveLength(3)
    for (const entry of shop.stock) {
      expect(entry.remaining).toBe(1)
      const { itemId } = entry.entry as { itemId: string }
      const def = data.items[itemId]
      expect('shop' in def && def.shop === true).toBe(false)
    }
    const item = shop.stock[0].entry as { storage: 'stack'; itemId: string }
    expectActionError(
      () => act(state, { type: 'buyEventItem', item, count: 2 }),
      'tempShopStockLow',
      { remaining: 1 }
    )
    const bought = act(state, { type: 'buyEventItem', item, count: 1 })
    expect(bought.events.tempShop?.stock).toHaveLength(2)
    expectActionError(() => act(bought, { type: 'buyEventItem', item, count: 1 }), 'notInShop')
  })

  it('chợ đen: món cần vật phẩm chìa khóa chỉ bán khi đã có món đó', () => {
    const gated = dataWith((raw) => {
      raw.config.events.blackMarket.minItemPrice = 1e12
      raw.config.events.blackMarket.extraItemIds = ['gatedStone']
      raw.items.push({ id: 'ringKey', category: 'keyItem' })
      raw.items.push({
        id: 'gatedStone',
        category: 'material',
        price: 100,
        requiresKeyItemId: 'ringKey'
      } as (typeof raw.items)[number])
    })
    const open = (state: GameState): GameState =>
      gameReducer(gated, withPendingEvent(state, 'market', { floor: 1 }), {
        type: 'chooseEventOption',
        optionId: 'browse'
      })
    expect(defined(open(floorState({ money: 100_000 })).events.tempShop).stock).toEqual([])
    const withRing = {
      ...floorState({ money: 100_000 }),
      inventory: makeInventory({ ringKey: 1 })
    }
    expect(defined(open(withRing).events.tempShop).stock.map((s) => s.entry)).toContainEqual({
      storage: 'stack',
      itemId: 'gatedStone'
    })
  })

  it('chợ đen có trang bị: món riêng, dòng ở phần trên của khoảng, mua đúng 1', () => {
    const gear = dataWith((raw) => {
      raw.config.events.blackMarket.minItemPrice = 1e12
      raw.config.events.blackMarket.equipment.weight = 1
    })
    const state = choose(
      withPendingEvent(floorState({ money: 100_000 }), 'market', { floor: 1 }),
      'browse',
      gear
    )
    const shop = defined(state.events.tempShop, 'cửa hàng tạm')
    expect(shop.stock).toHaveLength(3)
    const entry = shop.stock[0].entry
    if (entry.storage !== 'instance') throw new Error('cần trang bị')
    expect(state.nextItemId).toBeGreaterThan(3)
    expectActionError(
      () =>
        act(
          state,
          {
            type: 'buyEventItem',
            item: { storage: 'instance', instanceId: entry.instance.id },
            count: 2
          },
          gear
        ),
      'malformedAction'
    )
    const bought = act(
      state,
      {
        type: 'buyEventItem',
        item: { storage: 'instance', instanceId: entry.instance.id },
        count: 1
      },
      gear
    )
    expect(bought.inventory.equipment.map((e) => e.id)).toContain(entry.instance.id)
    expect(bought.events.tempShop?.stock).toHaveLength(2)
  })

  it('chợ đen bán sách chiêu không loài nào học (chiêu sự kiện kiểu Happy Hour)', () => {
    const books = dataWith((raw) => {
      raw.config.events.blackMarket.minItemPrice = 1e12
      raw.config.events.blackMarket.skillBooks.weight = 1
      // Power mọi skill đều ≤ shopMaxPower: chỉ còn chiêu không loài nào học.
      raw.config.skillBook = { ...raw.config.skillBook, shopMaxPower: 1e9 }
      raw.skills.push({
        id: 'eventDance',
        elementId: 'normal',
        category: 'status',
        power: 0,
        accuracy: 100,
        priority: 0,
        target: 'self',
        effects: []
      })
    })
    const state = choose(
      withPendingEvent(floorState({ money: 100_000 }), 'market', { floor: 1 }),
      'browse',
      books
    )
    const shop = defined(state.events.tempShop, 'cửa hàng tạm')
    const skillIds = shop.stock.flatMap(({ entry }) =>
      entry.storage === 'book' ? [entry.skillId] : []
    )
    expect(skillIds.length).toBeGreaterThan(0)
    for (const skillId of skillIds) expect(skillLearnerCount(books, skillId)).toBe(0)
  })

  it('cửa hàng mất khi rời chỗ gặp hoặc đi tiếp; thiếu tiền báo lỗi', () => {
    const state = choose(
      withPendingEvent(floorState({ money: 0 }), 'market', { floor: 1 }),
      'browse'
    )
    const item = defined(state.events.tempShop, 'cửa hàng tạm').stock[0].entry as {
      storage: 'stack'
      itemId: string
    }
    expectActionError(() => act(state, { type: 'buyEventItem', item, count: 1 }), 'notEnoughMoney')
    const moved = act(state, { type: 'travel', to: { type: 'floor', floor: 2 } })
    expectActionError(() => act(moved, { type: 'buyEventItem', item, count: 1 }), 'noTempShop')
    const onward = act(state, { type: 'startWildBattle' }, never)
    expect(onward.events.tempShop).toBeNull()
  })
})

describe('trận event', () => {
  it('Kẻ cướp: không chạy được; thắng: tiền × hệ số, onWin áp khi rời trận', () => {
    const state = withPendingEvent(floorState({ seed: 11 }), 'bandits', { floor: 1 })
    const opened = choose(state, 'fight')
    const battle = defined(opened.battle, 'trận')
    expect(battle.enemies).toHaveLength(2)
    expect(battle.special).toEqual({
      kind: 'event',
      eventId: 'bandits',
      noFlee: true,
      moneyMultiplier: 3
    })
    expect(opened.events.battle).toMatchObject({
      eventId: 'bandits',
      optionId: 'fight',
      resultIndex: 0
    })
    expect(opened.time).toBe(state.time)
    expectActionError(() => act(opened, { type: 'flee' }), 'specialBattleRestricted', {
      command: 'flee'
    })
    const ended = defined(fightAndLeave(opened), 'sau trận')
    expect(ended.events.battle).toBeNull()
    expect(ended.events.log).toEqual([{ type: 'itemGained', itemId: 'potion', count: 1 }])
  })

  it('tiền thắng trận event × moneyMultiplier', () => {
    const plainFight = dataWith((raw) => {
      const bandits = defined(
        raw.events.find((event) => event.id === 'bandits'),
        'bandits'
      )
      bandits.options[1].outcomes[0].results[0].params.moneyMultiplier = 1
    })
    const wonMoney = (gameData: GameData): string => {
      const state = withPendingEvent(floorState({ seed: 11 }), 'bandits', { floor: 1 })
      const ended = fightAndLeave(choose(state, 'fight', gameData), gameData)
      return ended.money.minus(state.money).toString()
    }
    const base = toBig(wonMoney(plainFight))
    expect(base.gt(0)).toBe(true)
    // onWin chỉ cho thuốc, không cho tiền: chênh lệch đúng bằng phần × 3.
    expect(toBig(wonMoney(data)).eq(base.times(3))).toBe(true)
  })

  it('thua trận event: phạt thua thường rồi onLoss', () => {
    const state = withPendingEvent(
      floorState({ party: [weakling()], money: 1000, seed: 2 }),
      'bandits',
      { floor: 1 }
    )
    const left = fightAndLeave(choose(state, 'fight'))
    // Thua: −10% (losePenaltyPercent fixture) còn 900, rồi onLoss −50% còn 450.
    expect(left.money.eq(450)).toBe(true)
    expect(left.location).toEqual({ type: 'town' })
  })

  it('không còn quái đánh được: coi như thua, áp onLoss, không mở trận', () => {
    const fainted = makeMonster({ id: 'f', damageTaken: 10_000 })
    const state = withPendingEvent(floorState({ party: [fainted], money: 1000 }), 'bandits', {
      floor: 1
    })
    const next = choose(state, 'fight')
    expect(next.battle).toBeNull()
    expect(next.money.eq(500)).toBe(true)
  })

  it('Quái bị thương: địch còn % máu, chạy được', () => {
    const opened = choose(withPendingEvent(floorState(), 'injured', { floor: 1 }), 'attack')
    const enemy = defined(opened.battle, 'trận').enemies[0]
    const maxHp = getMaxHp(data, enemy)
    expect(maxHp.minus(enemy.damageTaken).eq(maxHp.times(30).div(100).floor())).toBe(true)
    expect(() => act(opened, { type: 'flee' })).not.toThrow()
  })

  it('boss của map, chỉ số × strength; ngự thú sư NPC chế độ event', () => {
    const boss = defined(
      choose(withPendingEvent(floorState({ floor: 2 }), 'bossNest', { floor: 2 }), 'fight').battle,
      'trận'
    )
    expect(boss.isBoss).toBe(true)
    expect(boss.enemies[0].bossMultiplier).toBeGreaterThanOrEqual(
      2 * data.config.boss.multiplierMin
    )
    const duel = defined(
      choose(withPendingEvent(floorState(), 'duel', { floor: 1 }), 'accept').battle,
      'trận'
    )
    expect(duel.trainer?.mode).toBe('event')
    expect(duel.special?.kind).toBe('event')
  })
})

describe('chuỗi event', () => {
  it('mở chuỗi → sau N trận thắng ở tầng ≥ tầng mở, bước kế xuất hiện thay cho trận → đi tiếp → kết thúc', () => {
    let state = choose(
      withPendingEvent(floorState({ seed: 21 }), 'map', { floor: 1 }),
      'read',
      never
    )
    expect(state.events.chains).toEqual([
      { chainId: 'hunt', eventId: 'cave', battlesLeft: 2, floor: 1 }
    ])
    // Mở lại khi đang chạy: không mở lại.
    const again = choose(withPendingEvent(state, 'map', { floor: 1 }), 'read', never)
    expect(again.events.chains).toEqual(state.events.chains)
    for (let i = 0; i < 2; i++)
      state = fightAndLeave(act(state, { type: 'startWildBattle' }, never), never)
    expect(state.events.chains[0].battlesLeft).toBe(0)
    state = act(state, { type: 'startWildBattle' }, never)
    expect(state.events.pending).toEqual({ eventId: 'cave', floor: 1, chainId: 'hunt' })
    expect(state.events.chains).toEqual([])
    state = fightAndLeave(choose(state, 'enter', never), never)
    expect(state.events.chains).toEqual([
      { chainId: 'hunt', eventId: 'hoard', battlesLeft: 0, floor: 1 }
    ])
    state = act(state, { type: 'startWildBattle' }, never)
    expect(state.events.pending?.eventId).toBe('hoard')
    const before = state
    state = choose(state, 'open', never)
    expect(state.money.gt(before.money)).toBe(true)
    expect(state.inventory.equipment).toHaveLength(before.inventory.equipment.length + 1)
    expect(state.events.log.at(-1)).toEqual({ type: 'chainEnded', chainId: 'hunt' })
    expect(state.events.chains).toEqual([])
  })

  it('bỏ bước chuỗi thì chuỗi kết thúc; trận ở tầng thấp hơn tầng mở không tính', () => {
    const base = floorState({ floor: 2 })
    const chain = { chainId: 'hunt', eventId: 'cave', battlesLeft: 1, floor: 2 }
    const low = {
      ...base,
      location: { type: 'floor' as const, floor: 1 },
      events: { ...base.events, chains: [chain] }
    }
    const afterLow = fightAndLeave(act(low, { type: 'startWildBattle' }, never), never)
    expect(afterLow.events.chains).toEqual([chain])
    const due = { ...base, events: { ...base.events, chains: [{ ...chain, battlesLeft: 0 }] } }
    const shown = act(due, { type: 'startWildBattle' }, never)
    const left = choose(shown, 'leave', never)
    expect(left.events.chains).toEqual([])
    expect(left.events.log.at(-1)).toEqual({ type: 'chainEnded', chainId: 'hunt' })
  })
})

describe('event thị trấn', () => {
  it('vào thị trấn từ tầng: townChance % gặp event thị trấn (sau khi đổi hàng); thị trấn → thị trấn thì không', () => {
    const next = act(floorState(), { type: 'travel', to: { type: 'town' } }, always)
    expect(next.events.pending).toEqual({ eventId: 'stranger', floor: null, chainId: null })
    const town = makeGameState({ seed: 1, party: [hero()] })
    expect(act(town, { type: 'travel', to: { type: 'town' } }, always)).toBe(town)
  })

  it('Khách lạ: tinh thể trait rare cấp 1, giá × 2, mua một lần', () => {
    const state = choose(
      withPendingEvent(makeGameState({ seed: 4, party: [hero()], money: 1_000_000 }), 'stranger'),
      'browse'
    )
    const shop = defined(state.events.tempShop, 'cửa hàng tạm')
    expect(shop.floor).toBeNull()
    expect(shop.stock).toHaveLength(1)
    const entry = shop.stock[0].entry
    if (entry.storage !== 'crystal') throw new Error('cần tinh thể')
    expect(data.traits[entry.traitId].kind).toBe('rare')
    expect(entry.level).toBe(1)
    const item = { storage: 'crystal' as const, traitId: entry.traitId, level: 1 }
    const bought = act(state, { type: 'buyEventItem', item, count: 1 })
    const price = itemBuyPrice(data, entry, state.highestFloor).times(2).floor()
    expect(state.money.minus(bought.money).eq(price)).toBe(true)
    expect(bought.events.tempShop?.stock).toEqual([])
  })
})
