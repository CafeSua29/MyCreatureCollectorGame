// Ngự thú sư NPC (docs/rules/trainers.md): sinh đội (tất định theo seed), gặp trên tầng, không bắt /
// không chạy, quái NPC được thay khi gục, AI đổi quái, phần thưởng, đạo quán và huy hiệu, giải đấu
// theo ngày, đấu trường lên bậc, kiểm tra dữ liệu / save, migrate.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer, migrateState, serializeState, validateGameState } from '../game'
import { expForLevel, getMaxHp, isFainted } from '../monster'
import { getItemCount } from '../inventory'
import { toBig } from '../shared'
import { generateTrainerTeam, trainerSpeciesPool } from '../world'
import {
  FIXTURE_GYM_LEADER_ID,
  FIXTURE_TRAINER_ID,
  atFloor,
  dataIssuesAfter,
  defined,
  expectActionError,
  fixtureSite,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText
} from '../testing'
import type { BattleEvent, GameData, GameState, Monster, RawGameData } from '../model'
import { suggestBattleCommands } from './ai'
import { suggestReplacements } from './battleActions'
import { withAiSwitches } from './trainerAi'
import type { Draft } from './draft'

function makeTrainerData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.config.trainers.encounterChance = 100
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeTrainerData()

/** Quái ta rất mạnh: thắng mọi trận NPC ở tầng thấp. */
const hero = (id = 'h'): Monster =>
  makeMonster({
    id,
    level: 80,
    exp: expForLevel(80, 'mediumFast'),
    genes: uniformStats(500),
    skillIds: ['strike']
  })

/** Đánh tới khi trận kết thúc bằng AI cho phe người chơi (cả chọn quái thay). */
function fightToEnd(state: GameState, gameData: GameData = data): GameState {
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
  return current
}

const logOf = (state: GameState): BattleEvent[] => defined(state.battle, 'trận').log

describe('sinh đội NPC', () => {
  it('tất định theo seed; level theo tầng + offset; khế ước theo cảnh giới NPC', () => {
    const spec = {
      site: fixtureSite(data, 3),
      trainerClass: data.trainers[FIXTURE_GYM_LEADER_ID],
      extraLevels: 2,
      realm: 4,
      nextMonsterId: 10,
      nextItemId: 1
    }
    const a = generateTrainerTeam(data, 7, spec)
    expect(generateTrainerTeam(data, 7, spec)).toEqual(a)
    expect(a.enemies).toHaveLength(3)
    // Tầng 3: level quái hoang 5..5, + 5 (lớp) + 2 (thêm).
    expect(a.enemies.map((m) => m.level)).toEqual([12, 12, 12])
    expect(a.enemies.every((m) => m.contractRealm === 4 && m.shinyStacks === 0)).toBe(true)
    expect(a.enemies.map((m) => m.id)).toEqual(['m10', 'm11', 'm12'])
    expect(a.nextMonsterId).toBe(13)
  })

  it('bảng loài theo hệ; không loài nào khớp thì lấy mọi loài hoang', () => {
    expect(trainerSpeciesPool(data, ['grass'])).toEqual([{ speciesId: 'weakling', weight: 1 }])
    expect(trainerSpeciesPool(data, ['fire'])).toEqual([{ speciesId: 'weakling', weight: 1 }])
  })

  it('bảng loài tính một lần cho mỗi bộ dữ liệu và bộ hệ: gọi lại cho cùng kết quả', () => {
    const all = trainerSpeciesPool(data, [])
    expect(trainerSpeciesPool(data, ['grass'])).toBe(trainerSpeciesPool(data, ['grass']))
    expect(trainerSpeciesPool(data, [])).toBe(all)
    // Bộ dữ liệu khác (cùng nội dung) có bảng riêng, cùng giá trị.
    const other = makeTrainerData()
    expect(trainerSpeciesPool(other, [])).not.toBe(all)
    expect(trainerSpeciesPool(other, [])).toEqual(all)
  })
})

