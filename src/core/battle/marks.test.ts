// Dấu ấn trong trận (docs/rules/marks.md): ghi việc trong trận vào bản ghi của quái ta, rồi lúc hết
// trận tung / đếm dấu theo từng nguồn (phá bộ phận, chí mạng, gục, trạng thái, suýt chết, hiểm địa,
// thích nghi, ám ảnh, vượt ám ảnh, chiến tích, sẹo chai), quái NPC không nhận.

import { describe, expect, it } from 'vitest'
import { gameReducer, validateGameState } from '../game'
import { getMaxHp } from '../monster'
import { cloneData, toBig } from '../shared'
import type {
  BattleOutcome,
  BattleRecord,
  GameData,
  GameState,
  MarkBattleRecord,
  MarkInstance,
  MarkConfig,
  Monster
} from '../model'
import { defined, makeBattleState, makeData, makeMarkData, makeMonster } from '../testing'
import { emptyRecord, type Draft } from './draft'
import { grantTribulationTrophy, recordMarkCrit, rollBattleMarks } from './marks'

const origin = { source: 'partBreak', floor: 1 } as const
const mark = (markId: string, extra: Partial<MarkInstance> = {}): MarkInstance => ({
  markId,
  level: 1,
  origin,
  ...extra
})

/** Trận có quái ta `a` (bản ghi `record`, phần dấu `marks`) và một quái địch. */
function battleWith(
  {
    monster = {},
    record = {},
    marks,
    enemy = {}
  }: {
    monster?: Partial<Monster>
    record?: Partial<BattleRecord>
    marks?: MarkBattleRecord
    enemy?: Partial<Monster>
  },
  overrides: Partial<NonNullable<GameState['battle']>> = {}
): GameState {
  const base = makeBattleState(
    [makeMonster({ id: 'a', skillIds: ['strike'], ...monster })],
    [makeMonster({ id: 'e1', skillIds: ['idle'], ...enemy })],
    overrides
  )
  const battle = defined(base.battle)
  const full = { ...emptyRecord(), ...record, ...(marks ? { marks } : {}) }
  return {
    ...base,
    battle: {
      ...battle,
      participants: ['a'],
      records: { ...battle.records, a: full }
    }
  }
}

/** Chạy tung dấu lúc hết trận trên bản sao, trả về quái `a` và log trận. */
function settle(
  data: GameData,
  state: GameState,
  outcome: BattleOutcome = 'won'
): { monster: Monster; log: NonNullable<GameState['battle']>['log']; draft: Draft } {
  // Ép kiểu: bản sao của state đang có trận.
  const d = cloneData(state) as Draft
  rollBattleMarks(data, d, outcome)
  return { monster: defined(d.party.find((m) => m.id === 'a')), log: d.battle.log, draft: d }
}

const dataWith = (config: Partial<MarkConfig>): GameData => makeMarkData(config)
const ids = (monster: Monster): string[] => monster.marks.map((m) => m.markId)

