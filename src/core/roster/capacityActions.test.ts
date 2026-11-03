// Sức chứa kho quái / túi trang bị (docs/rules/capacity.md): sức chứa theo mở rộng + mốc cảnh giới,
// mở rộng ở NPC kho đồ, chặn khi đầy (cất kho, khu bảo tồn, mua / tháo / đúc), xác nhận bỏ món thừa
// khi mất quái (thả, fuse, hiến tế, cấy ghép), kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { capacityExpandCost, capacityOf, capacityView, hasRosterRoom } from '../registries'
import { toBig } from '../shared'
import {
  atFloor,
  dataIssuesAfter,
  defined,
  equipped,
  expectActionError,
  makeData,
  makeEquipment,
  makeEquipmentData,
  makeGameState,
  makeMonster
} from '../testing'
import type { CapacityRule, GameAction, GameData, GameState, Monster } from '../model'

/** Dữ liệu trang bị mẫu với sức chứa nhỏ để test đầy nhanh. */
function smallData(storage: Partial<CapacityRule> = {}, bag: Partial<CapacityRule> = {}): GameData {
  return makeEquipmentData((raw) => {
    raw.config.capacity = {
      storage: { ...raw.config.capacity.storage, base: 1, realmBonus: 0, ...storage },
      bag: { ...raw.config.capacity.bag, base: 1, realmBonus: 0, ...bag }
    }
  })
}

const data = smallData()
const mon = (id: string, overrides: Partial<Monster> = {}): Monster =>
  makeMonster({ id, ...overrides })

function town(party: Monster[], storage: Monster[] = []): GameState {
  return { ...makeGameState({ seed: 1, party }), storage, money: toBig(1e7) }
}

const act = (state: GameState, action: GameAction, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, action)

describe('sức chứa', () => {
  it('base + perExpansion × lần mở rộng + realmBonus × mốc cảnh giới', () => {
    const real = makeData()
    const state = makeGameState({ seed: 1, party: [mon('a')] })
    expect(capacityOf(real, state, 'storage')).toBe(200)
    expect(capacityOf(real, state, 'bag')).toBe(100)
    const grown = {
      ...state,
      capacity: { storage: 2, bag: 1 },
      tamer: { ...state.tamer, realm: 5 }
    }
    // Mốc cảnh giới 2, 5: +2 × 50 kho, +2 × 25 túi.
    expect(capacityOf(real, grown, 'storage')).toBe(200 + 100 + 100)
    expect(capacityOf(real, grown, 'bag')).toBe(100 + 50 + 50)
    // Mốc gấp đôi mãi sau mốc cuối (10 → 20 → 40...).
    expect(capacityOf(real, { ...grown, tamer: { ...grown.tamer, realm: 40 } }, 'storage')).toBe(
      200 + 100 + 5 * 50
    )
  })

  it('mở rộng: giá costBase × k², +perExpansion; ngoài thị trấn / thiếu tiền báo lỗi', () => {
    const real = makeData()
    const state = town([mon('a')])
    const once = act(state, { type: 'expandCapacity', kind: 'storage' }, real)
    expect(once.capacity).toEqual({ storage: 1, bag: 0 })
    expect(once.money.toNumber()).toBe(1e7 - 1000)
    const twice = act(once, { type: 'expandCapacity', kind: 'storage' }, real)
    expect(twice.money.toNumber()).toBe(1e7 - 1000 - 4000)
    expect(capacityOf(real, twice, 'storage')).toBe(300)
    const bag = act(state, { type: 'expandCapacity', kind: 'bag' }, real)
    expect(bag.money.toNumber()).toBe(1e7 - 1500)
    expectActionError(
      () => act(atFloor(state, 1), { type: 'expandCapacity', kind: 'bag' }, real),
      'notInTown'
    )
    expectActionError(
      () => act({ ...state, money: toBig(999) }, { type: 'expandCapacity', kind: 'storage' }, real),
      'notEnoughMoney'
    )
    expectActionError(
      () => act(state, { type: 'expandCapacity', kind: 'cave' as 'bag' }, real),
      'malformedAction'
    )
    // Biên: số lần mở rộng cực lớn vẫn ra giá Decimal hữu hạn.
    const huge = { ...state, capacity: { storage: 1e15, bag: 0 } }
    expect(capacityExpandCost(real, huge, 'storage').gt(1e30)).toBe(true)
  })

  it('còn chỗ: đội còn ô hoặc kho chưa đầy (tính cả quái đã bắt trong trận)', () => {
    const state = town([mon('a'), mon('b'), mon('c'), mon('d'), mon('e')])
    const newcomer = mon('n')
    expect(hasRosterRoom(data, state, { newcomer })).toBe(true)
    // Một chỗ đội + một chỗ kho: quái thứ ba thì hết chỗ.
    expect(hasRosterRoom(data, state, { pending: [mon('p')], newcomer })).toBe(true)
    expect(hasRosterRoom(data, state, { pending: [mon('p'), mon('q')], newcomer })).toBe(false)
    expect(capacityView(data, state)).toMatchObject({
      storage: { used: 0, capacity: 1 },
      bag: { used: 0, capacity: 1 }
    })
  })
})