describe('trận NPC trên tầng', () => {
  const start = (party: Monster[] = [hero()], seed = 3): GameState =>
    gameReducer(data, atFloor(makeGameState({ seed, party }), 1), {
      type: 'startWildBattle'
    })

  it('gặp NPC: đội NPC, ngự thú sư phe địch chỉ dùng kỹ năng của lớp, save hợp lệ', () => {
    const state = start()
    const battle = defined(state.battle, 'trận')
    expect(battle.trainer).toEqual({
      classId: FIXTURE_TRAINER_ID,
      mode: 'floor',
      elementId: null,
      rewardMultiplier: 1
    })
    expect(battle.tamers.enemy?.skillIds).toEqual(['mend'])
    expect(logOf(state)[0]).toEqual({
      type: 'trainerAppeared',
      classId: FIXTURE_TRAINER_ID,
      mode: 'floor'
    })
    expect(validateGameState(data, state)).toEqual([])
  })

  it('tỉ lệ 0: không tốn RNG, gặp quái hoang như cũ', () => {
    const off = makeTrainerData((raw) => (raw.config.trainers.encounterChance = 0))
    const state = gameReducer(off, atFloor(makeGameState({ seed: 3, party: [hero()] }), 1), {
      type: 'startWildBattle'
    })
    expect(defined(state.battle, 'trận').trainer).toBeNull()
  })

  it('không ném bóng, không chạy được (state giữ nguyên)', () => {
    const state = start()
    const withBall = { ...state, inventory: { ...state.inventory, stacks: { ball: 1 } } }
    const target = defined(defined(state.battle, 'trận').enemySlots[0], 'địch')
    expectActionError(
      () =>
        gameReducer(data, withBall, {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'item', itemId: 'ball', targetId: target }]
        }),
      'trainerBattleRestricted'
    )
    expectActionError(() => gameReducer(data, state, { type: 'flee' }), 'trainerBattleRestricted')
  })

  it('quái NPC gục thì quái dự bị ra thay; thắng: tiền × hệ số lớp, không đồ rơi của map', () => {
    // Seed cho đội NPC 3 quái (lớp fixture 2–3 quái).
    const team = [hero('h1'), hero('h2'), hero('h3')]
    const seed = [1, 2, 4, 5, 6, 7, 8].find(
      (s) => defined(start(team, s).battle, 'trận').enemies.length === 3
    )
    const won = fightToEnd(start(team, defined(seed, 'seed')))
    const battle = defined(won.battle, 'trận')
    expect(battle.enemies.length).toBeGreaterThan(2)
    expect(battle.outcome).toBe('won')
    const enters = battle.log.filter((e) => e.type === 'enter' && e.side === 'enemy')
    expect(enters.length).toBe(battle.enemies.length)
    expect(battle.log.some((e) => e.type === 'drop')).toBe(false)
    const money = battle.log.find((e) => e.type === 'won')
    // Mỗi quái level 1 cho moneyPerLevel 5 tiền; × 2 (lớp fixture).
    expect(money).toEqual({ type: 'won', money: toBig(5 * 2 * battle.enemies.length) })
    expect(validateGameState(data, won)).toEqual([])
  })
})

