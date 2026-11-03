// Hiểm địa (docs/rules/zones.md): điều kiện vào, khám phá từng loại bước, boss canh giữ, thua / rời,
// thời gian khóa, chặn việc khác khi đang trong hiểm địa, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { addItems, getItemCount } from '../inventory'
import { toBig } from '../shared'
import { expForLevel, getMaxHp, isFainted } from '../monster'
import { battleBiome } from '../world'
import {
  findLog,
  FIXTURE_TRIAL_TOKEN_ID,
  FIXTURE_ZONE_ID,
  dataIssuesAfter,
  defined,
  expectActionError,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import {
  dayOf,
  type BattleEvent,
  type GameAction,
  type GameData,
  type GameState,
  type Monster,
  type RawGameData,
  type ZoneRequirement,
  type ZoneStepKind
} from '../model'
import { suggestBattleCommands } from './ai'
import { suggestReplacements } from './battleActions'

function makeZoneData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeZoneData()

/** Dữ liệu chỉ có một loại bước (để đoán được bước khám phá). */
const onlyStep = (kind: ZoneStepKind): GameData =>
  makeZoneData((raw) => {
    raw.config.zones.stepWeights = { battle: 0, elite: 0, treasure: 0, rareTreasure: 0, spring: 0 }
    raw.config.zones.stepWeights[kind] = 1
  })

/** Dữ liệu với điều kiện vào cho trước của hiểm địa fixture. */
const withRequirements = (requirements: ZoneRequirement[]): GameData =>
  makeZoneData((raw) => {
    defined(raw.zones[0], 'hiểm địa').requirements = requirements
  })

/** Quái ta rất mạnh: thắng mọi trận ở tầng thấp. */
const hero = (id = 'h'): Monster =>
  makeMonster({
    id,
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    elementIds: ['grass'],
    skillIds: ['strike']
  })

/** Quái ta rất yếu: thua mọi trận. */
const weak = (): Monster => makeMonster({ id: 'w', genes: uniformStats(1) })

const townState = (party: Monster[] = [hero()]): GameState =>
  makeGameState({ seed: 11, party, highestFloor: 2, money: 1000 })

const enter = (state: GameState, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, { type: 'enterZone', zoneId: FIXTURE_ZONE_ID })

const explore = (state: GameState, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, { type: 'exploreZone' })

/** Đánh tới khi trận kết thúc bằng AI cho phe người chơi rồi rời trận. */
function fightAndLeave(state: GameState, gameData: GameData = data): GameState {
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

/** State đã vào hiểm địa và đi `steps` bước trận (thắng hết). */
function afterBattles(steps: number, party: Monster[] = [hero()]): GameState {
  let state = enter(townState(party))
  for (let i = 0; i < steps; i++) state = fightAndLeave(explore(state))
  return state
}

const logOf = (state: GameState): BattleEvent[] => defined(state.battle, 'trận').log

describe('vào hiểm địa', () => {
  it('đạt điều kiện: có lượt vào ở tầng sức mạnh = tầng cao nhất + floorOffset, chưa đi bước nào', () => {
    const entered = enter(townState())
    expect(entered.zones.visit).toEqual({
      zoneId: FIXTURE_ZONE_ID,
      floor: 2,
      steps: 3,
      stepsTaken: 0
    })
    expect(entered.battle).toBeNull()
    expect(entered.time).toBe(townState().time)
  })

  it('floorOffset âm: tầng sức mạnh tối thiểu 1', () => {
    const lower = makeZoneData((raw) => {
      raw.config.zones.floorOffset = -5
    })
    expect(enter(townState(), lower).zones.visit?.floor).toBe(1)
  })

  it('tầng cao nhất cực lớn: tầng sức mạnh đi theo', () => {
    const big = { ...townState(), highestFloor: 1_000_000 }
    expect(enter(big).zones.visit?.floor).toBe(1_000_000)
  })

  it('lỗi: hiểm địa không tồn tại, ngoài thị trấn, trong trận, cả đội gục', () => {
    expectActionError(
      () => gameReducer(data, townState(), { type: 'enterZone', zoneId: 'nope' }),
      'zoneNotFound',
      { zoneId: 'nope' }
    )
    const onFloor: GameState = { ...townState(), location: { type: 'floor', floor: 1 } }
    expectActionError(() => enter(onFloor), 'notInTown')
    const fighting = gameReducer(data, onFloor, { type: 'startWildBattle' })
    expectActionError(() => enter(fighting), 'inBattle')
    const fainted = makeMonster({ id: 'f', damageTaken: 1_000_000 })
    expectActionError(() => enter(townState([fainted])), 'noHealthyMonster')
  })

  it('điều kiện tầng: chưa đủ tầng báo zoneRequirementUnmet kèm thứ tự và loại', () => {
    const gameData = withRequirements([
      { type: 'minFloor', floor: 2 },
      { type: 'minFloor', floor: 3 }
    ])
    expectActionError(() => enter(townState(), gameData), 'zoneRequirementUnmet', {
      zoneId: FIXTURE_ZONE_ID,
      index: 1,
      requirementType: 'minFloor'
    })
    expect(enter({ ...townState(), highestFloor: 3 }, gameData).zones.visit).not.toBeNull()
  })

  it('điều kiện hệ / race / loài: chỉ đếm quái còn đánh được trong đội', () => {
    const fireTwo = withRequirements([{ type: 'partyElement', elementId: 'fire', count: 2 }])
    const fire = (id: string, damageTaken = 0): Monster =>
      makeMonster({ id, elementIds: ['fire'], damageTaken })
    expect(enter(townState([fire('a'), fire('b')]), fireTwo).zones.visit).not.toBeNull()
    expectActionError(
      () => enter(townState([fire('a'), fire('b', 1_000_000)]), fireTwo),
      'zoneRequirementUnmet',
      { requirementType: 'partyElement' }
    )
    const race = withRequirements([{ type: 'partyRace', raceId: 'neutral', count: 1 }])
    expect(enter(townState(), race).zones.visit).not.toBeNull()
    const other = withRequirements([{ type: 'partyRace', raceId: 'brute', count: 1 }])
    expectActionError(() => enter(townState(), other), 'zoneRequirementUnmet')
    const group = withRequirements([
      { type: 'partyRaceGroup', raceGroupId: 'neutralGroup', count: 1 }
    ])
    expect(enter(townState(), group).zones.visit).not.toBeNull()
    const otherGroup = withRequirements([
      { type: 'partyRaceGroup', raceGroupId: 'bruteGroup', count: 1 }
    ])
    expectActionError(() => enter(townState(), otherGroup), 'zoneRequirementUnmet', {
      requirementType: 'partyRaceGroup'
    })
    // Dòng tiến hóa: weakling → strongling; quái weakling vào được hiểm địa của dòng strongling.
    const line = withRequirements([{ type: 'partySpeciesLine', speciesId: 'strongling', count: 1 }])
    expect(enter(townState(), line).zones.visit).not.toBeNull()
    const otherLine = withRequirements([
      { type: 'partySpeciesLine', speciesId: 'cinder', count: 1 }
    ])
    expectActionError(() => enter(townState(), otherLine), 'zoneRequirementUnmet', {
      requirementType: 'partySpeciesLine'
    })
    const species = withRequirements([{ type: 'partySpecies', speciesId: 'strongling' }])
    expectActionError(() => enter(townState(), species), 'zoneRequirementUnmet')
    const strong = makeMonster({ id: 's', speciesId: 'strongling', baseSpeciesId: 'strongling' })
    expect(enter(townState([strong]), species).zones.visit).not.toBeNull()
  })

  it('điều kiện vật phẩm: consume thì mất khi vào, không thì giữ', () => {
    const withToken = (count: number): GameState => {
      const state = townState()
      return { ...state, inventory: addItems(state.inventory, FIXTURE_TRIAL_TOKEN_ID, count) }
    }
    const req = (consume: boolean): ZoneRequirement => ({
      type: 'item',
      itemId: FIXTURE_TRIAL_TOKEN_ID,
      count: 2,
      consume
    })
    const consumed = enter(withToken(3), withRequirements([req(true)]))
    expect(getItemCount(consumed.inventory, FIXTURE_TRIAL_TOKEN_ID)).toBe(1)
    const kept = enter(withToken(2), withRequirements([req(false)]))
    expect(getItemCount(kept.inventory, FIXTURE_TRIAL_TOKEN_ID)).toBe(2)
    expectActionError(
      () => enter(withToken(1), withRequirements([req(true)])),
      'zoneRequirementUnmet'
    )
  })

  it('đang trong hiểm địa / bí cảnh / khu bảo tồn thì không vào được', () => {
    expectActionError(() => enter(enter(townState())), 'zoneInProgress')
    const inTrial = gameReducer(
      data,
      {
        ...townState(),
        inventory: addItems(townState().inventory, FIXTURE_TRIAL_TOKEN_ID, 1)
      },
      { type: 'enterTrial' }
    )
    expectActionError(() => enter(inTrial), 'trialInProgress')
  })
})

describe('khám phá', () => {
  it('bước trận: mở trận hiểm địa với map của hiểm địa, tầng sức mạnh của lượt vào', () => {
    const fighting = explore(enter(townState()))
    const battle = defined(fighting.battle, 'trận')
    expect(battle.special).toEqual({ kind: 'zone', zoneId: FIXTURE_ZONE_ID, guardian: false })
    expect(battle.floor).toBe(2)
    expect(battle.isBoss).toBe(false)
    expect(battleBiome(data, fighting, battle)).toBe(data.zones[FIXTURE_ZONE_ID].map)
    expect(fighting.zones.visit?.stepsTaken).toBe(1)
    expect(findLog(fighting, 'zoneStep')).toEqual({
      type: 'zoneStep',
      zoneId: FIXTURE_ZONE_ID,
      result: { kind: 'battle' }
    })
  })

  it('thắng trận thường: lượt vào tiếp tục, tốn giờ như trận quái hoang', () => {
    const before = enter(townState())
    const after = fightAndLeave(explore(before))
    expect(after.zones.visit?.stepsTaken).toBe(1)
    expect(after.time).toBe(before.time + data.config.clock.hours.wildBattle)
  })

  it('thắng trận không hồi máu: máu đã mất giữ nguyên qua các bước', () => {
    const hurt = { ...hero(), damageTaken: toBig(100) }
    const after = fightAndLeave(explore(enter(townState([hurt]))))
    const monster = defined(
      after.party.find((m) => m.id === 'h'),
      'quái'
    )
    expect(monster.damageTaken.gte(100)).toBe(true)
  })

  it('dùng vật phẩm ngoài trận giữa các bước (hồi máu) và trong trận (bắt quái)', () => {
    const hurt = { ...hero(), damageTaken: toBig(100) }
    const inside = enter(townState([hurt]))
    const stocked = { ...inside, inventory: addItems(inside.inventory, 'potion', 1) }
    const healed = gameReducer(data, stocked, { type: 'useItem', itemId: 'potion', monsterId: 'h' })
    expect(defined(healed.party[0], 'quái').damageTaken.lt(100)).toBe(true)
    expect(healed.zones.visit).toEqual(inside.zones.visit)
    const fighting = explore({
      ...inside,
      inventory: addItems(inside.inventory, 'masterBall', 1)
    })
    const enemy = defined(fighting.battle?.enemies[0], 'quái địch')
    const caught = gameReducer(data, fighting, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'item', itemId: 'masterBall', targetId: enemy.id }]
    })
    expect(defined(caught.battle, 'trận').captured.map((m) => m.id)).toEqual([enemy.id])
    const left = gameReducer(data, caught, { type: 'leaveBattle' })
    expect(left.zones.visit?.stepsTaken).toBe(1)
  })

  it('được chạy khỏi trận hiểm địa: bước đã tính, lượt vào giữ nguyên', () => {
    const fled = gameReducer(data, explore(enter(townState())), { type: 'flee' })
    expect(defined(fled.battle, 'trận').outcome).toBe('fled')
    const left = gameReducer(data, fled, { type: 'leaveBattle' })
    expect(left.zones.visit?.stepsTaken).toBe(1)
  })

  it('bước tinh anh: trận boss ngẫu nhiên của map', () => {
    const fighting = explore(enter(townState()), onlyStep('elite'))
    expect(defined(fighting.battle, 'trận').isBoss).toBe(true)
    expect(findLog(fighting, 'zoneStep')?.result).toEqual({ kind: 'elite' })
  })

  it('bước rương thường / hiếm: món vào túi, không mở trận, tốn zoneStep giờ', () => {
    const treasure = onlyStep('treasure')
    const start = enter(townState(), treasure)
    const opened = explore(start, treasure)
    expect(opened.battle).toBeNull()
    expect(getItemCount(opened.inventory, 'potion')).toBe(
      getItemCount(start.inventory, 'potion') + 1
    )
    expect(findLog(opened, 'zoneStep')?.result).toEqual({
      kind: 'treasure',
      items: [{ itemId: 'potion', count: 1 }]
    })
    expect(opened.time).toBe(start.time + data.config.clock.hours.zoneStep)
    const rare = onlyStep('rareTreasure')
    const rareOpened = explore(enter(townState(), rare), rare)
    expect(getItemCount(rareOpened.inventory, 'masterBall')).toBe(1)
  })

  it('bảng rương rỗng: không có món, vẫn tính bước', () => {
    const empty = makeZoneData((raw) => {
      raw.config.zones.stepWeights = {
        battle: 0,
        elite: 0,
        treasure: 1,
        rareTreasure: 0,
        spring: 0
      }
      defined(raw.zones[0], 'hiểm địa').treasure = { rolls: 3, items: [] }
    })
    const opened = explore(enter(townState(), empty), empty)
    expect(opened.zones.visit?.stepsTaken).toBe(1)
    expect(findLog(opened, 'zoneStep')?.result).toEqual({ kind: 'treasure', items: [] })
  })

  it('linh tuyền: hồi % max HP cho mọi quái, kể cả quái đã gục', () => {
    const spring = onlyStep('spring')
    const fallen = makeMonster({ id: 'down', damageTaken: 1_000_000 })
    const state = enter(townState([hero(), fallen]), spring)
    const healed = explore(state, spring)
    const monster = defined(
      healed.party.find((m) => m.id === 'down'),
      'quái'
    )
    expect(isFainted(spring, monster)).toBe(false)
    const maxHp = getMaxHp(spring, monster)
    expect(monster.damageTaken.toNumber()).toBe(Math.ceil(maxHp.toNumber() / 2))
  })

  it('lỗi: không trong hiểm địa, trong trận', () => {
    expectActionError(() => explore(townState()), 'noZoneVisit')
    const fighting = explore(enter(townState()))
    expectActionError(() => explore(fighting), 'inBattle')
  })
})