describe('nguồn sẹo / đột biến', () => {
  it('bộ phận bị phá: đột biến trúng thì không tung sẹo; trượt thì sẹo ở bộ phận đó', () => {
    const state = battleWith({ record: { brokenParts: ['legs'] } })
    const mutated = settle(
      dataWith({ mutationOnBreakPercent: 100, scarOnBreakPercent: 100 }),
      state
    )
    expect(ids(mutated.monster)).toEqual(['springLegs'])
    const scarred = settle(dataWith({ scarOnBreakPercent: 100 }), state)
    expect(ids(scarred.monster)).toEqual(['limp'])
    expect(scarred.monster.marks[0].origin).toEqual({ source: 'partBreak', floor: 1 })
    expect(scarred.log).toContainEqual({
      type: 'markGained',
      monsterId: 'a',
      markId: 'limp',
      level: 1,
      source: 'partBreak'
    })
    // Lý lịch ghi mốc.
    expect(scarred.monster.history?.milestones.at(-1)).toMatchObject({
      kind: 'markGained',
      markId: 'limp',
      floor: 1
    })
  })

  it('tỉ lệ 0 (mặc định fixture): không dấu, không tốn RNG', () => {
    const state = battleWith({ record: { brokenParts: ['legs'], deaths: 1 } })
    const { monster, draft } = settle(dataWith({}), state)
    expect(monster.marks).toEqual([])
    expect(draft.rng).toEqual(state.rng)
  })

  it('đòn chí mạng lớn: sẹo ở bộ phận bị nhắm, kèm loài đối thủ', () => {
    const state = battleWith({
      marks: { critWounds: [{ partId: 'head', opponentSpeciesId: 'weakling' }] }
    })
    const { monster } = settle(dataWith({ scarOnCritPercent: 100 }), state)
    expect(monster.marks).toEqual([
      mark('blindEye', { origin: { source: 'crit', floor: 1, opponentSpeciesId: 'weakling' } })
    ])
  })

  it('gục trong trận: một sẹo ở bộ phận ngẫu nhiên (cả khi thua)', () => {
    const state = battleWith({ record: { deaths: 2 } })
    const { monster } = settle(dataWith({ scarOnFaintPercent: 100 }), state, 'lost')
    expect(monster.marks).toHaveLength(1)
    expect(monster.marks[0].origin.source).toBe('faint')
  })

  it('trạng thái nặng còn lúc hết trận: sẹo của trạng thái', () => {
    const state = battleWith({
      monster: { statuses: [{ statusId: 'burn', turnsLeft: null }] }
    })
    const { monster } = settle(dataWith({ scarOnStatusPercent: 100 }), state)
    expect(ids(monster)).toEqual(['deepBurn'])
  })

  it('thắng khi suýt chết: đột biến; còn nhiều máu / thua / không ra sân thì không', () => {
    const data = dataWith({ mutationOnNearDeathPercent: 100 })
    // Còn đúng 1 máu (chưa gục).
    const nearState = withHpLeft(data, battleWith({}), 1)
    expect(settle(data, nearState).monster.marks).toHaveLength(1)
    expect(settle(data, nearState, 'fled').monster.marks).toEqual([])
    expect(settle(data, battleWith({})).monster.marks).toEqual([])
    const benched = { ...nearState, battle: { ...defined(nearState.battle), participants: [] } }
    expect(settle(data, benched).monster.marks).toEqual([])
  })

  it('hiểm địa: map có markHazardPercent cho quái đã ra sân đột biến', () => {
    const data = makeMarkData({}, (raw) => {
      for (const biome of raw.biomes) biome.markHazardPercent = 100
    })
    const { monster } = settle(data, battleWith({}), 'lost')
    expect(monster.marks).toHaveLength(1)
    expect(monster.marks[0].origin.source).toBe('hazard')
  })

  it('quái địch / quái NPC không nhận dấu', () => {
    const state = battleWith({ record: { brokenParts: ['legs'] } })
    const battle = defined(state.battle)
    const withEnemyRecord = {
      ...state,
      battle: {
        ...battle,
        records: { ...battle.records, e1: { ...emptyRecord(), brokenParts: ['legs'] } }
      }
    }
    const { draft } = settle(dataWith({ scarOnBreakPercent: 100 }), withEnemyRecord)
    expect(draft.battle.enemies[0].marks).toEqual([])
  })
})

describe('thích nghi', () => {
  it('trúng đòn theo hệ, dính debuff, môi trường: đếm rồi nhận theo ngưỡng (không RNG)', () => {
    const state = battleWith({
      marks: { hitElements: { fire: 3 }, statuses: { poison: 1 }, fields: ['rain'] }
    })
    const { monster, draft } = settle(dataWith({}), state)
    expect(monster.marks.map((m) => `${m.markId}:${m.targetId}`)).toEqual([
      'elementAdapted:fire',
      'statusAdapted:poison',
      'weatherAdapted:rain'
    ])
    expect(monster.markCounters).toEqual({ 'elementAdapted:fire': 1 })
    expect(draft.rng).toEqual(state.rng)
  })
})

