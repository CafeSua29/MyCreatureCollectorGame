import { describe, expect, it } from 'vitest'
import { getMaxHp, keepAlive } from '../monster'
import { validateGameState } from '../game'
import type { GameState, Monster } from '../model'
import {
  defined,
  equipped,
  expectActionError,
  lifespanState,
  makeBattleState,
  makeEquipment,
  makeInventory,
  makeLifespanData,
  makeMonster
} from '../testing'
import { advanceTime, calendarAt, hoursUntilWake } from './time'
import { setGameOption } from './gameOptions'
import { dayOf, hourOf } from '../model'

// Quái fixture level 1 thọ 101 năm = 1010 ngày (10 ngày một năm).
const data = makeLifespanData()
const LIFESPAN_DAYS = 1010

/** Quái già đi với tuổi (ngày) cho trước. */
const aged = (ageDays: number, overrides: Parameters<typeof makeMonster>[0] = {}): Monster => ({
  ...makeMonster({ ...overrides, aging: true }),
  ageDays
})

/** State bật thọ nguyên, đồng hồ ở 23 giờ ngày 0 (thêm 1 giờ là qua một ngày). */
const lateNight = (options: Parameters<typeof lifespanState>[0]): GameState => ({
  ...lifespanState(options),
  time: 23
})

describe('đồng hồ', () => {
  it('ngày, giờ trong ngày, số giờ ngủ tới sáng', () => {
    expect([dayOf(0), dayOf(23), dayOf(24), dayOf(49)]).toEqual([0, 0, 1, 2])
    expect(hourOf(49)).toBe(1)
    expect(hoursUntilWake(data, 0)).toBe(6)
    expect(hoursUntilWake(data, 5)).toBe(1)
    // Đúng giờ thức thì ngủ trọn một ngày; tối thì tới sáng hôm sau.
    expect(hoursUntilWake(data, 6)).toBe(24)
    expect(hoursUntilWake(data, 23)).toBe(7)
  })

  it('không qua ngày: chỉ đổi giờ, không già đi, dayEvents về rỗng', () => {
    const state = {
      ...lifespanState({ seed: 1, party: [aged(500)] }),
      dayEvents: [{ type: 'monsterAutoJoined' as const, monsterId: 'm1' }]
    }
    const next = advanceTime(data, state, 5)
    expect(next.time).toBe(5)
    expect(next.party[0].ageDays).toBe(500)
    expect(next.dayEvents).toEqual([])
    expect(advanceTime(data, state, 0)).toEqual({ ...state, dayEvents: [] })
  })

  it('qua nhiều ngày: già thêm đúng số ngày; quái không già đi và trứng giữ tuổi', () => {
    const egg = { id: 'm5', monster: aged(0, { id: 'm5' }), battlesLeft: 3, infusions: [] }
    const state = {
      ...lifespanState({ seed: 1, party: [aged(100)], nextMonsterId: 6 }),
      eggs: [egg]
    }
    const next = advanceTime(data, state, 49)
    expect(next.party[0].ageDays).toBe(102)
    expect(next.eggs[0].monster.ageDays).toBe(0)
    const off = advanceTime(data, { ...state, party: [makeMonster()], eggs: [] }, 49)
    expect(off.party[0].ageDays).toBe(0)
  })

  it('số giờ sai: lỗi lập trình', () => {
    const state = lifespanState({ seed: 1, party: [aged(1)] })
    expect(() => advanceTime(data, state, -1)).toThrow(RangeError)
    expect(() => advanceTime(data, state, 1.5)).toThrow(RangeError)
  })
})

