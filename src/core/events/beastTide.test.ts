// Thú triều (docs/rules/events.md): lên lịch theo ngày, báo trước, bắt đầu khi ở / vào thị trấn,
// chặn việc khác, thủ thành từng đợt (không chạy, không bắt, hồi máu giữa đợt), thú vương (thách đấu
// sớm sau đủ đợt, bắt buộc khi hết đợt, hạ / bắt là hết thú triều), thua / rút lui thì mất tiền và
// cửa hàng đóng.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { addItems, getItemCount } from '../inventory'
import { expForLevel, getMaxHp } from '../monster'
import { advanceTime, beastKingAfter } from '../progression'
import { suggestBattleCommands, suggestReplacements } from '../battle'
import { toBig } from '../shared'
import {
  defined,
  expectActionError,
  makeEventData,
  makeGameState,
  makeMonster,
  uniformStats
} from '../testing'
import { HOURS_PER_DAY, type GameData, type GameState, type Monster } from '../model'

/** Fixture: thú triều mỗi 30 ngày, báo trước 3 ngày, 2 đợt, thú vương sau 1 đợt (50%). */
const data = makeEventData()

const hero = (): Monster =>
  makeMonster({
    id: 'h',
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike']
  })

const weakling = (): Monster => makeMonster({ id: 'w', genes: uniformStats(1) })

const act = (
  state: GameState,
  action: Parameters<typeof gameReducer>[2],
  gameData = data
): GameState => gameReducer(gameData, state, action)

/** Thị trấn, thú triều đang diễn ra (đã thắng `cleared` / 2 đợt, thú vương sau 1 đợt). */
function tideState(party: Monster[] = [hero()], cleared = 0): GameState {
  const state = makeGameState({ seed: 5, party, money: 1000, highestFloor: 2 })
  return {
    ...state,
    events: { ...state.events, beastTide: { phase: 'active', cleared, waves: 2, kingAfter: 1 } }
  }
}

function fightToEnd(state: GameState, gameData: GameData = data): GameState {
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
  return current
}

const fightAndLeave = (state: GameState, gameData: GameData = data): GameState =>
  act(fightToEnd(state, gameData), { type: 'leaveBattle' }, gameData)

const onFloor = (seed = 1): GameState =>
  makeGameState({ seed, party: [hero()], location: { type: 'floor', floor: 1 } })

describe('lên lịch, báo trước và bắt đầu', () => {
  it('chưa có thú triều: lần qua ngày kế tiếp lên lịch sau intervalDays ngày, không tốn RNG', () => {
    const state = onFloor()
    const next = advanceTime(data, state, HOURS_PER_DAY)
    expect(next.events.beastTide).toEqual({ phase: 'scheduled', day: 31 })
    // So với state đã có lịch xa (không lên lịch): RNG như nhau (việc theo ngày khác vẫn tốn RNG).
    const far = {
      ...state,
      events: { ...state.events, beastTide: { phase: 'scheduled' as const, day: 999 } }
    }
    expect(next.rng).toBe(advanceTime(data, far, HOURS_PER_DAY).rng)
  })

  it('khoảng ngày: lịch rơi trong [min, max] và khác nhau giữa các save', () => {
    const wide = makeEventData((raw) => {
      raw.config.events.beastTide.intervalDays = { min: 30, max: 50 }
    })
    const days = Array.from({ length: 30 }, (_, seed) => {
      const tide = advanceTime(wide, onFloor(seed + 1), HOURS_PER_DAY).events.beastTide
      return tide?.phase === 'scheduled' ? tide.day - 1 : -1
    })
    expect(Math.min(...days)).toBeGreaterThanOrEqual(30)
    expect(Math.max(...days)).toBeLessThanOrEqual(50)
    expect(new Set(days).size).toBeGreaterThan(3)
  })

  it('còn warningDays ngày thì báo trước', () => {
    const state = onFloor()
    const scheduled = {
      ...state,
      events: { ...state.events, beastTide: { phase: 'scheduled' as const, day: 10 } }
    }
    const day6 = advanceTime(data, scheduled, 6 * HOURS_PER_DAY)
    expect(day6.events.beastTide).toEqual({ phase: 'scheduled', day: 10 })
    const day7 = advanceTime(data, day6, HOURS_PER_DAY)
    expect(day7.events.beastTide).toEqual({ phase: 'warned', day: 10 })
    expect(day7.dayEvents).toContainEqual({ type: 'beastTideWarning', day: 10 })
  })

  it('đang ở thị trấn đúng ngày: bắt đầu (số đợt, mốc thú vương)', () => {
    const state = makeGameState({ seed: 1, party: [hero()] })
    const warned = {
      ...state,
      events: { ...state.events, beastTide: { phase: 'warned' as const, day: 2 } }
    }
    const arrived = advanceTime(data, warned, 2 * HOURS_PER_DAY)
    expect(arrived.events.beastTide).toEqual({
      phase: 'active',
      cleared: 0,
      waves: 2,
      kingAfter: 1
    })
    expect(arrived.dayEvents).toContainEqual({ type: 'beastTideArrived', waves: 2 })
  })

  it('mốc thú vương theo quy mô: ⌈đợt × %⌉, trong [1, số đợt]', () => {
    const real = makeEventData((raw) => {
      raw.config.events.beastTide.kingAfterPercent = 40
    })
    expect([5, 12, 20].map((waves) => beastKingAfter(real, waves))).toEqual([2, 5, 8])
    const none = makeEventData((raw) => {
      raw.config.events.beastTide.kingAfterPercent = 0
    })
    expect(beastKingAfter(none, 5)).toBe(1)
    expect(beastKingAfter(data, 1)).toBe(1)
  })

  it('ở tầng thì chờ; vào thị trấn từ ngày đó thì bắt đầu', () => {
    const state = onFloor()
    const warned = {
      ...state,
      events: { ...state.events, beastTide: { phase: 'warned' as const, day: 0 } }
    }
    const waited = advanceTime(data, warned, HOURS_PER_DAY)
    expect(waited.events.beastTide?.phase).toBe('warned')
    const home = act(waited, { type: 'travel', to: { type: 'town' } })
    expect(home.events.beastTide).toEqual({ phase: 'active', cleared: 0, waves: 2, kingAfter: 1 })
    expect(home.events.log).toEqual([{ type: 'beastTideArrived', waves: 2 }])
  })
})