describe('AI đổi quái', () => {
  it('hồ sơ switcher: quái không có lựa chọn tốt thì đổi sang dự bị mạnh hơn', () => {
    const idle = makeMonster({ id: 'e1', skillIds: ['idle'], contractRealm: 0 })
    const striker = makeMonster({ id: 'e3', skillIds: ['strike'], contractRealm: 0 })
    // Quái ta còn 1 máu: dự bị biết strike hạ được ngay (điểm cao), quái chỉ biết idle thì 0 điểm.
    const target = makeMonster({ id: 'a' })
    const base = makeBattleState(
      [{ ...target, damageTaken: getMaxHp(data, target).minus(1) }],
      [idle, makeMonster({ id: 'e2', skillIds: ['strike'], contractRealm: 0 }), striker],
      { turn: 2 }
    )
    const battle = defined(base.battle, 'trận')
    const d: Draft = {
      ...base,
      battle: {
        ...battle,
        trainer: {
          classId: FIXTURE_GYM_LEADER_ID,
          mode: 'floor',
          elementId: null,
          rewardMultiplier: 1
        }
      }
    }
    const commands = withAiSwitches(data, d, 'enemy', [
      { slot: 0, kind: 'skill', skillId: 'idle' },
      { slot: 1, kind: 'skill', skillId: 'strike' }
    ])
    expect(commands[0]).toEqual({ slot: 0, kind: 'switch', monsterId: 'e3' })
    expect(commands[1]).toEqual({ slot: 1, kind: 'skill', skillId: 'strike' })
    // Hồ sơ standard không đổi.
    const standard: Draft = {
      ...d,
      battle: {
        ...d.battle,
        trainer: {
          classId: FIXTURE_TRAINER_ID,
          mode: 'floor',
          elementId: null,
          rewardMultiplier: 1
        }
      }
    }
    expect(
      withAiSwitches(data, standard, 'enemy', [{ slot: 0, kind: 'skill', skillId: 'idle' }])
    ).toEqual([{ slot: 0, kind: 'skill', skillId: 'idle' }])
  })
})

describe('đạo quán', () => {
  const gymState = (overrides: Partial<GameState['trainers']['gyms'][number]> = {}): GameState => {
    const state = atFloor(makeGameState({ seed: 5, party: [hero()], highestFloor: 50 }), 50)
    const gym = {
      floor: 50,
      elementId: 'grass',
      trainerCount: 2,
      progress: 0,
      wins: 0,
      ...overrides
    }
    return { ...state, trainers: { ...state.trainers, gyms: [gym] } }
  }

  it('tầng không có đạo quán / không ở tầng: báo lỗi', () => {
    expectActionError(
      () =>
        gameReducer(data, atFloor(makeGameState({ seed: 1, party: [hero()] }), 1), {
          type: 'challengeGym'
        }),
      'noGym'
    )
    expectActionError(
      () =>
        gameReducer(data, makeGameState({ seed: 1, party: [hero()] }), { type: 'challengeGym' }),
      'notOnFloor'
    )
  })

  it('thắng NPC tăng tiến độ; đủ thì quán chủ; lần đầu thắng: huy hiệu, vật phẩm chìa khóa', () => {
    let state = gymState()
    for (const expected of [1, 2]) {
      state = fightToEnd(gameReducer(data, state, { type: 'challengeGym' }))
      expect(defined(state.battle, 'trận').trainer?.mode).toBe('gym')
      state = gameReducer(data, state, { type: 'leaveBattle' })
      expect(state.trainers.gyms[0].progress).toBe(expected)
    }
    state = gameReducer(data, state, { type: 'challengeGym' })
    expect(defined(state.battle, 'trận').trainer?.mode).toBe('gymLeader')
    expect(defined(state.battle, 'trận').enemies).toHaveLength(3)
    state = fightToEnd(state)
    const log = logOf(state)
    expect(log).toContainEqual({ type: 'gymCleared', floor: 50, first: true })
    expect(log).toContainEqual({ type: 'keyItemReceived', itemId: 'teraOrb' })
    expect(getItemCount(state.inventory, 'teraOrb')).toBe(1)
    expect(state.trainers.gyms[0]).toMatchObject({ progress: 0, wins: 1 })
  })

  it('đánh lại đạo quán có huy hiệu: tiền × repeatRewardPercent', () => {
    const first = fightToEnd(gameReducer(data, gymState(), { type: 'challengeGym' }))
    const again = fightToEnd(gameReducer(data, gymState({ wins: 1 }), { type: 'challengeGym' }))
    const moneyOf = (s: GameState): number =>
      (logOf(s).find((e) => e.type === 'won') as { money: { toNumber(): number } }).money.toNumber()
    expect(again.trainers.gyms[0].progress).toBe(1)
    expect(moneyOf(again)).toBeLessThan(moneyOf(first))
  })

  it('mở tầng đạo quán: tung hệ, log gymOpened', () => {
    const state = atFloor(makeGameState({ seed: 2, party: [hero()], highestFloor: 9 }), 9)
    const won = fightToEnd(gameReducer(data, state, { type: 'challengeBoss' }))
    expect(won.highestFloor).toBe(10)
    expect(won.trainers.gyms).toHaveLength(1)
    expect(logOf(won)).toContainEqual({
      type: 'gymOpened',
      floor: 10,
      elementId: won.trainers.gyms[0].elementId
    })
  })
})

