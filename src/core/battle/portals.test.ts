// Cổng thế giới (docs/rules/zones.md mục "Cổng thế giới"): mở / đóng theo ngày, tổ quái, gia cố, vào cổng,
// tiến độ giữ qua lượt vào, bước tổ quái / thu thập, hạ boss đóng cổng, kiểm tra dữ liệu / save.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, validateGameState } from '../game'
import { expForLevel } from '../monster'
import {
  portalDailyTask,
  portalFloor,
  portalStabilizeCost,
  portalTemplateIds,
  spawnPortal,
  conquerPortal
} from '../world'
import { createRng } from '../shared'
import {
  FIXTURE_ZONE_ID,
  dataIssuesAfter,
  defined,
  expectActionError,
  findLog,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import type {
  DayEvent,
  GameData,
  GameState,
  Monster,
  PortalWorld,
  RawGameData,
  ZoneStepKind
} from '../model'
import { suggestBattleCommands } from './ai'
import { suggestReplacements } from './battleActions'

const TEMPLATE = 'portalDen'

function makePortalData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  const zone = defined(raw.zones[0], 'hiểm địa')
  raw.zones.push({ ...structuredClone(zone), id: TEMPLATE, portal: true, requirements: [] })
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makePortalData()

const onlyStep = (kind: ZoneStepKind): GameData =>
  makePortalData((raw) => {
    raw.config.zones.portals.stepWeights = {
      battle: 0,
      elite: 0,
      treasure: 0,
      rareTreasure: 0,
      spring: 0,
      hive: 0,
      gather: 0
    }
    raw.config.zones.portals.stepWeights[kind] = 1
    defined(raw.zones[1], 'mẫu cổng').treasure = {
      rolls: 1,
      items: [{ itemId: 'potion', weight: 1, min: 1, max: 1 }]
    }
  })

const hero = (): Monster =>
  makeMonster({
    id: 'h',
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike']
  })

const portal = (overrides: Partial<PortalWorld> = {}): PortalWorld => ({
  id: 'portal-1',
  zoneId: TEMPLATE,
  hostility: 1,
  steps: 3,
  stepsTaken: 0,
  hives: 1,
  closesDay: 100,
  stabilizations: 0,
  ...overrides
})

const withPortals = (portals: PortalWorld[], money = 100_000, party = [hero()]): GameState => {
  const state = makeGameState({ seed: 5, party, highestFloor: 10, money })
  return { ...state, zones: { ...state.zones, portals, nextPortalId: portals.length + 1 } }
}

const enter = (state: GameState, gameData = data, portalId = 'portal-1'): GameState =>
  gameReducer(gameData, state, { type: 'enterPortal', portalId })

function fightAndLeave(state: GameState, gameData: GameData): GameState {
  let current = state
  for (let i = 0; i < 200 && current.battle?.phase !== 'ended'; i++) {
    const phase = defined(current.battle, 'trận').phase
    current =
      phase === 'chooseReplacement'
        ? gameReducer(gameData, current, {
            type: 'replaceFainted',
            replacements: suggestReplacements(gameData, current)
          })
        : gameReducer(gameData, current, {
            type: 'submitTurn',
            commands: suggestBattleCommands(gameData, current, { transforms: false })
          })
  }
  return gameReducer(gameData, current, { type: 'leaveBattle' })
}

describe('mở, đóng cổng theo ngày', () => {
  const always = makePortalData((raw) => {
    raw.config.zones.portals.spawnChance = 100
  })

  it('mẫu cổng: chỉ hiểm địa có portal', () => {
    expect(portalTemplateIds(data)).toEqual([TEMPLATE])
  })

  it('mở cổng: theo số config, id tăng dần, ngày đóng tính từ ngày mở', () => {
    const state = withPortals([])
    const [zones, , opened] = spawnPortal(data, createRng(1), {
      zones: state.zones,
      day: 4,
      hostility: 2
    })
    expect(opened).toMatchObject({
      id: 'portal-1',
      zoneId: TEMPLATE,
      hostility: 2,
      steps: 3,
      stepsTaken: 0,
      hives: 1,
      closesDay: 9,
      stabilizations: 0
    })
    expect(zones.nextPortalId).toBe(2)
  })

  it('không có mẫu cổng thì không mở', () => {
    const none = makePortalData((raw) => {
      raw.zones = raw.zones.filter((zone) => !zone.portal)
    })
    const state = withPortals([])
    const events: DayEvent[] = []
    const next = portalDailyTask(
      makePortalData((raw) => {
        raw.zones = raw.zones.filter((zone) => !zone.portal)
        raw.config.zones.portals.spawnChance = 100
      }),
      state,
      events,
      1
    )
    expect(next.zones.portals).toEqual([])
    expect(events).toEqual([])
    expect(portalTemplateIds(none)).toEqual([])
  })

  it('mỗi ngày: tổ quái mọc tới trần, tới ngày đóng thì cổng biến mất và báo', () => {
    const state = withPortals([
      portal({ hives: 3 }),
      portal({ id: 'portal-2', hives: 1 }),
      portal({ id: 'portal-3', closesDay: 5 })
    ])
    const events: DayEvent[] = []
    const next = portalDailyTask(data, state, events, 5)
    expect(next.zones.portals.map((p) => [p.id, p.hives])).toEqual([
      ['portal-1', 3],
      ['portal-2', 2]
    ])
    expect(events).toEqual([{ type: 'portalClosed', portalId: 'portal-3', zoneId: TEMPLATE }])
  })

  it('cổng đang có lượt vào không đóng giữa chừng', () => {
    const state = enter(withPortals([portal({ closesDay: 100 })]))
    const events: DayEvent[] = []
    const next = portalDailyTask(data, state, events, 100)
    expect(next.zones.portals).toHaveLength(1)
    expect(events).toEqual([])
  })

  it('tung mở cổng: 100% thì mở và báo; đủ maxOpen thì không; 0% không tốn RNG', () => {
    const events: DayEvent[] = []
    const opened = portalDailyTask(always, withPortals([]), events, 1)
    expect(opened.zones.portals).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'portalOpened', zoneId: TEMPLATE })
    const full = withPortals([portal(), portal({ id: 'b' }), portal({ id: 'c' })])
    expect(portalDailyTask(always, full, [], 1).zones.portals).toHaveLength(3)
    const quiet = withPortals([])
    expect(portalDailyTask(data, quiet, [], 1).rng).toBe(quiet.rng)
  })
})

