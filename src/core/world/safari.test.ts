// Khu bảo tồn (docs/rules/safari-zone.md): vào khu (phí, bóng, lượt gặp), danh sách loài theo đợt,
// ném bóng / mồi / đá, bỏ đi, chạy trốn, bắt trượt, ra khu (24 giờ), chặn action khác, save, migrate.

import { describe, expect, it } from 'vitest'
import { gameReducer, migrateState, validateGameState } from '../game'
import { createGameData } from '../gameData'
import { cloneData, toBig } from '../shared'
import { advanceTime } from '../progression'
import {
  dataIssuesAfter,
  defined,
  expectActionError,
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { GameAction, GameData, GameState, SafariConfig, SafariVisit } from '../model'
import { floorLevelRange } from './floors'
import { safariCatchChance, safariEntryFee, safariFleeChance } from './safari'
import { rollSafariRoster, safariSpeciesWeight } from './safariRoster'

// Fixture: loài quái thường của mọi map chỉ có weakling (catchRate 50); strongling là boss nên không
// vào khu; megaWeakling là dạng Mega (không vào khu); các loài còn lại không gán vào map nào.
// Số khu bảo tồn như dữ liệu thật: phí 500 × highestFloor, 30 bóng, 20 lượt gặp.

/** Dữ liệu fixture có mồi dụ, ghi đè config.safari. */
function safariData(safari: Partial<SafariConfig> = {}): GameData {
  const raw = makeRawData()
  raw.config.safari = { ...raw.config.safari, ...safari }
  raw.items.push(
    { id: 'lure', category: 'bait', price: 10, recruitPercent: 50, battles: 2 },
    {
      id: 'neutralLure',
      category: 'bait',
      price: 10,
      recruitPercent: 50,
      battles: 2,
      favoriteRaceIds: ['neutral']
    }
  )
  return createGameData(withFixtureText(raw))
}

/** Không bao giờ chạy, chỉ gặp weakling (một ô danh sách, không lấy loài ngoài map). */
const calm = { fleeBase: 0, fleeRarity: 0, rosterSize: 1, unmappedChance: 0 }
/** Bóng luôn bắt được / không bao giờ bắt được. */
const sure = safariData({ ...calm, ballCatchMultiplier: 1e6 })
const never = safariData({ ...calm, ballCatchMultiplier: 0 })
const base = safariData()

const town = (overrides: Partial<GameState> = {}): GameState => ({
  ...makeGameState({ seed: 7, party: [makeMonster({ id: 'a' })], nextMonsterId: 10 }),
  money: toBig(10_000),
  ...overrides
})

const act = (data: GameData, state: GameState, action: GameAction): GameState =>
  gameReducer(data, state, action)

const enter = (data: GameData, state: GameState = town()): GameState =>
  act(data, state, { type: 'enterSafari' })

const visitOf = (state: GameState): SafariVisit => defined(state.safari.visit, 'lượt vào khu')

describe('vào khu bảo tồn', () => {
  it('trả phí 500 × highestFloor, nhận 30 bóng, gặp quái đầu tiên (còn 19 lượt gặp)', () => {
    const state = town({ highestFloor: 2, floorBiomeIds: ['field', 'lair'] })
    const inside = enter(sure, state)
    expect(inside.money).toEqual(toBig(10_000 - 1000))
    const visit = visitOf(inside)
    expect(visit).toMatchObject({ encountersLeft: 19, balls: 30, caught: 0 })
    expect(visit.encounter).toMatchObject({ misses: 0, lure: null })
    const monster = visit.encounter.monster
    expect(monster).toMatchObject({ id: 'm10', speciesId: 'weakling', contractRealm: null })
    expect(monster.history).toBeNull()
    const levels = floorLevelRange(sure, 2)
    expect(monster.level).toBeGreaterThanOrEqual(levels.min)
    expect(monster.level).toBeLessThanOrEqual(levels.max)
    expect(inside.nextMonsterId).toBe(11)
    expect(inside.safari.roster).toEqual(['weakling'])
    expect(inside.safari.refreshDay).toBe(7) // ngày 0 + rotationDays
    expect(inside.safari.log).toEqual([
      { type: 'encounter', monsterId: 'm10', speciesId: 'weakling' }
    ])
    expect(inside.time).toBe(state.time) // giờ tính lúc ra khu
    expect(validateGameState(sure, inside)).toEqual([])
  })

  it('tầng rất cao: level như quái hoang của tầng (bắt không theo giới hạn khế ước)', () => {
    const floors = Array.from({ length: 500 }, () => 'field')
    const state = town({ highestFloor: 500, floorBiomeIds: floors, money: toBig('1e30') })
    const monster = visitOf(enter(sure, state)).encounter.monster
    expect(monster.level).toBeGreaterThanOrEqual(floorLevelRange(sure, 500).min)
    expect(enter(sure, state).money).toEqual(toBig('1e30').minus(500 * 500))
  })

  it('cùng state cho cùng kết quả', () => {
    expect(enter(base)).toEqual(enter(base))
  })

  it('báo lỗi, state giữ nguyên: không ở thị trấn, đang đánh / bí cảnh, thiếu tiền', () => {
    const state = town()
    expectActionError(
      () => enter(base, { ...state, location: { type: 'floor', floor: 1 } }),
      'notInTown'
    )
    expectActionError(() => enter(base, { ...state, money: toBig(499) }), 'notEnoughMoney', {
      need: toBig(500),
      have: toBig(499)
    })
    const trial = { ...state, trial: {} as GameState['trial'] }
    expectActionError(() => enter(base, trial), 'trialInProgress')
    const inside = enter(base, state)
    expectActionError(() => enter(base, inside), 'inSafari')
  })

  it('đang trong khu chỉ làm được action của khu; ngoài khu action của khu báo notInSafari', () => {
    const inside = enter(base)
    expectActionError(() => act(base, inside, { type: 'healParty' }), 'inSafari')
    expectActionError(() => act(base, inside, { type: 'rest' }), 'inSafari')
    for (const type of [
      'throwSafariBall',
      'throwSafariRock',
      'skipSafariEncounter',
      'leaveSafari'
    ] as const) {
      expectActionError(() => act(base, town(), { type }), 'notInSafari')
    }
    expectActionError(() => act(base, town(), { type: 'throwSafariBait' }), 'notInSafari')
  })
})

describe('danh sách loài', () => {
  it('chỉ loài quái thường của map đã mở; một nhóm hết loài thì lấy nhóm kia; không trùng', () => {
    const mappedOnly = safariData({ rosterSize: 1, unmappedChance: 0 })
    expect(rollSafariRoster(mappedOnly, 1, ['field'])[0]).toEqual(['weakling'])
    const wide = safariData({ rosterSize: 50, unmappedChance: 0 })
    const [roster] = rollSafariRoster(wide, 1, ['field'])
    expect(roster[0]).toBe('weakling')
    expect(new Set(roster).size).toBe(roster.length)
    // Boss (strongling), dạng Mega (megaWeakling) không vào khu.
    expect(roster).not.toContain('strongling')
    expect(roster).not.toContain('megaWeakling')
    expect(roster.length).toBeGreaterThan(1)
  })

  it('unmappedChance 100: lấy loài không gán vào map nào; không có map nào thì cũng vậy', () => {
    const unmapped = safariData({ rosterSize: 1, unmappedChance: 100 })
    const [roster] = rollSafariRoster(unmapped, 3, ['field'])
    expect(roster).toHaveLength(1)
    expect(['weakling', 'strongling', 'megaWeakling']).not.toContain(roster[0])
    expect(rollSafariRoster(safariData({ rosterSize: 1 }), 3, [])[0]).toHaveLength(1)
  })

  it('trọng số: catchRate thấp nặng hơn, phẩm cấp cao nhẹ hơn, luôn > 0', () => {
    const weakling = sure.species.weakling
    if (weakling.kind !== 'normal') throw new Error('fixture')
    const rare = { ...weakling, catchRate: 0 }
    const common = { ...weakling, catchRate: 100 }
    expect(safariSpeciesWeight(sure, rare)).toBeGreaterThan(safariSpeciesWeight(sure, common))
    expect(safariSpeciesWeight(sure, common)).toBeGreaterThan(0)
    const ranks = Object.keys(sure.speciesRanks)
    const top = { ...weakling, rank: ranks[ranks.length - 1] }
    const bottom = { ...weakling, rank: ranks[0] }
    expect(safariSpeciesWeight(sure, top)).toBeLessThan(safariSpeciesWeight(sure, bottom))
  })

  it('đổi mỗi rotationDays ngày (việc theo ngày); trước ngày làm mới thì giữ nguyên', () => {
    const inside = enter(sure)
    const out = act(sure, inside, { type: 'leaveSafari' }) // ngày 0 → giờ 30 (ngày 1)
    expect(out.safari.refreshDay).toBe(7)
    const stale = { ...out, safari: { ...out.safari, roster: ['twig'] } }
    const day6 = advanceTime(sure, stale, 6 * 24 - stale.time) // tới đầu ngày 6
    expect(day6.safari.roster).toEqual(['twig'])
    const day7 = advanceTime(sure, day6, 24)
    expect(day7.safari.roster).toEqual(['weakling'])
    expect(day7.safari.refreshDay).toBe(14)
  })

  it('vào khu khi danh sách rỗng mà chưa tới ngày làm mới: báo safariUnavailable', () => {
    const state = town({ safari: { roster: [], refreshDay: 5, visit: null, log: [] } })
    expectActionError(() => enter(sure, state), 'safariUnavailable')
  })
})

describe('ném bóng', () => {
  it('bắt được: lý lịch safari, chưa khế ước, thân mật như bắt bóng, vào đội; gặp quái kế', () => {
    const inside = enter(sure)
    const after = act(sure, inside, { type: 'throwSafariBall' })
    const caught = defined(after.party.find((m) => m.id === 'm10'))
    expect(caught.history?.origin).toEqual({ kind: 'safari' })
    expect(caught.history?.metFloor).toBeNull()
    expect(caught.contractRealm).toBeNull()
    expect(caught.affinity).toBe(sure.config.affinity.start.caught)
    const visit = visitOf(after)
    expect(visit).toMatchObject({ balls: 29, caught: 1, encountersLeft: 18 })
    // Bộ đếm thành tựu (docs/rules/achievements.md): tính một quái bắt.
    expect(after.stats.monstersCaught).toBe(1)
    expect(visit.encounter.monster.id).toBe('m11')
    expect(after.safari.log.map((e) => e.type)).toEqual(['throwBall', 'caught', 'encounter'])
    expect(validateGameState(sure, after)).toEqual([])
  })

  it('đội đầy thì vào kho', () => {
    const party = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeMonster({ id }))
    const inside = enter(sure, town({ party }))
    const after = act(sure, inside, { type: 'throwSafariBall' })
    expect(after.party).toHaveLength(6)
    expect(after.storage.map((m) => m.id)).toEqual(['m10'])
  })

  it('trượt: mất bóng, cộng bắt trượt 5 điểm % mỗi lần cho đúng quái đó', () => {
    const inside = enter(never)
    expect(safariCatchChance(never, inside, visitOf(inside).encounter)).toBe(0)
    const once = act(never, inside, { type: 'throwSafariBall' })
    const visit = visitOf(once)
    expect(visit).toMatchObject({ balls: 29, encountersLeft: 19 })
    expect(visit.encounter.misses).toBe(1)
    expect(safariCatchChance(never, once, visit.encounter)).toBeCloseTo(5)
    const twice = act(never, once, { type: 'throwSafariBall' })
    expect(safariCatchChance(never, twice, visitOf(twice).encounter)).toBeCloseTo(10)
    // Quái mới không mang bắt trượt của quái cũ.
    const skipped = act(never, twice, { type: 'skipSafariEncounter' })
    expect(visitOf(skipped).encounter.misses).toBe(0)
  })

  it('hết bóng thì ra khu; cả lượt tốn 24 giờ', () => {
    const inside = enter(never, town({ time: 6 }))
    const last = {
      ...inside,
      safari: { ...inside.safari, visit: { ...visitOf(inside), balls: 1 } }
    }
    const out = act(never, last, { type: 'throwSafariBall' })
    expect(out.safari.visit).toBeNull()
    expect(out.safari.log.at(-1)).toEqual({ type: 'visitEnded', caught: 0 })
    expect(out.time).toBe(6 + 24)
  })

  it('quái chạy mất sau lượt (fleeBase 100): sang lượt gặp kế', () => {
    const flighty = safariData({ ...calm, fleeBase: 100, ballCatchMultiplier: 0 })
    const inside = enter(flighty)
    const after = act(flighty, inside, { type: 'throwSafariBall' })
    expect(after.safari.log.map((e) => e.type)).toEqual([
      'throwBall',
      'breakFree',
      'fled',
      'encounter'
    ])
    expect(visitOf(after).encountersLeft).toBe(18)
  })
})

