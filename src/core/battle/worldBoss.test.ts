// Boss thế giới (docs/rules/world-boss.md): lịch xuất hiện theo ngày, khiêu chiến 1 lần mỗi ngày ở thị
// trấn, HP vô hạn (không gục, sát thương vẫn tính, đòn theo máu mục tiêu không tác dụng), trận giới hạn
// lượt, rút lui, thua không mất tiền, cuồng bạo theo lượt, kỷ lục, bậc thưởng, nhận thưởng, kiểm tra
// dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, validateGameState } from '../game'
import { addItems, getBookCount, getItemCount } from '../inventory'
import { expForLevel, getMaxHp } from '../monster'
import { advanceTime, worldBossDailyTask } from '../progression'
import { BIG_ZERO, toBig } from '../shared'
import {
  generateWorldBoss,
  worldBossCandidates,
  worldBossHpUnit,
  worldBossLevel,
  worldBossTierOf,
  worldBossWindow
} from '../world'
import {
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
  HOURS_PER_DAY,
  type DayEvent,
  type GameData,
  type GameState,
  type Monster,
  type Skill,
  type WorldBossAppearance
} from '../model'
import { suggestBattleCommands, suggestReplacements } from './index'
import { fixedDamageAmount, ohkoAccuracy } from './fixedDamage'