describe('boss canh giữ', () => {
  it('bước cuối là boss canh giữ; thắng: rương hiếm, hết lượt vào, khóa cooldownDays ngày', () => {
    const atLast = afterBattles(2)
    expect(atLast.zones.visit?.stepsTaken).toBe(2)
    const fighting = explore(atLast)
    const battle = defined(fighting.battle, 'trận')
    expect(battle.special).toEqual({ kind: 'zone', zoneId: FIXTURE_ZONE_ID, guardian: true })
    expect(battle.isBoss).toBe(true)
    expect(battle.enemies[0].speciesId).toBe('strongling')
    const done = fightAndLeave(fighting)
    expect(done.zones.visit).toBeNull()
    expect(done.zones.reopenDay[FIXTURE_ZONE_ID]).toBe(dayOf(done.time) + 3)
    // Rương hiếm 1 lượt × guardianRareRolls 2 (fixture boss không rơi Master Ball).
    expect(getItemCount(done.inventory, 'masterBall')).toBe(2)
  })

  it('boss canh giữ trùng loài boss tầng ở tầng cao nhất vẫn không mở tầng', () => {
    const done = fightAndLeave(explore(afterBattles(2)))
    expect(done.highestFloor).toBe(2)
  })

  it('chạy khỏi boss canh giữ: gặp lại ở lần khám phá sau', () => {
    const fled = gameReducer(data, explore(afterBattles(2)), { type: 'flee' })
    const left = gameReducer(data, fled, { type: 'leaveBattle' })
    expect(left.zones.visit?.stepsTaken).toBe(2)
    expect(defined(explore(left).battle, 'trận').special).toMatchObject({ guardian: true })
  })

  it('đang khóa thì không vào lại; tới ngày mở lại thì vào được', () => {
    const done = fightAndLeave(explore(afterBattles(2)))
    const reopenDay = defined(done.zones.reopenDay[FIXTURE_ZONE_ID], 'ngày mở lại')
    expectActionError(() => enter(done), 'zoneClosed', { zoneId: FIXTURE_ZONE_ID, reopenDay })
    const dayBefore = { ...done, time: (reopenDay - 1) * 24 + 23 }
    expectActionError(() => enter(dayBefore), 'zoneClosed')
    const reopened = { ...done, time: reopenDay * 24 }
    expect(dayOf(reopened.time)).toBe(reopenDay)
    expect(enter(reopened).zones.visit).not.toBeNull()
  })

  it('cooldownDays 0: vào lại ngay', () => {
    const noCooldown = makeZoneData((raw) => {
      raw.config.zones.cooldownDays = 0
    })
    const left = gameReducer(noCooldown, enter(townState(), noCooldown), { type: 'leaveZone' })
    expect(enter(left, noCooldown).zones.visit).not.toBeNull()
  })
})