describe('mồi, đá, bỏ đi, rời khu', () => {
  const flee = safariData({ ...calm, fleeBase: 20 })

  it('tỉ lệ chạy theo độ hiếm: fleeBase + fleeRarity × (1 − catchRate / 100), kẹp 0–100', () => {
    const rarity = safariData({ rosterSize: 1, unmappedChance: 0 })
    const encounter = visitOf(enter(rarity)).encounter // weakling catchRate 50
    expect(safariFleeChance(rarity, encounter)).toBeCloseTo(10 + 20 * 0.5)
    const huge = safariData({ fleeBase: 100, fleeRarity: 100 })
    expect(
      safariFleeChance(huge, {
        ...encounter,
        lure: { kind: 'rock', turnsLeft: 1, favorite: false }
      })
    ).toBe(100)
  })

  it('mồi thường: chạy × 0,5, bắt × 0,8 trong 3 lượt (kể cả lượt ném); miễn phí', () => {
    const inside = enter(flee)
    const encounter = visitOf(inside).encounter
    const plainCatch = safariCatchChance(flee, inside, encounter)
    const baited = act(flee, inside, { type: 'throwSafariBait' })
    const lured = visitOf(baited).encounter
    expect(lured.lure).toEqual({ kind: 'bait', turnsLeft: 2, favorite: false })
    expect(safariFleeChance(flee, lured)).toBeCloseTo(20 * 0.5 + 0)
    expect(safariCatchChance(flee, baited, lured)).toBeCloseTo(plainCatch * 0.8)
    expect(baited.safari.log[0]).toMatchObject({ type: 'lure', kind: 'bait', itemId: null })
    expect(baited.inventory).toEqual(inside.inventory)
  })

  it('mồi khẩu vị đúng race: không giảm tỉ lệ bắt; mất một mồi trong túi', () => {
    const inside = enter(flee, town({ inventory: makeInventory({ neutralLure: 2, lure: 1 }) }))
    const plainCatch = safariCatchChance(flee, inside, visitOf(inside).encounter)
    const baited = act(flee, inside, { type: 'throwSafariBait', itemId: 'neutralLure' })
    const lured = visitOf(baited).encounter
    expect(lured.lure).toEqual({ kind: 'bait', turnsLeft: 2, favorite: true })
    expect(safariCatchChance(flee, baited, lured)).toBeCloseTo(plainCatch)
    expect(baited.inventory.stacks).toEqual({ neutralLure: 1, lure: 1 })
    // Mồi không có khẩu vị của quái này: như mồi thường.
    const other = act(flee, inside, { type: 'throwSafariBait', itemId: 'lure' })
    expect(visitOf(other).encounter.lure?.favorite).toBe(false)
  })

  it('mồi báo lỗi: không phải mồi, không có trong túi, không tồn tại', () => {
    const inside = enter(flee, town({ inventory: makeInventory({ ball: 1 }) }))
    expectActionError(
      () => act(flee, inside, { type: 'throwSafariBait', itemId: 'ball' }),
      'notBait'
    )
    expectActionError(
      () => act(flee, inside, { type: 'throwSafariBait', itemId: 'lure' }),
      'notEnoughItem'
    )
    expectActionError(
      () => act(flee, inside, { type: 'throwSafariBait', itemId: 'zz' }),
      'unknownItem'
    )
  })

  it('đá: bắt × 2, chạy × 1,5, thay mồi đang có', () => {
    const steady = safariData(calm)
    const inside = enter(steady)
    const encounter = visitOf(inside).encounter
    const plainCatch = safariCatchChance(steady, inside, encounter)
    const baited = act(steady, inside, { type: 'throwSafariBait' })
    const rocked = act(steady, baited, { type: 'throwSafariRock' })
    const hit = visitOf(rocked).encounter
    expect(hit.lure).toEqual({ kind: 'rock', turnsLeft: 2, favorite: false })
    expect(safariCatchChance(steady, rocked, hit)).toBeCloseTo(plainCatch * 2)
    expect(safariFleeChance(flee, hit)).toBeCloseTo(30) // 20 × 1,5
  })

  it('mồi / đá bớt mỗi lượt rồi hết', () => {
    const inside = enter(never)
    let state = act(never, inside, { type: 'throwSafariRock' })
    expect(visitOf(state).encounter.lure?.turnsLeft).toBe(2)
    state = act(never, state, { type: 'throwSafariBall' })
    expect(visitOf(state).encounter.lure?.turnsLeft).toBe(1)
    state = act(never, state, { type: 'throwSafariBall' })
    expect(visitOf(state).encounter.lure).toBeNull()
  })

  it('bỏ đi: sang lượt gặp kế; lượt gặp cuối thì ra khu (24 giờ)', () => {
    const inside = enter(sure, town({ time: 6 }))
    const skipped = act(sure, inside, { type: 'skipSafariEncounter' })
    expect(visitOf(skipped)).toMatchObject({ encountersLeft: 18, balls: 30 })
    expect(skipped.safari.log.map((e) => e.type)).toEqual(['skipped', 'encounter'])
    const last = {
      ...inside,
      safari: { ...inside.safari, visit: { ...visitOf(inside), encountersLeft: 0 } }
    }
    const out = act(sure, last, { type: 'skipSafariEncounter' })
    expect(out.safari.visit).toBeNull()
    expect(out.time).toBe(30)
  })

  it('rời khu: mất lượt gặp và bóng còn lại, báo số quái đã bắt, 24 giờ', () => {
    const inside = enter(sure, town({ time: 6 }))
    const caughtOne = act(sure, inside, { type: 'throwSafariBall' })
    const out = act(sure, caughtOne, { type: 'leaveSafari' })
    expect(out.safari.visit).toBeNull()
    expect(out.safari.log).toEqual([{ type: 'visitEnded', caught: 1 }])
    expect(out.time).toBe(30)
    // Ra khu thì làm việc khác được.
    expect(act(sure, out, { type: 'travel', to: { type: 'floor', floor: 1 } }).time).toBe(31)
  })
})