describe('ám ảnh và vượt qua', () => {
  it('gục đủ traumaThreshold lần dưới tay một loài thì sợ loài đó', () => {
    const foe = { speciesId: 'strongling', elementId: 'fire' }
    const twice = settle(dataWith({}), battleWith({ marks: { faintedBy: [foe, foe] } }), 'lost')
    expect(twice.monster.marks).toEqual([])
    expect(twice.monster.markCounters).toEqual({ 'fearSpecies:strongling': 2 })
    const third = battleWith({
      monster: { markCounters: twice.monster.markCounters },
      marks: { faintedBy: [foe] }
    })
    const feared = settle(dataWith({}), third, 'lost').monster
    expect(feared.marks).toEqual([
      mark('fearSpecies', {
        targetId: 'strongling',
        origin: { source: 'trauma', floor: 1, opponentSpeciesId: 'strongling' }
      })
    ])
    expect(feared.markCounters).toEqual({})
  })

  it('thắng trận không gặp lại thì bộ đếm giảm 1; gặp lại thì giữ', () => {
    const counters = { 'fearSpecies:strongling': 2 }
    const away = settle(dataWith({}), battleWith({ monster: { markCounters: counters } }))
    expect(away.monster.markCounters).toEqual({ 'fearSpecies:strongling': 1 })
    const met = battleWith({
      monster: { markCounters: counters },
      enemy: { speciesId: 'strongling', baseSpeciesId: 'strongling' }
    })
    expect(settle(dataWith({}), met).monster.markCounters).toEqual(counters)
  })

  it('hạ đúng thứ đang sợ đủ resolveThreshold lần: mất ám ảnh, nhận chiến tích cùng đối tượng', () => {
    const kill = { speciesId: 'weakling', raceId: 'neutral', elementIds: ['grass'], boss: false }
    const state = battleWith({
      monster: { marks: [mark('fearSpecies', { targetId: 'weakling', resolveCount: 2 })] },
      marks: { kills: [kill] }
    })
    const { monster, log } = settle(dataWith({}), state)
    expect(monster.marks.map((m) => `${m.markId}:${m.targetId}`)).toEqual([
      'conquerSpecies:weakling'
    ])
    expect(log).toContainEqual({
      type: 'markRemoved',
      monsterId: 'a',
      markId: 'fearSpecies',
      targetId: 'weakling',
      reason: 'resolved'
    })
    // Chưa đủ: chỉ cộng resolveCount.
    const partial = battleWith({
      monster: { marks: [mark('fearSpecies', { targetId: 'weakling' })] },
      marks: { kills: [kill] }
    })
    expect(settle(dataWith({}), partial).monster.marks[0].resolveCount).toBe(1)
  })
})

describe('chiến tích', () => {
  it('hạ boss bằng đòn hạ gục: mỗi boss lên một cấp; hạ đủ quái một race theo ngưỡng tăng dần', () => {
    const boss = { speciesId: 'weakling', raceId: 'neutral', elementIds: ['grass'], boss: true }
    const plain = { ...boss, boss: false }
    const state = battleWith({ marks: { kills: [boss, boss, plain] } })
    const { monster } = settle(dataWith({}), state)
    expect(monster.marks.map((m) => `${m.markId}:${m.level}`)).toEqual([
      'bossSlayer:2',
      'raceSlayer:1'
    ])
    // threshold 2: 3 quái → cấp 1 (cần 2), dư 1.
    expect(monster.markCounters).toEqual({ 'raceSlayer:neutral': 1 })
  })

  it('ra sân trong trận thắng boss thế giới', () => {
    const state = battleWith({}, { special: { kind: 'worldBoss' } })
    expect(ids(settle(dataWith({}), state).monster)).toEqual(['worldBossVeteran'])
    expect(settle(dataWith({}), state, 'lost').monster.marks).toEqual([])
  })

  it('độ kiếp thành công', () => {
    const d = cloneData(battleWith({})) as Draft
    grantTribulationTrophy(makeMarkData(), d, 'a')
    expect(ids(defined(d.party[0]))).toEqual(['tribulationSurvivor'])
  })
})

describe('sẹo chai thành sẹo chiến', () => {
  it('đủ số trận thắng thì tung tỉ lệ đổi thành mục hardensInto', () => {
    const state = battleWith({ monster: { marks: [mark('blindEye', { winBattles: 99 })] } })
    const hardened = settle(dataWith({ scarHardenBattles: 100, scarHardenPercent: 100 }), state)
    expect(ids(hardened.monster)).toEqual(['warScarHead'])
    const counted = settle(dataWith({ scarHardenBattles: 101, scarHardenPercent: 100 }), state)
    expect(counted.monster.marks).toEqual([mark('blindEye', { winBattles: 100 })])
    // Thua: không đếm.
    expect(settle(dataWith({}), state, 'lost').monster.marks[0].winBattles).toBe(99)
  })
})

