import { describe, expect, it } from 'vitest'
import { ageDaysAtPercent, createSoul, type GameState, type Monster } from '@core'
import {
  agingMonster,
  lifespanState,
  makeInventory,
  makeLifespanData,
  makeMonster
} from '@core/testing'
import {
  feedPillsWhenOld,
  handleSouls,
  previewRelics,
  lifespanTable,
  newLifespanTracker,
  recordDayEvents
} from './lifespan'

const data = makeLifespanData()
const teamIds = new Set(['m1'])
const DEATH = { aptitudeFloor: 1, day: 0, cause: 'oldAge' as const }

describe('recordDayEvents', () => {
  it('ghi tọa hóa (đội mẫu / kho) và cảnh báo', () => {
    const tracker = newLifespanTracker()
    const state: GameState = {
      ...lifespanState({ seed: 1, party: [agingMonster(data, 50)] }),
      highestFloor: 3,
      floorBiomeIds: ['field', 'lair', 'pairs'],
      dayEvents: [
        { type: 'diedOfOldAge', monsterId: 'm1', speciesId: 'weakling', nickname: null },
        { type: 'diedOfOldAge', monsterId: 'm7', speciesId: 'twig', nickname: null },
        { type: 'monsterAutoJoined', monsterId: 'm2' }
      ]
    }
    recordDayEvents(tracker, state, { battle: 12, teamIds })
    tracker.battleFallen = 2
    expect(tracker.deaths).toEqual([
      { monsterId: 'm1', speciesId: 'weakling', battle: 12, highestFloor: 3, inTeam: true },
      { monsterId: 'm7', speciesId: 'twig', battle: 12, highestFloor: 3, inTeam: false }
    ])
    expect(
      lifespanTable([{ teamId: 't', usePills: false, totalBattles: 40, tracker }]).rows
    ).toEqual([['t', 'no', '40', '1', '12', '3', '1', '0', '0', '0', '', '0', '', '', '2']])
  })
})

describe('feedPillsWhenOld', () => {
  const withPills = (monster: Monster, stacks: Record<string, number>): GameState => ({
    ...lifespanState({ seed: 1, party: [monster] }),
    inventory: makeInventory(stacks)
  })

  it('quái đội mẫu vượt mốc cảnh báo: dùng đan nhiều năm trước tới khi về dưới mốc', () => {
    const tracker = newLifespanTracker()
    const old = agingMonster(data, 95)
    const next = feedPillsWhenOld(data, withPills(old, { smallPill: 5, bigPill: 1 }), {
      teamIds,
      tracker
    })
    expect(next.inventory.stacks).toEqual({ smallPill: 5 })
    expect(tracker.pillsUsed).toBe(1)
    expect(next.party[0].lifespanBonusYears.toNumber()).toBe(100)
  })

  it('chưa tới mốc, không phải đội mẫu, hết đan: không dùng', () => {
    const tracker = newLifespanTracker()
    const young = agingMonster(data, 50)
    expect(
      feedPillsWhenOld(data, withPills(young, { smallPill: 1 }), { teamIds, tracker })
    ).toEqual(withPills(young, { smallPill: 1 }))
    const stranger = agingMonster(data, 95, { id: 'm9' })
    const state = withPills(stranger, { smallPill: 1 })
    expect(feedPillsWhenOld(data, state, { teamIds, tracker })).toBe(state)
    const noPills = withPills({ ...makeMonster({ aging: true }), ageDays: 1000 }, {})
    expect(feedPillsWhenOld(data, noPills, { teamIds, tracker }).party[0].ageDays).toBe(1000)
    expect(tracker.pillsUsed).toBe(0)
    expect(ageDaysAtPercent(data, young, 50)).toBe(young.ageDays)
  })
})

describe('handleSouls', () => {
  it('đủ tiền thì luyện hồn khí, không đủ thì ấp trứng truyền thừa', () => {
    const tracker = newLifespanTracker()
    const base = lifespanState({ seed: 1, party: [makeMonster({ id: 'm2' })], money: 100 })
    const rich = createSoul(data, makeMonster({ id: 'm5', level: 5 }), DEATH)
    const poor = createSoul(data, makeMonster({ id: 'm6', level: 50 }), DEATH)
    const state: GameState = {
      ...base,
      nextMonsterId: 7,
      inventory: { ...base.inventory, souls: [rich, poor] }
    }
    const next = handleSouls(data, state, tracker)
    expect(next.inventory.souls).toEqual([])
    expect(next.inventory.equipment).toHaveLength(1)
    expect(next.eggs).toHaveLength(1)
    expect(tracker.relicRarities).toEqual(['epic'])
    expect(tracker.soulEggs).toBe(1)
  })
})

describe('previewRelics', () => {
  it('bậc hồn khí của quái đội mẫu và giá luyện đắt nhất theo % tiền', () => {
    const tracker = newLifespanTracker()
    const state = lifespanState({
      seed: 1,
      party: [makeMonster({ id: 'm1', level: 20 }), makeMonster({ id: 'm2' })],
      money: 400
    })
    previewRelics(data, state, { teamIds, tracker })
    expect(tracker.previewRarities).toEqual(['epic'])
    expect(tracker.previewCostPercent).toBe(50)
  })
})