describe('giải đấu', () => {
  const town = (): GameState => makeGameState({ seed: 4, party: [hero()], highestFloor: 2 })

  it('đăng ký mỗi kỳ một lần; đang dự giải không nghỉ / hồi máu / rời thị trấn', () => {
    const entered = gameReducer(data, town(), { type: 'enterTournament' })
    expect(entered.trainers.tournament).toEqual({ lastPeriod: 0, round: 0 })
    expectActionError(
      () => gameReducer(data, entered, { type: 'enterTournament' }),
      'tournamentInProgress'
    )
    expectActionError(() => gameReducer(data, entered, { type: 'rest' }), 'tournamentInProgress')
    expectActionError(
      () => gameReducer(data, entered, { type: 'healParty' }),
      'tournamentInProgress'
    )
    expectActionError(
      () => gameReducer(data, entered, { type: 'travel', to: { type: 'floor', floor: 1 } }),
      'tournamentInProgress'
    )
    const left = gameReducer(data, entered, { type: 'forfeitTournament' })
    expect(left.trainers.tournament.round).toBeNull()
    expectActionError(
      () => gameReducer(data, left, { type: 'enterTournament' }),
      'tournamentNotOpen'
    )
    expectActionError(
      () => gameReducer(data, left, { type: 'challengeTournament' }),
      'noTournament'
    )
    // Kỳ sau (ngày 30) đăng ký lại được.
    expect(
      gameReducer(data, { ...left, time: 30 * 24 }, { type: 'enterTournament' }).trainers.tournament
    ).toEqual({ lastPeriod: 1, round: 0 })
  })

  it('thắng 3 vòng: vô địch nhận thưởng; trận ở thị trấn môi trường mặc định', () => {
    let state = gameReducer(data, town(), { type: 'enterTournament' })
    for (let round = 0; round < 3; round++) {
      state = fightToEnd(gameReducer(data, state, { type: 'challengeTournament' }))
      expect(logOf(state)).toContainEqual({ type: 'tournamentRoundWon', round })
      state = gameReducer(data, state, { type: 'leaveBattle' })
    }
    expect(state.trainers.tournament.round).toBeNull()
    expect(getItemCount(state.inventory, 'potion')).toBe(3)
    // Bộ đếm thành tựu (docs/rules/achievements.md): + vô địch, mỗi vòng + trận thắng / NPC.
    expect(state.stats).toMatchObject({ tournamentsWon: 1, battlesWon: 3, trainersDefeated: 3 })
  })

  it('thua: bị loại', () => {
    const weak = makeMonster({ id: 'w', skillIds: ['idle'] })
    let state = gameReducer(data, makeGameState({ seed: 4, party: [weak], highestFloor: 5 }), {
      type: 'enterTournament'
    })
    state = fightToEnd(gameReducer(data, state, { type: 'challengeTournament' }))
    expect(defined(state.battle, 'trận').outcome).toBe('lost')
    expect(logOf(state)).toContainEqual({ type: 'tournamentEliminated', round: 0 })
    expect(state.trainers.tournament.round).toBeNull()
  })
})