describe('ghi trong trận', () => {
  it('đòn chí mạng chỉ ghi khi lấy ≥ critScarHpPercent % max HP', () => {
    const d = cloneData(battleWith({})) as Draft
    const data = makeMarkData()
    const target = defined(d.party[0])
    const attacker = defined(d.battle.enemies[0])
    recordMarkCrit(data, d, { target, attacker, dealt: toBig(1) })
    expect(d.battle.records.a.marks?.critWounds).toBeUndefined()
    recordMarkCrit(data, d, { target, attacker, partId: 'legs', dealt: toBig(1_000_000) })
    expect(d.battle.records.a.marks?.critWounds).toEqual([
      { partId: 'legs', opponentSpeciesId: 'weakling' }
    ])
    // Quái địch không ghi.
    recordMarkCrit(data, d, { target: attacker, attacker: target, dealt: toBig(1_000_000) })
    expect(d.battle.records.e1?.marks).toBeUndefined()
  })

  it('trận thật: trúng đòn theo hệ, hạ gục địch được ghi; thắng thì tung dấu và save hợp lệ', () => {
    const data = makeMarkData()
    const state = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['strike'] })],
      [makeMonster({ id: 'e1', skillIds: ['blast'], damageTaken: toBig(45) })]
    )
    const after = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
    })
    const marks = defined(after.battle).records.a.marks
    expect(marks?.kills).toEqual([
      { speciesId: 'weakling', raceId: 'neutral', elementIds: ['grass'], boss: false }
    ])
    expect(validateGameState(data, after)).toEqual([])
  })

  it('dữ liệu không có mục dấu: không ghi gì', () => {
    const state = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['strike'] })],
      [makeMonster({ id: 'e1', skillIds: ['idle'], damageTaken: toBig(45) })]
    )
    const after = gameReducer(makeData(), state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
    })
    expect(defined(after.battle).records.a.marks).toBeUndefined()
  })

  it('kiểm tra save của bản ghi dấu trong trận', () => {
    const data = makeMarkData()
    const bad = battleWith({
      marks: {
        hitElements: { nope: 1 },
        fields: ['ghost'],
        critWounds: [{ partId: 'ghost' }],
        kills: [{ raceId: 'ghost', elementIds: [], boss: false }]
      }
    })
    const issues = validateGameState(data, bad).join('\n')
    expect(issues).toContain('hitElements')
    expect(issues).toContain('fields')
    expect(issues).toContain('critWounds[0].partId')
    expect(issues).toContain('kills[0].raceId')
    expect(validateGameState(data, battleWith({ marks: { hitElements: { fire: 2 } } }))).toEqual([])
  })
})

/** State với quái `a` còn đúng `hp` máu. */
function withHpLeft(data: GameData, state: GameState, hp: number): GameState {
  const monster = defined(state.party[0])
  const fresh = { ...monster, damageTaken: toBig(0) }
  // Máu tối đa tính lại từ chính quái (không lưu chỉ số cuối).
  return { ...state, party: [{ ...fresh, damageTaken: getMaxHp(data, fresh).minus(hp) }] }
}

describe('hook theo đối tượng trong trận', () => {
  const data = makeMarkData()
  const dealtWith = (marks: MarkInstance[]): string => {
    const state = makeBattleState(
      [makeMonster({ id: 'a', level: 50, skillIds: ['strike'], marks })],
      [
        makeMonster({
          id: 'e1',
          level: 50,
          skillIds: ['idle'],
          speciesId: 'strongling',
          baseSpeciesId: 'strongling'
        })
      ]
    )
    const after = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'strike' }]
    })
    return defined(after.battle).records.a.damageDealt.toString()
  }

  it('sợ loài X gây ít sát thương lên đúng loài X; vượt qua nỗi sợ thì nhiều hơn', () => {
    const base = Number(dealtWith([]))
    expect(base).toBeGreaterThan(0)
    expect(Number(dealtWith([mark('fearSpecies', { targetId: 'strongling' })]))).toBeLessThan(base)
    expect(Number(dealtWith([mark('fearSpecies', { targetId: 'weakling' })]))).toBe(base)
    expect(Number(dealtWith([mark('conquerSpecies', { targetId: 'strongling' })]))).toBeGreaterThan(
      base
    )
  })
})