/** Fixture: chu kỳ 5 ngày, boss xuất hiện 2 ngày cuối (ngày 3, 4 của chu kỳ 0), trận 10 lượt. */
function makeWorldBossData(
  edit: (raw: ReturnType<typeof makeRawData>) => void = () => {}
): GameData {
  const raw = makeRawData()
  raw.config.worldBoss = { ...raw.config.worldBoss, everyDays: 5, activeDays: 2 }
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeWorldBossData()

const hero = (overrides: Parameters<typeof makeMonster>[0] = {}): Monster =>
  makeMonster({
    id: 'h',
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike'],
    ...overrides
  })

const act = (state: GameState, action: Parameters<typeof gameReducer>[2]): GameState =>
  gameReducer(data, state, action)

/** Lần xuất hiện của loài strongling ở tầng 1 (kỷ lục `bestDamage`). */
function appearance(overrides: Partial<WorldBossAppearance> = {}): WorldBossAppearance {
  const source = { speciesId: 'strongling', floor: 1, level: worldBossLevel(data, 1), seed: 7 }
  const boss = generateWorldBoss(data, { source, id: 'b' })
  return {
    ...source,
    cycle: 0,
    endDay: 4,
    hpUnit: worldBossHpUnit(data, boss),
    bestDamage: BIG_ZERO,
    lastChallengeDay: null,
    ...overrides
  }
}

/** Thị trấn ngày 3 (giờ 6), boss đang xuất hiện. */
function bossState(
  party: Monster[] = [hero()],
  overrides: Partial<WorldBossAppearance> = {}
): GameState {
  const state = makeGameState({ seed: 3, party, money: 1000, time: 3 * HOURS_PER_DAY + 6 })
  return { ...state, worldBoss: { current: appearance(overrides), rewards: [] } }
}

function fightToEnd(state: GameState): GameState {
  let current = state
  for (let i = 0; i < 100 && current.battle?.phase !== 'ended'; i++) {
    const phase = defined(current.battle, 'trận').phase
    current =
      phase === 'chooseReplacement'
        ? act(current, { type: 'replaceFainted', replacements: suggestReplacements(data, current) })
        : act(current, {
            type: 'submitTurn',
            commands: suggestBattleCommands(data, current, { transforms: false })
          })
  }
  return current
}

const bossOf = (state: GameState): Monster => defined(state.battle, 'trận').enemies[0]

describe('lịch xuất hiện', () => {
  it('xuất hiện ở activeDays ngày cuối mỗi chu kỳ', () => {
    expect(worldBossWindow(data, 2)).toEqual({ cycle: 0, active: false, endDay: 4 })
    expect(worldBossWindow(data, 3)).toEqual({ cycle: 0, active: true, endDay: 4 })
    expect(worldBossWindow(data, 4).active).toBe(true)
    expect(worldBossWindow(data, 5)).toEqual({ cycle: 1, active: false, endDay: 9 })
    // Biên: ngày rất lớn vẫn đúng chu kỳ.
    expect(worldBossWindow(data, 5_000_000_004)).toMatchObject({
      cycle: 1_000_000_000,
      active: true
    })
  })

  it('tới ngày thì boss xuất hiện (loài hợp lệ, tầng cao nhất, kỷ lục 0) và báo sự kiện', () => {
    const state = makeGameState({ seed: 9, party: [hero()], highestFloor: 3, time: 2 * 24 + 6 })
    const next = advanceTime(data, state, HOURS_PER_DAY)
    const current = defined(next.worldBoss.current, 'boss')
    const ids = worldBossCandidates(data).map((candidate) => candidate.speciesId)
    expect(ids).toContain(current.speciesId)
    expect(current).toMatchObject({ cycle: 0, endDay: 4, floor: 3, lastChallengeDay: null })
    expect(current.level).toBe(worldBossLevel(data, 3))
    expect(current.bestDamage.eq(0)).toBe(true)
    expect(current.hpUnit.gt(0)).toBe(true)
    expect(next.dayEvents).toContainEqual({
      type: 'worldBossAppeared',
      speciesId: current.speciesId,
      endDay: 4
    })
    // Ngày kế tiếp vẫn trong thời gian: giữ nguyên lần xuất hiện.
    const later = advanceTime(data, next, HOURS_PER_DAY)
    expect(later.worldBoss.current).toEqual(current)
  })

  it('ngoài thời gian xuất hiện: không có boss, không tốn RNG', () => {
    const state = makeGameState({ seed: 9, party: [hero()] })
    const events: DayEvent[] = []
    const next = worldBossDailyTask(data, state, events, 1)
    expect(next).toBe(state)
    expect(events).toEqual([])
  })

  it('loài: dạng cuối, đủ phẩm cấp; không có loài nào thì không xuất hiện', () => {
    const ids = worldBossCandidates(data).map((candidate) => candidate.speciesId)
    expect(ids).toContain('strongling')
    // weakling còn tiến hóa (không phải dạng cuối).
    expect(ids).not.toContain('weakling')
    const none = makeWorldBossData((raw) => {
      raw.config.worldBoss = { ...raw.config.worldBoss, minSpeciesRankId: 'X' }
      for (const species of raw.species) if (species.kind === 'normal') species.rank = 'G'
    })
    expect(worldBossCandidates(none)).toEqual([])
    const state = makeGameState({ seed: 9, party: [hero()] })
    expect(worldBossDailyTask(none, state, [], 3)).toBe(state)
  })

  it('hết thời gian: kỷ lục đạt bậc thành thưởng chờ nhận, chưa đạt thì không có', () => {
    const reached = bossState([hero()], { bestDamage: appearance().hpUnit.times(2) })
    const events: DayEvent[] = []
    const next = worldBossDailyTask(data, reached, events, 5)
    expect(next.worldBoss.current).toBeNull()
    expect(next.worldBoss.rewards).toEqual([
      expect.objectContaining({ speciesId: 'strongling', floor: 1, tierId: 'S' })
    ])
    expect(events).toContainEqual({ type: 'worldBossLeft', speciesId: 'strongling', tierId: 'S' })
    const missed: DayEvent[] = []
    const empty = worldBossDailyTask(data, bossState(), missed, 5)
    expect(empty.worldBoss).toEqual({ current: null, rewards: [] })
    expect(missed).toContainEqual({ type: 'worldBossLeft', speciesId: 'strongling', tierId: null })
  })
})

describe('bậc thưởng', () => {
  const hpUnit = toBig(1000)
  const tierOf = (damage: number | string): string | null =>
    worldBossTierOf(data, { hpUnit, bestDamage: toBig(damage) })?.id ?? null

  it('bậc cao nhất có ngưỡng ≤ kỷ lục (biên đúng ngưỡng, 0, số cực lớn)', () => {
    expect(tierOf(0)).toBeNull()
    expect(tierOf(499)).toBeNull()
    expect(tierOf(500)).toBe('C')
    expect(tierOf(1999)).toBe('C')
    expect(tierOf(2000)).toBe('S')
    expect(tierOf('1e500')).toBe('S')
  })
})

describe('khiêu chiến', () => {
  it('mở trận boss thế giới: boss HP vô hạn, hệ số boss của config, ghi ngày khiêu chiến', () => {
    const state = act(bossState(), { type: 'challengeWorldBoss' })
    const battle = defined(state.battle, 'trận')
    expect(battle.special).toEqual({ kind: 'worldBoss' })
    expect(battle.isBoss).toBe(true)
    expect(bossOf(state)).toMatchObject({
      speciesId: 'strongling',
      endlessHp: true,
      bossMultiplier: 3
    })
    expect(state.worldBoss.current?.lastChallengeDay).toBe(3)
  })

  it('mọi lần khiêu chiến cùng một boss (sinh từ seed)', () => {
    const first = generateWorldBoss(data, { source: appearance(), id: 'x' })
    const second = generateWorldBoss(data, { source: appearance(), id: 'x' })
    expect(second).toEqual(first)
  })

  it('báo lỗi: không có boss, đã khiêu chiến hôm nay, không ở thị trấn, đang trong trận', () => {
    const none = makeGameState({ seed: 1, party: [hero()] })
    expectActionError(() => act(none, { type: 'challengeWorldBoss' }), 'noWorldBoss')
    const today = bossState([hero()], { lastChallengeDay: 3 })
    expectActionError(
      () => act(today, { type: 'challengeWorldBoss' }),
      'worldBossChallengedToday',
      {
        day: 3
      }
    )
    const away = { ...bossState(), location: { type: 'floor' as const, floor: 1 } }
    expectActionError(() => act(away, { type: 'challengeWorldBoss' }), 'notInTown')
    const fighting = act(bossState(), { type: 'challengeWorldBoss' })
    expectActionError(() => act(fighting, { type: 'challengeWorldBoss' }), 'inBattle')
  })

  it('hôm sau khiêu chiến lại được', () => {
    const state = bossState([hero()], { lastChallengeDay: 2 })
    expect(act(state, { type: 'challengeWorldBoss' }).battle).not.toBeNull()
  })
})

describe('trận boss thế giới', () => {
  it('boss không mất máu, không gục; hết số lượt thì trận kết thúc và ghi kỷ lục', () => {
    const ended = fightToEnd(act(bossState(), { type: 'challengeWorldBoss' }))
    const battle = defined(ended.battle, 'trận')
    expect(battle.outcome).toBe('won')
    expect(battle.turn).toBe(data.config.worldBoss.turns + 1)
    expect(bossOf(ended).damageTaken.eq(0)).toBe(true)
    const total = defined(battle.records[bossOf(ended).id], 'bản ghi').damageTaken
    // Tổng sát thương vượt xa máu của boss (HP vô hạn): đội mạnh hơn boss nhiều.
    expect(total.gt(getMaxHp(data, bossOf(ended)))).toBe(true)
    expect(battle.log).toContainEqual({ type: 'battleTimeUp' })
    expect(battle.log).toContainEqual({ type: 'worldBossDamage', total, record: true })
    expect(ended.worldBoss.current?.bestDamage.eq(total)).toBe(true)
    // Không thưởng chung (không EXP, không tiền).
    expect(ended.money.eq(1000)).toBe(true)
    expect(battle.log.some((event) => event.type === 'expGain')).toBe(false)
  })

  it('kỷ lục chỉ tăng: lần sau thấp hơn giữ kỷ lục cũ', () => {
    const best = toBig('1e300')
    const ended = fightToEnd(
      act(bossState([hero()], { bestDamage: best }), { type: 'challengeWorldBoss' })
    )
    expect(ended.worldBoss.current?.bestDamage.eq(best)).toBe(true)
    const damage = defined(ended.battle, 'trận').log.find((e) => e.type === 'worldBossDamage')
    expect(damage).toMatchObject({ record: false })
  })

  it('rời trận tốn clock.hours.worldBoss giờ (sang ngày sau)', () => {
    const ended = fightToEnd(act(bossState(), { type: 'challengeWorldBoss' }))
    const left = act(ended, { type: 'leaveBattle' })
    expect(left.time).toBe(ended.time + data.config.clock.hours.worldBoss)
  })

  it('rút lui: luôn thành công, kết thúc sớm, vẫn ghi kỷ lục', () => {
    const started = act(bossState(), { type: 'challengeWorldBoss' })
    const turned = act(started, {
      type: 'submitTurn',
      commands: suggestBattleCommands(data, started, { transforms: false })
    })
    const fled = act(turned, { type: 'flee' })
    const battle = defined(fled.battle, 'trận')
    expect(battle.outcome).toBe('fled')
    const total = defined(battle.records[bossOf(fled).id], 'bản ghi').damageTaken
    expect(total.gt(0)).toBe(true)
    expect(fled.worldBoss.current?.bestDamage.eq(total)).toBe(true)
  })

  it('không bắt được boss', () => {
    const started = act(bossState(), { type: 'challengeWorldBoss' })
    const withBall = { ...started, inventory: addItems(started.inventory, 'ball', 1) }
    expectActionError(
      () =>
        act(withBall, {
          type: 'submitTurn',
          commands: [{ kind: 'item', slot: 0, itemId: 'ball', targetId: bossOf(started).id }]
        }),
      'specialBattleRestricted',
      { command: 'ball' }
    )
  })

  it('đội gục: thua nhưng không mất tiền, vẫn ghi kỷ lục', () => {
    const weak = hero({ level: 1, exp: BIG_ZERO, genes: uniformStats(1) })
    const ended = fightToEnd(act(bossState([weak]), { type: 'challengeWorldBoss' }))
    const battle = defined(ended.battle, 'trận')
    expect(battle.outcome).toBe('lost')
    expect(ended.money.eq(1000)).toBe(true)
    expect(battle.log.some((event) => event.type === 'worldBossDamage')).toBe(true)
  })

  it('cuồng bạo từ lượt fromTurn (kích hoạt cuối lượt trước), không theo HP', () => {
    const started = act(bossState(), { type: 'challengeWorldBoss' })
    let state = started
    for (let turn = 1; turn <= 4; turn++) {
      const frenzied = defined(state.battle, 'trận').usedOnce[bossOf(state).id]?.includes('frenzy')
      expect(frenzied ?? false).toBe(false)
      state = act(state, {
        type: 'submitTurn',
        commands: suggestBattleCommands(data, state, { transforms: false })
      })
    }
    expect(defined(state.battle, 'trận').usedOnce[bossOf(state).id]).toContain('frenzy')
  })
})

describe('HP vô hạn với sát thương theo máu mục tiêu', () => {
  const skill = (fields: Partial<Skill>): Skill => ({
    id: 'x',
    elementId: 'normal',
    category: 'physical',
    power: 50,
    accuracy: 100,
    priority: 0,
    target: 'enemy',
    effects: [],
    ...fields
  })
  const attacker = hero()
  const boss = { ...makeMonster({ id: 'b' }), endlessHp: true as const }

  it('Super Fang / Endeavor / hạ gục một đòn không có tác dụng; sát thương cố định thường vẫn có', () => {
    for (const fixedDamage of [
      { kind: 'targetHpPercent' as const, percent: 50 },
      { kind: 'hpDifference' as const },
      { kind: 'ohko' as const }
    ]) {
      const amount = fixedDamageAmount({
        data,
        attacker,
        defender: boss,
        skill: skill({ fixedDamage })
      })
      expect(amount?.amount.eq(0)).toBe(true)
    }
    const flat = fixedDamageAmount({
      data,
      attacker,
      defender: boss,
      skill: skill({ fixedDamage: { kind: 'flat', amount: 40 } })
    })
    expect(flat?.amount.eq(40)).toBe(true)
    expect(ohkoAccuracy(skill({ fixedDamage: { kind: 'ohko' } }), attacker, boss)).toBe(0)
  })
})

describe('nhận thưởng', () => {
  const reward = {
    speciesId: 'strongling',
    floor: 1,
    level: 2,
    tierId: 'S',
    bestDamage: toBig(5000)
  }
  const withRewards = (state: GameState): GameState => ({
    ...state,
    worldBoss: { current: null, rewards: [reward, { ...reward, tierId: 'C' }] }
  })

  it('nhận mọi thưởng chờ: tiền, vật phẩm, sách của loài boss, trứng loài boss', () => {
    const state = withRewards(makeGameState({ seed: 4, party: [hero()], money: 0 }))
    const next = act(state, { type: 'claimWorldBossRewards' })
    const { moneyPerLevel } = data.config.rewards
    expect(next.money.eq(moneyPerLevel * 2 * (20 + 5))).toBe(true)
    expect(getItemCount(next.inventory, 'rareCandy')).toBe(2)
    expect(getItemCount(next.inventory, 'potion')).toBe(1)
    const books = ['strike', 'wave'].reduce(
      (sum, skillId) =>
        sum +
        getBookCount(next.inventory, { skillId, reusable: false }) +
        getBookCount(next.inventory, { skillId, reusable: true }),
      0
    )
    expect(books).toBe(1)
    expect(next.eggs).toHaveLength(1)
    expect(next.eggs[0].monster.history?.origin).toEqual({
      kind: 'bossEgg',
      bossSpeciesId: 'strongling'
    })
    expect(next.worldBoss.rewards).toEqual([])
  })

  it('báo lỗi: không có thưởng, không ở thị trấn, đang trong trận', () => {
    const none = makeGameState({ seed: 4, party: [hero()] })
    expectActionError(() => act(none, { type: 'claimWorldBossRewards' }), 'noWorldBossRewards')
    const away = withRewards(
      makeGameState({ seed: 4, party: [hero()], location: { type: 'floor', floor: 1 } })
    )
    expectActionError(() => act(away, { type: 'claimWorldBossRewards' }), 'notInTown')
    const fighting = withRewards(act(bossState(), { type: 'challengeWorldBoss' }))
    expectActionError(() => act(fighting, { type: 'claimWorldBossRewards' }), 'inBattle')
  })
})

describe('kiểm tra dữ liệu và save', () => {
  it('bậc thưởng phải tăng dần, activeDays ≤ everyDays, phẩm cấp tồn tại', () => {
    const issues = dataIssuesAfter((raw) => {
      const tiers = raw.config.worldBoss.tiers
      raw.config.worldBoss = {
        ...raw.config.worldBoss,
        everyDays: 2,
        activeDays: 3,
        minSpeciesRankId: 'Z',
        tiers: [tiers[1], { ...tiers[0], id: tiers[1].id }]
      }
    })
    expect(issues.some((issue) => issue.includes('activeDays không được vượt'))).toBe(true)
    expect(issues.some((issue) => issue.includes('minSpeciesRankId'))).toBe(true)
    expect(issues.some((issue) => issue.includes('minHpMultiple phải > 0'))).toBe(true)
    expect(issues.some((issue) => issue.includes('bị trùng'))).toBe(true)
  })

  it('vai trò cuồng bạo: fromTurn nguyên ≥ 2', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.config.frenzy.roles.worldBoss = { ...raw.config.frenzy.roles.worldBoss, fromTurn: 1 }
    })
    expect(issues.some((issue) => issue.includes('roles.worldBoss.fromTurn'))).toBe(true)
  })

  it('save hợp lệ có boss / trận boss; báo lỗi bậc lạ, HP vô hạn trên quái của người chơi', () => {
    const fighting = act(bossState(), { type: 'challengeWorldBoss' })
    expect(validateGameState(data, fighting)).toEqual([])
    const badReward = {
      ...fighting,
      worldBoss: {
        ...fighting.worldBoss,
        rewards: [
          { speciesId: 'strongling', floor: 1, level: 2, tierId: '?', bestDamage: BIG_ZERO }
        ]
      }
    }
    expect(validateGameState(data, badReward).some((i) => i.includes('tierId'))).toBe(true)
    const owned = bossState([{ ...hero(), endlessHp: true }])
    expect(validateGameState(data, owned).some((i) => i.includes('endlessHp'))).toBe(true)
    const noBoss = { ...fighting, worldBoss: { current: null, rewards: [] } }
    expect(validateGameState(data, noBoss).some((i) => i.includes('boss thế giới'))).toBe(true)
  })

  it('migrate v83: chưa có boss, không có thưởng chờ', () => {
    const state = makeGameState({ seed: 1, party: [hero()] })
    const { worldBoss: _worldBoss, ...rest } = JSON.parse(JSON.stringify(state)) as GameState
    const migrated = migrateState({ ...rest, version: 83 }, data)
    expect(migrated.worldBoss).toEqual({ current: null, rewards: [] })
  })
})