describe('đấu trường xếp hạng', () => {
  it('thắng lên bậc, mốc mỗi 10 bậc nhận thưởng; đối thủ mạnh dần theo bậc', () => {
    const base = makeGameState({ seed: 6, party: [hero()] })
    const state = { ...base, trainers: { ...base.trainers, arenaRank: 9 } }
    const started = gameReducer(data, state, { type: 'challengeArena' })
    // Bậc 9 × 0,5 = +4 level.
    expect(defined(started.battle, 'trận').enemies[0].level).toBe(5)
    const won = fightToEnd(started)
    expect(won.trainers.arenaRank).toBe(10)
    expect(logOf(won)).toContainEqual({ type: 'arenaRankUp', rank: 10 })
    expect(getItemCount(won.inventory, 'potion')).toBe(1)
    expectActionError(
      () => gameReducer(data, atFloor(base, 1), { type: 'challengeArena' }),
      'notInTown'
    )
  })

  it('thua không mất bậc', () => {
    const base = makeGameState({ seed: 6, party: [makeMonster({ id: 'w', skillIds: ['idle'] })] })
    const state = { ...base, trainers: { ...base.trainers, arenaRank: 3 } }
    const lost = fightToEnd(gameReducer(data, state, { type: 'challengeArena' }))
    expect(defined(lost.battle, 'trận').outcome).toBe('lost')
    expect(lost.trainers.arenaRank).toBe(3)
  })
})

describe('dữ liệu và save', () => {
  it('lớp NPC / config sai báo lỗi', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.trainers[0].aiProfile = 'x' as 'standard'
      raw.trainers[0].tamerSkillIds = ['nope']
      raw.trainers[0].teamSize = { min: 3, max: 1 }
      raw.config.trainers.gym.leaderClassId = FIXTURE_TRAINER_ID
      raw.config.trainers.gym.keyItemFloors = { teraOrb: 15 }
      raw.biomes[0].trainerClassIds = [FIXTURE_GYM_LEADER_ID]
    }).join('\n')
    expect(issues).toContain('aiProfile')
    expect(issues).toContain('kỹ năng ngự thú sư không tồn tại "nope"')
    expect(issues).toContain('teamSize: max phải ≥ min')
    expect(issues).toContain('config.trainers.gym.leaderClassId')
    expect(issues).toContain('tầng 15 không có đạo quán')
    expect(issues).toContain('trainerClassIds: "leader" không phải NPC kind regular')
  })

  it('save: quái NPC phải có khế ước; đạo quán sai tầng; giải đấu ngoài thị trấn', () => {
    const battle = gameReducer(data, atFloor(makeGameState({ seed: 3, party: [hero()] }), 1), {
      type: 'startWildBattle'
    })
    const enemies = defined(battle.battle, 'trận').enemies.map((m) => ({
      ...m,
      contractRealm: null
    }))
    const bad = { ...battle, battle: { ...defined(battle.battle, 'trận'), enemies } }
    expect(validateGameState(data, bad).join('\n')).toContain(
      'quái của NPC phải có cảnh giới khế ước'
    )
    const state = makeGameState({ seed: 1, party: [hero()], highestFloor: 12 })
    const gym = { floor: 15, elementId: 'grass', trainerCount: 2, progress: 3, wins: 0 }
    const issues = validateGameState(data, {
      ...atFloor(state, 1),
      trainers: { gyms: [gym], arenaRank: 0, tournament: { lastPeriod: 0, round: 1 } }
    }).join('\n')
    expect(issues).toContain('tầng 15 không phải tầng đạo quán đã mở')
    expect(issues).toContain('progress phải ≤ trainerCount')
    expect(issues).toContain('đang dự giải thì phải ở thị trấn')
  })

  it('migrate v44 → v45: đạo quán cho các tầng đã mở, bậc 0, chưa dự giải', () => {
    const raw = serializeState(
      makeGameState({ seed: 1, party: [hero()], highestFloor: 25 })
    ) as Record<string, unknown>
    const { trainers: _trainers, ...old } = raw
    const migrated = migrateState({ ...old, version: 44 }, data)
    expect(migrated.trainers.gyms.map((gym) => gym.floor)).toEqual([10, 20])
    expect(migrated.trainers.arenaRank).toBe(0)
    expect(migrated.trainers.tournament).toEqual({ lastPeriod: -1, round: null })
    expect(validateGameState(data, migrated)).toEqual([])
    expect(isFainted(data, migrated.party[0])).toBe(false)
  })
})