describe('thua, rời, chặn việc khác', () => {
  it('thua trận hiểm địa: hết lượt vào, log zoneFailed, hiểm địa khóa', () => {
    let state = explore(enter(townState([weak()])))
    for (let i = 0; i < 200 && state.battle?.phase !== 'ended'; i++) {
      state = gameReducer(data, state, {
        type: 'submitTurn',
        commands: suggestBattleCommands(data, state, { transforms: false })
      })
    }
    expect(defined(state.battle, 'trận').outcome).toBe('lost')
    expect(logOf(state)).toContainEqual({ type: 'zoneFailed', zoneId: FIXTURE_ZONE_ID })
    expect(state.zones.visit).toBeNull()
    expect(state.zones.reopenDay[FIXTURE_ZONE_ID]).toBeDefined()
  })

  it('rời giữa chừng: giữ đồ, khóa hiểm địa; lỗi khi không trong hiểm địa / trong trận', () => {
    const left = gameReducer(data, enter(townState()), { type: 'leaveZone' })
    expect(left.zones.visit).toBeNull()
    expect(left.zones.reopenDay[FIXTURE_ZONE_ID]).toBe(dayOf(left.time) + 3)
    expectActionError(() => gameReducer(data, townState(), { type: 'leaveZone' }), 'noZoneVisit')
    const fighting = explore(enter(townState()))
    expectActionError(() => gameReducer(data, fighting, { type: 'leaveZone' }), 'inBattle')
  })

  it('đang trong hiểm địa: không nghỉ, hồi máu, đi lại, vào bí cảnh / khu bảo tồn / tháp', () => {
    const inside = enter(townState())
    const blocked: GameAction[] = [
      { type: 'rest' },
      { type: 'healParty' },
      { type: 'travel', to: { type: 'floor', floor: 1 } },
      { type: 'enterTrial' },
      { type: 'enterSafari' },
      { type: 'challengeTower' }
    ]
    for (const action of blocked) {
      expectActionError(() => gameReducer(data, inside, action), 'zoneInProgress')
    }
  })
})