describe('tọa hóa: để lại hồn phách', () => {
  const dying = (overrides: Parameters<typeof makeMonster>[0] = {}): Monster =>
    aged(LIFESPAN_DAYS - 1, overrides)

  it('hết thọ nguyên: rời đội, đồ về túi, để lại hồn phách (không tự tạo trứng); state hợp lệ', () => {
    const sword = makeEquipment({ id: 'e7' })
    const state = {
      ...lateNight({
        seed: 3,
        party: [dying({ id: 'm1', equipment: [equipped(sword)] }), aged(200, { id: 'm2' })],
        nextMonsterId: 3
      }),
      inventory: makeInventory(),
      nextItemId: 8
    }
    const next = advanceTime(data, state, 1)
    expect(next.party.map((m) => m.id)).toEqual(['m2'])
    expect(next.inventory.equipment).toEqual([sword])
    expect(next.eggs).toEqual([])
    expect(next.nextMonsterId).toBe(3)
    expect(next.inventory.souls.map((soul) => soul.id)).toEqual(['m1'])
    expect(next.inventory.souls[0].history?.milestones.at(-1)).toEqual({
      day: 1,
      kind: 'died',
      cause: 'oldAge'
    })
    expect(next.dayEvents).toEqual([
      { type: 'diedOfOldAge', monsterId: 'm1', speciesId: 'weakling', nickname: null }
    ])
    expect(validateGameState(data, next)).toEqual([])
  })

  it('đội trống: quái level cao nhất trong kho (bằng level lấy con trước) tự vào đội', () => {
    const state = {
      ...lateNight({ seed: 3, party: [dying({ id: 'm1' })], nextMonsterId: 9 }),
      storage: [
        aged(10, { id: 'm4', level: 5 }),
        aged(10, { id: 'm5', level: 9 }),
        aged(10, { id: 'm6', level: 9 })
      ]
    }
    const next = advanceTime(data, state, 1)
    expect(next.party.map((m) => m.id)).toEqual(['m5'])
    expect(next.storage.map((m) => m.id)).toEqual(['m4', 'm6'])
    expect(next.dayEvents).toContainEqual({ type: 'monsterAutoJoined', monsterId: 'm5' })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('không còn quái nào: hồn phách mới nhất tự ấp thành trứng truyền thừa, nở ngay vào đội', () => {
    const state = {
      ...lateNight({ seed: 3, party: [dying({ id: 'm1' })], nextMonsterId: 9 }),
      storage: [dying({ id: 'm2' })]
    }
    const next = advanceTime(data, state, 1)
    expect(next.party.map((m) => m.id)).toEqual(['m9'])
    expect(next.party[0].history?.origin).toEqual({ kind: 'legacy', parentSpeciesId: 'weakling' })
    expect(next.eggs).toEqual([])
    expect(next.nextMonsterId).toBe(10)
    // Hồn phách của m2 (mới nhất) đã ấp, hồn phách m1 còn trong túi.
    expect(next.inventory.souls.map((soul) => soul.id)).toEqual(['m1'])
    expect(next.dayEvents).toContainEqual({ type: 'legacyEggHatched', monsterId: 'm9' })
    expect(validateGameState(data, next)).toEqual([])
  })

  it('cảnh báo lần đầu vượt 90% thọ nguyên, ngày sau không lặp lại', () => {
    const state = lateNight({ seed: 3, party: [aged(908)] })
    const next = advanceTime(data, state, 1)
    expect(next.dayEvents).toHaveLength(1)
    const [warning] = next.dayEvents
    expect(warning.type === 'nearingLifespanEnd' && warning.yearsLeft.toNumber()).toBe(10.1)
    expect(advanceTime(data, next, 24).dayEvents).toEqual([])
  })

  it('quái không già đi không bao giờ tọa hóa', () => {
    const state = lateNight({ seed: 3, party: [{ ...makeMonster(), ageDays: LIFESPAN_DAYS * 5 }] })
    expect(
      advanceTime(
        data,
        { ...state, options: { lifespanEnabled: false, permadeathEnabled: false } },
        1
      ).party
    ).toHaveLength(1)
  })
})

describe('keepAlive: max HP tụt không làm quái đang sống gục', () => {
  it('còn ít nhất 1 máu; quái đã gục giữ nguyên', () => {
    const monster = makeMonster({ damageTaken: '1e9' })
    const kept = keepAlive(data, true, monster)
    expect(kept.damageTaken.eq(getMaxHp(data, monster).minus(1))).toBe(true)
    expect(keepAlive(data, false, monster)).toBe(monster)
    const healthy = makeMonster()
    expect(keepAlive(data, true, healthy)).toBe(healthy)
  })
})

describe('setGameOption: thọ nguyên', () => {
  it('tắt: mọi quái (cả trứng) ngừng già, tuổi giữ nguyên; bật lại tuổi chạy tiếp', () => {
    const egg = { id: 'm5', monster: aged(0, { id: 'm5' }), battlesLeft: 3, infusions: [] }
    const state = {
      ...lifespanState({ seed: 1, party: [aged(300)], nextMonsterId: 7 }),
      storage: [aged(400, { id: 'm6' })],
      eggs: [egg]
    }
    const off = setGameOption(data, state, 'lifespanEnabled', false)
    expect(off.options.lifespanEnabled).toBe(false)
    expect([...off.party, ...off.storage, off.eggs[0].monster].every((m) => !m.aging)).toBe(true)
    expect(validateGameState(data, off)).toEqual([])
    const later = advanceTime(data, off, 24 * 30)
    expect(later.party[0].ageDays).toBe(300)
    const on = setGameOption(data, later, 'lifespanEnabled', true)
    expect(on.party[0].ageDays).toBe(300)
    expect(advanceTime(data, on, 24).party[0].ageDays).toBe(301)
    expect(validateGameState(data, on)).toEqual([])
  })

  it('bật lại làm max HP tụt (ấu niên): quái đang sống còn 1 máu', () => {
    const young = { ...makeMonster(), ageDays: 1 }
    const full = getMaxHp(data, young)
    const state = lifespanState({ seed: 1, party: [{ ...young, damageTaken: full.minus(1) }] })
    const off = { ...state, options: { lifespanEnabled: false, permadeathEnabled: false } }
    const on = setGameOption(data, off, 'lifespanEnabled', true)
    const monster = on.party[0]
    expect(monster.damageTaken.eq(getMaxHp(data, monster).minus(1))).toBe(true)
  })

  it('lỗi: trong trận, đã đúng như vậy, tham số sai', () => {
    const battle = makeBattleState([makeMonster()], [makeMonster({ id: 'w1' })])
    expectActionError(() => setGameOption(data, battle, 'lifespanEnabled', true), 'inBattle')
    const state = lifespanState({ seed: 1, party: [aged(1)] })
    expectActionError(
      () => setGameOption(data, state, 'lifespanEnabled', true),
      'optionUnchanged',
      {
        option: 'lifespanEnabled',
        enabled: true
      }
    )
    expectActionError(
      () => setGameOption(data, state, 'lifespanEnabled', 'no' as unknown as boolean),
      'malformedAction'
    )
    expect(defined(state.party[0]).aging).toBe(true)
  })
})

describe('calendarAt (docs/rules/calendar.md)', () => {
  it('ngày, giờ, thời khắc, mùa, tuần trăng suy từ giờ game', () => {
    expect(calendarAt(data, 0)).toEqual({
      day: 0,
      hour: 0,
      dayPhase: 'night',
      season: 'spring',
      moonPhase: 'new'
    })
    expect(calendarAt(data, 8 * 24 + 17)).toEqual({
      day: 8,
      hour: 17,
      dayPhase: 'dusk',
      season: 'winter',
      moonPhase: 'new'
    })
    const big = Math.floor(Number.MAX_SAFE_INTEGER / 24) * 24 + 12
    expect(calendarAt(data, big)).toMatchObject({ day: dayOf(big), hour: 12, dayPhase: 'day' })
  })
})