describe('save khu bảo tồn', () => {
  it('kiểm tra: loài lạ / trùng, số âm, mồi lạ, quái đang gặp, khu khi đang ở tầng', () => {
    const inside = enter(base)
    const visit = visitOf(inside)
    const broken: GameState = {
      ...inside,
      location: { type: 'floor', floor: 1 },
      safari: {
        ...inside.safari,
        roster: ['weakling', 'weakling', 'zz'],
        refreshDay: -1,
        visit: {
          ...visit,
          balls: 0,
          encounter: {
            ...visit.encounter,
            misses: -1,
            lure: { kind: 'rock', turnsLeft: 0, favorite: true }
          }
        }
      }
    }
    expect(validateGameState(base, broken)).toEqual([
      'safari.roster[1]: loài bị trùng "weakling"',
      'safari.roster[2]: loài không hợp lệ "zz"',
      'safari.refreshDay phải là số nguyên ≥ 0, nhận -1',
      'safari.visit.balls phải là số nguyên ≥ 1, nhận 0',
      'safari.visit: chỉ có ở thị trấn',
      'safari.visit.encounter.misses phải là số nguyên ≥ 0, nhận -1',
      'safari.visit.encounter.lure.turnsLeft phải là số nguyên ≥ 1, nhận 0',
      'safari.visit.encounter.lure.favorite: chỉ mồi có khẩu vị'
    ])
  })

  it('id quái đang gặp tính vào nextMonsterId', () => {
    const inside = enter(base)
    expect(validateGameState(base, { ...inside, nextMonsterId: 10 })).toEqual([
      'nextMonsterId phải lớn hơn mọi id quái (hiện có m10)'
    ])
  })

  it('migrate v53 → v54: chưa có danh sách loài, không ở trong khu', () => {
    const current = town()
    const { safari: _safari, ...rest } = cloneData(current)
    const old = JSON.parse(JSON.stringify({ ...rest, version: 53 }))
    const migrated = migrateState(old, base)
    expect(migrated.safari).toEqual({ roster: [], refreshDay: 0, visit: null, log: [] })
    expect(validateGameState(base, migrated)).toEqual([])
  })

  it('kiểm tra dữ liệu config.safari', () => {
    expect(
      dataIssuesAfter((raw) => {
        raw.config.safari = {
          ...raw.config.safari,
          balls: 0,
          rankFalloff: 0,
          lures: {
            ...raw.config.safari.lures,
            bait: { catchMultiplier: -1, fleeMultiplier: 1, turns: 0 }
          }
        }
      })
    ).toEqual([
      'config.safari.balls phải là số nguyên ≥ 1, nhận 0',
      expect.stringContaining('config.safari.rankFalloff'),
      expect.stringContaining('config.safari.lures.bait.catchMultiplier'),
      'config.safari.lures.bait.turns phải là số nguyên ≥ 1, nhận 0'
    ])
  })

  it('phí vào là Decimal (tầng lớn)', () => {
    expect(safariEntryFee(base, { highestFloor: Number.MAX_SAFE_INTEGER })).toEqual(
      toBig(500).times(Number.MAX_SAFE_INTEGER)
    )
  })
})