describe('tầng sức mạnh, gia cố', () => {
  it('tầng = cao nhất + offset + hung hiểm × 2 + tổ × 1, tối thiểu 1', () => {
    expect(portalFloor(data, portal({ hostility: 2, hives: 3 }), 10)).toBe(17)
    const low = makePortalData((raw) => {
      raw.config.zones.floorOffset = -100
    })
    expect(portalFloor(low, portal(), 1)).toBe(1)
  })

  it('gia cố: giá tăng theo hung hiểm và số lần, thêm ngày; thiếu tiền / cổng lạ báo lỗi', () => {
    const first = portal({ hostility: 2 })
    expect(portalStabilizeCost(data, first).toNumber()).toBe(200)
    const state = withPortals([first], 1000)
    const stabilize = (current: GameState, portalId = 'portal-1'): GameState =>
      gameReducer(data, current, { type: 'stabilizePortal', portalId })
    const once = stabilize(state)
    expect(once.money.toNumber()).toBe(800)
    expect(once.zones.portals[0]).toMatchObject({ closesDay: 103, stabilizations: 1 })
    expect(portalStabilizeCost(data, defined(once.zones.portals[0], 'cổng')).toNumber()).toBe(400)
    expectActionError(() => stabilize(state, 'nope'), 'portalNotFound')
    expectActionError(() => stabilize(withPortals([first], 0)), 'notEnoughMoney')
  })
})

describe('vào cổng, khám phá', () => {
  it('vào: lượt vào theo cổng, tiếp tục từ số bước đã đi', () => {
    const entered = enter(withPortals([portal({ stepsTaken: 1, hives: 2, hostility: 3 })]))
    expect(entered.zones.visit).toEqual({
      zoneId: TEMPLATE,
      floor: 18,
      steps: 3,
      stepsTaken: 1,
      portalId: 'portal-1'
    })
    expect(validateGameState(data, entered)).toEqual([])
  })

  it('cổng lạ, cổng đã tới ngày đóng, đang trong lượt vào khác: báo lỗi', () => {
    expectActionError(() => enter(withPortals([])), 'portalNotFound')
    const closed = withPortals([portal({ closesDay: 0 })])
    expectActionError(() => enter(closed), 'portalClosed')
    const inside = enter(withPortals([portal(), portal({ id: 'portal-2' })]))
    expectActionError(() => enter(inside, data, 'portal-2'), 'zoneInProgress')
  })

  it('mẫu cổng không vào thẳng bằng enterZone; hiểm địa thường vẫn vào được', () => {
    const state = withPortals([])
    expectActionError(
      () => gameReducer(data, state, { type: 'enterZone', zoneId: TEMPLATE }),
      'zoneIsPortal'
    )
    const entered = gameReducer(data, state, { type: 'enterZone', zoneId: FIXTURE_ZONE_ID })
    expect(entered.zones.visit?.portalId).toBeUndefined()
  })

  it('rời cổng: tiến độ ghi lại vào cổng, không khóa, vào lại đi tiếp', () => {
    const steps = onlyStep('gather')
    const entered = enter(withPortals([portal()]), steps)
    const explored = gameReducer(steps, entered, { type: 'exploreZone' })
    expect(explored.zones.visit?.stepsTaken).toBe(1)
    const left = gameReducer(steps, explored, { type: 'leaveZone' })
    expect(left.zones.visit).toBeNull()
    expect(left.zones.portals[0]?.stepsTaken).toBe(1)
    expect(left.zones.reopenDay).toEqual({})
    expect(enter(left, steps).zones.visit?.stepsTaken).toBe(1)
  })

  it('bước thu thập: rương thường × gatherRolls, món vào túi', () => {
    const steps = onlyStep('gather')
    const entered = enter(withPortals([portal()]), steps)
    const explored = gameReducer(steps, entered, { type: 'exploreZone' })
    const step = findLog(explored, 'zoneStep')
    expect(step?.result.kind).toBe('gather')
    const items = step?.result.kind === 'gather' ? step.result.items : []
    expect(items.reduce((sum, item) => sum + item.count, 0)).toBe(2)
  })

  it('bước tổ quái: mở trận tinh anh, thắng thì cổng bớt một tổ', () => {
    const steps = onlyStep('hive')
    const entered = enter(withPortals([portal({ hives: 2 })]), steps)
    const fighting = gameReducer(steps, entered, { type: 'exploreZone' })
    expect(fighting.battle?.special).toMatchObject({ kind: 'zone', hive: true, guardian: false })
    const after = fightAndLeave(fighting, steps)
    expect(after.zones.portals[0]?.hives).toBe(1)
    expect(after.zones.visit?.stepsTaken).toBe(1)
  })

  it('thua trận trong cổng: hết lượt vào, cổng còn đó, giữ tiến độ', () => {
    const steps = onlyStep('battle')
    const feeble = makeMonster({ id: 'w', genes: uniformStats(1) })
    const entered = enter(withPortals([portal()], 1000, [feeble]), steps)
    const fighting = gameReducer(steps, entered, { type: 'exploreZone' })
    const after = fightAndLeave(fighting, steps)
    expect(after.zones.visit).toBeNull()
    expect(after.zones.portals[0]).toMatchObject({ id: 'portal-1', stepsTaken: 1 })
  })
})