describe('kho quái đầy', () => {
  const full = (): GameState =>
    town([mon('a'), mon('b'), mon('c'), mon('d'), mon('e'), mon('f')], [mon('s')])

  it('cất vào kho đầy báo lỗi; đổi chỗ với quái trong kho vẫn được', () => {
    const state = town([mon('a'), mon('b')], [mon('s')])
    expectActionError(() => act(state, { type: 'moveToStorage', monsterId: 'a' }), 'rosterFull', {
      capacity: 1
    })
    const swapped = act(state, {
      type: 'swapWithStorage',
      partyMonsterId: 'a',
      storageMonsterId: 's'
    })
    expect(swapped.storage.map((m) => m.id)).toEqual(['a'])
  })

  it('không vào khu bảo tồn (không mất phí)', () => {
    expectActionError(() => act(full(), { type: 'enterSafari' }), 'rosterFull')
  })

  it('kiểm tra save: kho vượt sức chứa báo lỗi; capacity phải nguyên ≥ 0', () => {
    expect(validateGameState(data, full())).toEqual([])
    const over = { ...full(), storage: [mon('s'), mon('t')] }
    expect(validateGameState(data, over).join()).toMatch(/vượt sức chứa 1/)
    const bad = { ...full(), capacity: { storage: -1, bag: 0.5 } }
    expect(validateGameState(data, bad).join()).toMatch(/capacity.storage/)
    expect(validateGameState(data, bad).join()).toMatch(/capacity.bag/)
  })
})

