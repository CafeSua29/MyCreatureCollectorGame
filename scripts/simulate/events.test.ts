import { describe, expect, it } from 'vitest'
import { expForLevel, toBig, type GameState } from '@core'
import {
  makeEventData,
  makeGameState,
  makeMonster,
  uniformStats,
  withPendingEvent
} from '@core/testing'
import { runBattle } from './battleRunner'
import {
  beginEventTally,
  eventsTable,
  mergeEventTally,
  newEventTally,
  settleEvents,
  simAct,
  takeEventTally
} from './events'

const data = makeEventData((raw) => {
  raw.config.events.wildBattleChance = 100
  raw.config.events.townChance = 100
})

const hero = makeMonster({
  id: 'h',
  level: 80,
  exp: expForLevel(80, 'mediumFast'),
  genes: uniformStats(500),
  skillIds: ['strike']
})

const onFloor = (): GameState =>
  makeGameState({ seed: 3, party: [hero], money: 1000, location: { type: 'floor', floor: 1 } })

describe('event trong mô phỏng', () => {
  it('giải quyết event chờ bằng lựa chọn đầu tiên trả được; trận event đánh tới hết', () => {
    beginEventTally()
    const treasure = settleEvents(data, withPendingEvent(onFloor(), 'treasure', { floor: 1 }))
    expect(treasure.events.pending).toBeNull()
    // Quái bị thương: chưa có thuốc nên bỏ "Chữa", chọn "Tấn công" (mở trận).
    const fought = settleEvents(data, withPendingEvent(onFloor(), 'injured', { floor: 1 }))
    expect(fought.battle).toBeNull()
    const tally = takeEventTally()
    expect(tally.met).toEqual({ treasure: 1, injured: 1 })
    expect(tally.battles).toBe(1)
    expect(tally.battleWins).toBe(1)
    expect(tally.moneyGained.gt(0)).toBe(true)
  })

  it('runBattle: event thay cho trận được giải quyết rồi gặp lại tới khi ra trận', () => {
    const noEvents = makeEventData((raw) => {
      raw.config.events.wildBattleChance = 100
      for (const event of raw.events) event.weight = 0
    })
    expect(runBattle(noEvents, onFloor(), { kind: 'wild', maxTurns: 50 }).stats.outcome).toBe('won')
    // Mọi lần gặp đều ra event: hết số lần gặp lại thì báo lỗi rõ ràng.
    expect(() => runBattle(data, onFloor(), { kind: 'wild', maxTurns: 50 })).toThrow('trận đã mất')
  })

  it('simAct: vào thị trấn gặp event thị trấn thì giải quyết ngay; thú triều thì thủ thành', () => {
    beginEventTally()
    const home = simAct(data, onFloor(), { type: 'travel', to: { type: 'town' } })
    expect(home.events.pending).toBeNull()
    expect(takeEventTally().met).toEqual({ stranger: 1 })
    const town = makeGameState({ seed: 3, party: [hero], money: 1000 })
    const tide: GameState = {
      ...town,
      events: { ...town.events, beastTide: { phase: 'active', cleared: 0, waves: 2, kingAfter: 1 } }
    }
    const healed = simAct(data, tide, { type: 'renameMonster', monsterId: 'h', nickname: 'x' })
    expect(healed.events.beastTide).toBeNull()
    const tally = takeEventTally()
    // Thú vương mở sau 1 đợt, đội đầy máu: thắng 1 đợt rồi hạ thú vương.
    expect(tally).toMatchObject({ tides: 1, tidesCleared: 1, tidesFailed: 0, tideWaves: 1 })
    expect(tally.kingWavesCleared).toBe(1)
  })

  it('cộng bảng đếm và bảng events.csv', () => {
    const a = { ...newEventTally(), met: { treasure: 2 }, battles: 1, battleWins: 1, tides: 1 }
    const b = {
      ...newEventTally(),
      met: { treasure: 1, spring: 3 },
      battles: 1,
      moneyGained: toBig(50),
      tides: 1,
      tidesCleared: 1,
      tideWaves: 4
    }
    const total = mergeEventTally(a, b)
    expect(total.met).toEqual({ treasure: 3, spring: 3 })
    expect(
      eventsTable([{ teamId: 't', usePills: true, totalBattles: 9, tally: total }]).rows
    ).toEqual([
      [
        't',
        'yes',
        '9',
        '6',
        'spring:3 treasure:3',
        '1/2 (50.0%)',
        '50',
        '0',
        '1/2',
        '0',
        '0',
        '4',
        '0.0',
        '0',
        ''
      ]
    ])
  })
})