describe('kiểm tra dữ liệu', () => {
  it('dữ liệu fixture hợp lệ; map của hiểm địa không là map của tầng', () => {
    expect(data.zones[FIXTURE_ZONE_ID].map.id).toBe(FIXTURE_ZONE_ID)
    expect(Object.hasOwn(data.biomes, FIXTURE_ZONE_ID)).toBe(false)
  })

  it('báo lỗi: id trùng biome, map không phải object, map sai như biome', () => {
    const zone = (raw: RawGameData): RawGameData['zones'][number] => defined(raw.zones[0], 'zone')
    expect(dataIssuesAfter((raw) => (zone(raw).id = 'field'), { regenerateText: true })).toContain(
      'Hiểm địa "field": id trùng biome "field"'
    )
    expect(
      dataIssuesAfter((raw) => {
        Object.assign(zone(raw), { map: 3 })
      })
    ).toContain(`Hiểm địa "${FIXTURE_ZONE_ID}": map phải là object`)
    const issues = dataIssuesAfter((raw) => {
      zone(raw).map.floorBossSpeciesId = 'twig'
    })
    expect(issues.some((issue) => issue.startsWith(`Biome "${FIXTURE_ZONE_ID}"`))).toBe(true)
  })

  it('báo lỗi điều kiện vào: loại lạ, hệ / race / loài / vật phẩm không tồn tại, consume sai', () => {
    const issues = dataIssuesAfter((raw) => {
      defined(raw.zones[0], 'zone').requirements = [
        { type: 'nope' } as unknown as ZoneRequirement,
        { type: 'partyElement', elementId: 'void', count: 0 },
        { type: 'partyRace', raceId: 'void', count: 1 },
        { type: 'partySpecies', speciesId: 'void' },
        { type: 'item', itemId: 'potion', count: 1, consume: 'yes' as unknown as boolean },
        { type: 'minFloor', floor: 0 }
      ]
    })
    const where = `Hiểm địa "${FIXTURE_ZONE_ID}": requirements`
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${where}[0].type phải là một trong`),
        `${where}[1]: hệ không tồn tại "void"`,
        expect.stringContaining(`${where}[1].count`),
        `${where}[2]: race không tồn tại "void"`,
        `${where}[3]: loài không tồn tại "void"`,
        `${where}[4].consume phải là boolean`,
        expect.stringContaining(`${where}[5].floor`)
      ])
    )
  })

  it('báo lỗi config / bảng rương', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.zones.stepWeights = {
        battle: 0,
        elite: 0,
        treasure: 0,
        rareTreasure: 0,
        spring: 0
      }
      raw.config.zones.steps = { min: 0, max: 2 }
      raw.config.zones.springHealPercent = 150
      defined(raw.zones[0], 'zone').treasure = {
        rolls: -1,
        items: [{ itemId: 'nope', weight: 1, min: 2, max: 1 }]
      }
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        'config.zones.stepWeights: cần ít nhất một loại bước có trọng số > 0',
        expect.stringContaining('config.zones.steps.min'),
        expect.stringContaining('config.zones.springHealPercent'),
        expect.stringContaining(`Hiểm địa "${FIXTURE_ZONE_ID}": treasure.rolls`),
        expect.stringContaining(`Hiểm địa "${FIXTURE_ZONE_ID}": treasure.items[0]`)
      ])
    )
  })
})

describe('save', () => {
  it('state trong hiểm địa / trong trận hiểm địa hợp lệ và đi qua serialize', () => {
    const inside = explore(enter(townState()))
    expect(validateGameState(data, inside)).toEqual([])
    expect(migrateState(serializeState(inside), data)).toEqual(inside)
    const guardian = explore(afterBattles(2))
    expect(validateGameState(data, guardian)).toEqual([])
  })

  it('báo lỗi save: hiểm địa lạ, stepsTaken ≥ steps, không ở thị trấn, boss canh giữ sai bước', () => {
    const inside = enter(townState())
    const visit = defined(inside.zones.visit, 'lượt vào')
    const broken = (patch: Partial<GameState>): string[] =>
      validateGameState(data, { ...inside, ...patch })
    expect(broken({ zones: { ...inside.zones, visit: { ...visit, zoneId: 'nope' } } })).toContain(
      'zones.visit.zoneId: hiểm địa không tồn tại "nope"'
    )
    expect(broken({ zones: { ...inside.zones, visit: { ...visit, stepsTaken: 3 } } })).toContain(
      'zones.visit.stepsTaken phải nhỏ hơn steps'
    )
    expect(broken({ location: { type: 'floor', floor: 1 } })).toContain(
      'zones.visit: phải ở thị trấn'
    )
    expect(broken({ zones: { visit: null, reopenDay: { nope: 1 } } })).toContain(
      'zones.reopenDay: hiểm địa lạ "nope"'
    )
    const fighting = explore(inside)
    const battle = defined(fighting.battle, 'trận')
    const fakeGuardian = {
      ...fighting,
      battle: {
        ...battle,
        special: { kind: 'zone' as const, zoneId: FIXTURE_ZONE_ID, guardian: true }
      }
    }
    expect(validateGameState(data, fakeGuardian)).toContain(
      'battle.special: boss canh giữ chỉ ở bước cuối của lượt vào'
    )
  })

  it('migrate v62 → v63: không có lượt vào, mọi hiểm địa mở', () => {
    const raw = serializeState(townState()) as Record<string, unknown>
    const { zones: _zones, ...old } = raw
    const migrated = migrateState({ ...old, version: 62 }, data)
    expect(migrated.zones).toEqual({ visit: null, reopenDay: {} })
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