describe('túi trang bị đầy', () => {
  const sword = (id: string): ReturnType<typeof makeEquipment> => makeEquipment({ id })
  const withBag = (state: GameState, ids: string[]): GameState => ({
    ...state,
    inventory: { ...state.inventory, equipment: ids.map(sword) }
  })

  it('không tháo món trang bị về túi đầy; đồ gộp chồng vẫn tháo được', () => {
    const wearer = mon('a', { equipment: [equipped(sword('w1'))] })
    const state = withBag(town([wearer, mon('b')]), ['e1'])
    expectActionError(
      () => act(state, { type: 'unequipItem', monsterId: 'a', slotIndex: 0 }),
      'bagFull',
      { capacity: 1 }
    )
    const roomy = withBag(town([wearer, mon('b')]), [])
    expect(
      act(roomy, { type: 'unequipItem', monsterId: 'a', slotIndex: 0 }).inventory.equipment
    ).toHaveLength(1)
  })

  it('không mua món trang bị vào túi đầy (không mất tiền)', () => {
    const forSale = sword('shop1')
    const state = {
      ...withBag(town([mon('a')]), ['e1']),
      shop: { stock: [{ storage: 'instance' as const, instance: forSale }] }
    }
    const buy: GameAction = {
      type: 'buyItem',
      item: { storage: 'instance', instanceId: 'shop1' },
      count: 1
    }
    expectActionError(() => act(state, buy), 'bagFull', { capacity: 1 })
    expect(act(withBag(state, []), buy).inventory.equipment.map((e) => e.id)).toEqual(['shop1'])
  })

  it('thả quái: món không đủ chỗ cần xác nhận; xác nhận thì bỏ phần thừa', () => {
    const wearer = mon('a', { equipment: [equipped(sword('w1')), equipped(sword('w2'))] })
    const state = town([wearer, mon('b')])
    expectActionError(() => act(state, { type: 'releaseMonster', monsterId: 'a' }), 'bagOverflow', {
      lost: 1
    })
    const released = act(state, { type: 'releaseMonster', monsterId: 'a', discardOverflow: true })
    expect(released.party.map((m) => m.id)).toEqual(['b'])
    expect(released.inventory.equipment.map((e) => e.id)).toEqual(['w1'])
    // Đủ chỗ thì không cần xác nhận.
    const roomy = smallData({}, { base: 5 })
    expect(
      act(state, { type: 'releaseMonster', monsterId: 'a' }, roomy).inventory.equipment
    ).toHaveLength(2)
  })

  it('thả hàng loạt: món của mọi con tính chung khi xét chỗ trong túi', () => {
    const first = mon('a', { equipment: [equipped(sword('w1'))] })
    const second = mon('b', { equipment: [equipped(sword('w2'))] })
    const state = town([first, second, mon('c')])
    const release: GameAction = { type: 'releaseMonsters', monsterIds: ['a', 'b'] }
    expectActionError(() => act(state, release), 'bagOverflow', { lost: 1 })
    const released = act(state, { ...release, discardOverflow: true })
    expect(released.party.map((m) => m.id)).toEqual(['c'])
    expect(released.inventory.equipment.map((e) => e.id)).toEqual(['w1'])
  })

  it('quái phụ hiến tế / fuse: như thả quái', () => {
    const sub = mon('b', { equipment: [equipped(sword('w1')), equipped(sword('w2'))] })
    const state = town([mon('a', { level: 10 }), sub])
    expectActionError(
      () => act(state, { type: 'sacrifice', baseId: 'a', subIds: ['b'] }),
      'bagOverflow',
      { lost: 1 }
    )
    const done = act(state, {
      type: 'sacrifice',
      baseId: 'a',
      subIds: ['b'],
      discardOverflow: true
    })
    expect(done.inventory.equipment).toHaveLength(1)
    const fuseSub = mon('b', {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      equipment: [equipped(sword('w1')), equipped(sword('w2'))]
    })
    expectActionError(
      () =>
        act(town([mon('a', { level: 10 }), fuseSub, mon('c')]), {
          type: 'fuse',
          baseId: 'a',
          subId: 'b'
        }),
      'bagOverflow'
    )
  })

  it('cấy ghép có thể mất quái: món không đủ chỗ cần xác nhận trước khi cấy', () => {
    const risky = mon('a', {
      implantAttempts: 2,
      implantFails: 2,
      equipment: [equipped(sword('w1')), equipped(sword('w2'))]
    })
    const state: GameState = {
      ...town([risky, mon('b')]),
      lab: {
        stock: [
          { tierId: 'common', effects: [{ kind: 'flatStat', stat: 'hp', amount: toBig(5) }] }
        ],
        restockDay: 10
      }
    }
    expectActionError(
      () => act(state, { type: 'implant', monsterId: 'a', serumIndex: 0 }),
      'bagOverflow'
    )
    const doomed = {
      ...data,
      config: { ...data.config, implant: { ...data.config.implant, baseChance: 0 } }
    }
    const lost = act(
      state,
      { type: 'implant', monsterId: 'a', serumIndex: 0, discardOverflow: true },
      doomed
    )
    expect(lost.party.map((m) => m.id)).toEqual(['b'])
    // Một món về túi, hồn phách luôn giữ (được vượt sức chứa).
    expect(lost.inventory.equipment).toHaveLength(1)
    expect(defined(lost.inventory.souls.at(-1)).id).toBe('a')
    // Chưa tới lần có thể mất quái thì không cần xác nhận.
    const safe = { ...state, party: [{ ...risky, implantFails: 0 }, mon('b')] }
    expect(act(safe, { type: 'implant', monsterId: 'a', serumIndex: 0 }).party).toHaveLength(2)
  })
})

describe('dữ liệu và save', () => {
  it('kiểm tra config.capacity', () => {
    expect(
      dataIssuesAfter((raw) => {
        raw.config.capacity = {
          storage: { base: -1, perExpansion: 0, costBase: -5, realmBonus: 1.5 },
          bag: raw.config.capacity.bag
        }
      })
    ).toEqual([
      'config.capacity.storage.base phải là số nguyên ≥ 0, nhận -1',
      'config.capacity.storage.perExpansion phải là số nguyên ≥ 1, nhận 0',
      expect.stringContaining('config.capacity.storage.costBase'),
      'config.capacity.storage.realmBonus phải là số nguyên ≥ 0, nhận 1.5'
    ])
  })

  it('migrate v76 → v77: số lần mở rộng đủ chứa những gì đang có, làm tròn lên bội số 50', () => {
    const real = makeData()
    const many = Array.from({ length: 230 }, (_, i) => mon(`s${i + 2}`))
    const state = { ...makeGameState({ seed: 1, party: [mon('m1')] }), storage: many }
    const { capacity: _capacity, ...raw } = serializeState(state) as Record<string, unknown>
    const migrated = migrateState({ ...raw, version: 76 }, real)
    // 230 quái > 200: một lần mở rộng (250).
    expect(migrated.capacity).toEqual({ storage: 1, bag: 0 })
    expect(capacityOf(real, migrated, 'storage')).toBe(250)
    const small = serializeState(makeGameState({ seed: 1, party: [mon('m1')] })) as Record<
      string,
      unknown
    >
    const { capacity: _c, ...smallRaw } = small
    expect(migrateState({ ...smallRaw, version: 76 }, real).capacity).toEqual({
      storage: 0,
      bag: 0
    })
  })
})