describe('trong thú triều', () => {
  it('không rời thị trấn, không hồi máu ở NPC / nghỉ, không vào trận khác', () => {
    const state = tideState()
    const blocked = (action: Parameters<typeof gameReducer>[2], from = state): void =>
      expectActionError(() => act(from, action), 'beastTideActive')
    blocked({ type: 'travel', to: { type: 'floor', floor: 1 } })
    blocked({ type: 'healParty' })
    blocked({ type: 'rest' })
    blocked({ type: 'challengeArena' })
  })

  it('đợt thường: 2 quái hoang, không chạy, không bắt', () => {
    const opened = act(tideState(), { type: 'defendTown' })
    const battle = defined(opened.battle, 'trận')
    expect(battle.enemies).toHaveLength(2)
    expect(battle.isBoss).toBe(false)
    expect(battle.special).toEqual({ kind: 'beastTide', wave: 1, waves: 2, king: false })
    expectActionError(() => act(opened, { type: 'flee' }), 'specialBattleRestricted', {
      command: 'flee'
    })
    const withBall = { ...opened, inventory: addItems(opened.inventory, 'ball', 1) }
    const targetId = battle.enemies[0].id
    expectActionError(
      () =>
        act(withBall, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'item', itemId: 'ball', targetId }]
        }),
      'specialBattleRestricted',
      { command: 'ball' }
    )
  })

  it('thắng đợt: đếm đợt, không tự hồi máu; hồi bằng vật phẩm ngoài trận được', () => {
    const fainted = makeMonster({ id: 'f', damageTaken: 10_000 })
    const done = fightAndLeave(act(tideState([hero(), fainted]), { type: 'defendTown' }))
    expect(done.events.beastTide).toEqual({ phase: 'active', cleared: 1, waves: 2, kingAfter: 1 })
    const still = defined(
      done.party.find((m) => m.id === 'f'),
      'quái gục'
    )
    expect(getMaxHp(data, still).minus(still.damageTaken).lte(0)).toBe(true)
    const stocked = { ...done, inventory: addItems(done.inventory, 'revive', 1) }
    const revived = act(stocked, { type: 'useItem', itemId: 'revive', monsterId: 'f' })
    const up = defined(
      revived.party.find((m) => m.id === 'f'),
      'quái hồi sinh'
    )
    expect(getMaxHp(data, up).minus(up.damageTaken).gt(0)).toBe(true)
  })

  it('thú vương: chưa đủ đợt thì khóa; đủ thì thách đấu được (boss × kingStrength)', () => {
    expectActionError(() => act(tideState(), { type: 'challengeBeastKing' }), 'beastKingLocked', {
      cleared: 0,
      need: 1
    })
    const opened = act(tideState([hero()], 1), { type: 'challengeBeastKing' })
    const battle = defined(opened.battle, 'trận')
    expect(battle.isBoss).toBe(true)
    expect(battle.special).toEqual({ kind: 'beastTide', wave: 2, waves: 2, king: true })
    const lair = defined(data.biomes['lair'].bossMultiplierMin, 'hệ số boss của lair')
    // Đợt 2 × (1 + 10%) × kingStrength 1,5.
    expect(battle.enemies[0].bossMultiplier).toBeCloseTo(lair * 1.1 * 1.5, 5)
    expectActionError(() => act(opened, { type: 'flee' }), 'specialBattleRestricted')
  })

  it('hết đợt thì defendTown là thú vương (bắt buộc); hạ thú vương: thưởng, hết thú triều', () => {
    const forced = act(tideState([hero()], 2), { type: 'defendTown' })
    expect(defined(forced.battle, 'trận').special).toMatchObject({ king: true, wave: 3 })
    const ended = fightToEnd(act(tideState([hero()], 1), { type: 'challengeBeastKing' }))
    expect(defined(ended.battle, 'trận').log).toContainEqual({ type: 'beastTideCleared' })
    const done = act(ended, { type: 'leaveBattle' })
    expect(done.events.beastTide).toBeNull()
    expect(getItemCount(done.inventory, 'potion')).toBeGreaterThanOrEqual(2)
  })

  it('bắt được thú vương cũng là hạ thú vương', () => {
    const opened = act(tideState([hero()], 1), { type: 'challengeBeastKing' })
    const withBall = { ...opened, inventory: addItems(opened.inventory, 'masterBall', 1) }
    const king = defined(opened.battle, 'trận').enemies[0]
    const thrown = act(withBall, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'item', itemId: 'masterBall', targetId: king.id }]
    })
    const battle = defined(fightToEnd(thrown).battle, 'trận')
    expect(battle.outcome).toBe('won')
    expect(battle.log).toContainEqual({ type: 'beastTideCleared' })
    const done = act(fightToEnd(thrown), { type: 'leaveBattle' })
    expect(done.events.beastTide).toBeNull()
    expect([...done.party, ...done.storage].some((m) => m.id === king.id)).toBe(true)
  })

  it('floorOffset: quái thú triều theo tầng cao nhất + floorOffset (tối thiểu 1)', () => {
    const lower = makeEventData((raw) => {
      raw.config.events.beastTide.floorOffset = -1
    })
    const level = (gameData: GameData): number =>
      defined(gameReducer(gameData, tideState(), { type: 'defendTown' }).battle, 'trận').enemies[0]
        .level
    // Fixture: tầng N quái thường level 2N − 1 (tầng cao nhất 2 → level 3, tầng 1 → level 1).
    expect(level(data)).toBe(3)
    expect(level(lower)).toBe(1)
  })

  it('thua đợt: mất % tiền riêng, cửa hàng đóng closedDays ngày, hết thú triều', () => {
    const lost = fightToEnd(act(tideState([weakling()]), { type: 'defendTown' }))
    const done = act(lost, { type: 'leaveBattle' })
    // Hết thú triều: lần qua ngày kế tiếp mới lên lịch lại.
    expect(done.events.beastTide).toBeNull()
    expect(done.money.eq(900)).toBe(true)
    const until = Math.floor(lost.time / HOURS_PER_DAY) + 2
    expect(done.events.shopClosedUntilDay).toBe(until)
    const stock = [{ storage: 'stack' as const, itemId: 'potion' }]
    const shop = { ...done, shop: { stock } }
    expectActionError(
      () => act(shop, { type: 'buyItem', item: stock[0], count: 1 }),
      'shopClosed',
      {
        untilDay: until
      }
    )
    const reopened = { ...shop, time: (until + 1) * HOURS_PER_DAY }
    expect(() => act(reopened, { type: 'buyItem', item: stock[0], count: 1 })).not.toThrow()
  })

  it('rút lui: mất % tiền (kể cả số cực lớn), cửa hàng đóng; không có thú triều thì báo lỗi', () => {
    const rich = { ...tideState(), money: toBig('1e300') }
    const retreated = act(rich, { type: 'retreatBeastTide' })
    expect(retreated.money.eq(toBig('9e299'))).toBe(true)
    expect(retreated.events.beastTide).toBeNull()
    expect(retreated.events.log[0]).toMatchObject({ type: 'beastTideRetreated' })
    expectActionError(() => act(retreated, { type: 'retreatBeastTide' }), 'noBeastTide')
    expectActionError(() => act(retreated, { type: 'defendTown' }), 'noBeastTide')
    expectActionError(() => act(retreated, { type: 'challengeBeastKing' }), 'noBeastTide')
  })

  it('đợt thú triều không tính là trận trên tầng (modifier không giảm)', () => {
    const state = tideState()
    const withModifier = {
      ...state,
      events: { ...state.events, modifiers: [{ modifierId: 'lucky', battlesLeft: 2 }] }
    }
    const done = fightAndLeave(act(withModifier, { type: 'defendTown' }))
    expect(done.events.modifiers).toEqual([{ modifierId: 'lucky', battlesLeft: 2 }])
  })
})