describe('hạ boss canh giữ: đóng cổng', () => {
  it('bước cuối là boss; thắng: cổng biến mất, cổng kế tiếp hung hiểm hơn, được chọn tinh chất', () => {
    const entered = enter(withPortals([portal({ stepsTaken: 2, hostility: 2 })]))
    const fighting = gameReducer(data, entered, { type: 'exploreZone' })
    expect(fighting.battle?.special).toMatchObject({ kind: 'zone', guardian: true })
    const after = fightAndLeave(fighting, data)
    expect(after.zones.visit).toBeNull()
    expect(after.zones.portals.map((p) => p.id)).toEqual(['portal-2'])
    expect(after.zones.portals[0]).toMatchObject({ hostility: 3, stepsTaken: 0 })
    expect(after.essences.offer).toHaveLength(2)
    expect(validateGameState(data, after)).toEqual([])
  })

  it('hiểm địa thường hạ boss: không cho tinh chất, không mở cổng', () => {
    const state = withPortals([])
    const entered = gameReducer(data, state, { type: 'enterZone', zoneId: FIXTURE_ZONE_ID })
    const atBoss: GameState = {
      ...entered,
      zones: {
        ...entered.zones,
        visit: { ...defined(entered.zones.visit, 'lượt'), stepsTaken: 2 }
      }
    }
    const after = fightAndLeave(gameReducer(data, atBoss, { type: 'exploreZone' }), data)
    expect(after.essences.offer).toBeNull()
    expect(after.zones.portals).toEqual([])
  })

  it('conquerPortal với cổng đã mất thì giữ nguyên', () => {
    const { zones } = withPortals([])
    const rng = createRng(1)
    expect(conquerPortal(data, rng, { zones, portalId: 'nope', day: 1 })).toEqual([zones, rng])
  })
})

describe('kiểm tra', () => {
  it('save: mẫu cổng lạ, số sai, id trùng, lượt vào trỏ cổng lạ', () => {
    const issues = (state: GameState): string => validateGameState(data, state).join(' | ')
    expect(issues(withPortals([portal({ zoneId: FIXTURE_ZONE_ID })]))).toMatch(
      /không phải mẫu cổng/
    )
    expect(issues(withPortals([portal({ hostility: 0 })]))).toMatch(/hostility/)
    expect(issues(withPortals([portal(), portal()]))).toMatch(/id không hợp lệ/)
    const entered = enter(withPortals([portal()]))
    expect(issues({ ...entered, zones: { ...entered.zones, portals: [] } })).toMatch(
      /cổng không tồn tại/
    )
  })

  it('dữ liệu: config cổng sai báo lỗi', () => {
    const issues = (edit: (raw: RawGameData) => void): string => dataIssuesAfter(edit).join(' | ')
    expect(issues((raw) => (raw.config.zones.portals.spawnChance = 101))).toMatch(/spawnChance/)
    expect(issues((raw) => (raw.config.zones.portals.steps = { min: 3, max: 1 }))).toMatch(/steps/)
    expect(issues((raw) => (raw.config.zones.portals.maxHives = -1))).toMatch(/maxHives/)
  })
})
