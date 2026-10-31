// Môi trường trong diễn biến trận (mục "Môi trường" ở battle-environment.md): môi trường tự nhiên của biome,
// setField (thay, làm mới, hết hạn, một lần cho cả chiêu), cuối lượt (sát thương / hồi máu, thứ
// tự, boss ½), chặn trạng thái, trait vào sân.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getMaxHp } from '../monster'
import {
  atFloor,
  defined,
  makeBattleState,
  makeEnvironmentData,
  makeEnvironmentRawData,
  makeField,
  makeMonster,
  type MonsterOverrides,
  makeGameState
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleField,
  Biome,
  GameAction,
  GameData,
  GameState,
  Monster
} from '../model'

// Quái mẫu: HP 50, mọi chỉ số 50. Bão (storm): −10% max HP cuối lượt trừ hệ lửa. Địa hình cỏ
// (grassy): hồi 10% cho quái đứng trên đất. calm: chặn ngủ (quái đứng trên đất).
const data = makeEnvironmentData()

const run = (state: GameState, action: GameAction, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, action)

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  run(state, { type: 'submitTurn', commands })

const skill = (slot: number, skillId: string, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})

const idle = (slot = 0): BattleCommand => skill(slot, 'idle')

/** Quái ta hệ ghost, biết skill môi trường và skill đứng im. */
const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    elementIds: ['ghost'],
    skillIds: ['idle', 'rainDance', 'squall', 'hypnosis'],
    ...overrides
  })

/** Quái địch chỉ đứng im, hệ normal. */
const passive = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, elementIds: ['normal'], skillIds: ['idle'], ...overrides })

const battle = (
  party: Monster[],
  enemies: Monster[],
  field: BattleField = makeField(),
  isBoss = false
): GameState => makeBattleState(party, enemies, { field, isBoss })

const fieldOf = (state: GameState): BattleField => defined(state.battle, 'trận').field

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const fighter = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id) ?? state.battle?.enemies.find((m) => m.id === id),
    `quái ${id}`
  )

/** Dữ liệu môi trường với biome tầng 1 (field) được sửa. */
function dataWithBiome(edit: (biome: Biome) => void): GameData {
  const raw = makeEnvironmentRawData()
  edit(raw.biomes[0])
  return createGameData(raw)
}

const startAt = (gameData: GameData, seed = 7, party: Monster[] = [ally('a')]): GameState =>
  run(
    atFloor(makeGameState({ seed, party, nextMonsterId: 10 }), 1),
    { type: 'startWildBattle' },
    gameData
  )

describe('môi trường tự nhiên của biome', () => {
  it('biome bỏ trống: môi trường mặc định cả trận, không tốn RNG, vẫn ghi log', () => {
    const omitted = startAt(data)
    const empty = startAt(dataWithBiome((biome) => ((biome.weather = []), (biome.terrain = []))))
    expect(fieldOf(omitted)).toEqual(makeField())
    expect(empty.rng).toBe(omitted.rng)
    expect(eventsOf(omitted, 'fieldChanged')).toEqual([
      { type: 'fieldChanged', layer: 'weather', fieldId: 'clear', source: 'biome' },
      { type: 'fieldChanged', layer: 'terrain', fieldId: 'none', source: 'biome' }
    ])
  })

  it('tung theo trọng số, giữ cả trận (turnsLeft null); trận boss cũng có', () => {
    const rainy = dataWithBiome((biome) => {
      biome.weather = [{ fieldId: 'rain', weight: 1 }]
      biome.terrain = [{ fieldId: 'grassy', weight: 1 }]
    })
    const started = startAt(rainy)
    expect(fieldOf(started)).toEqual(makeField({ weather: 'rain', terrain: 'grassy' }))
    expect(started.rng).not.toBe(startAt(data).rng)
    const boss = run(
      atFloor(makeGameState({ seed: 7, party: [ally('a')], nextMonsterId: 10 }), 1),
      { type: 'challengeBoss' },
      rainy
    )
    expect(fieldOf(boss).weather).toEqual({ id: 'rain', turnsLeft: null })
  })

  it('trọng số quyết định tần suất, mọi môi trường có trọng số đều ra được', () => {
    const mixed = dataWithBiome((biome) => {
      biome.weather = [
        { fieldId: 'clear', weight: 1 },
        { fieldId: 'rain', weight: 3 }
      ]
    })
    let rain = 0
    for (let seed = 0; seed < 200; seed++) {
      if (fieldOf(startAt(mixed, seed)).weather.id === 'rain') rain++
    }
    expect(rain).toBeGreaterThan(120)
    expect(rain).toBeLessThan(180)
  })

  it('trọng số thời tiết nhân hệ số theo mùa của giờ game (docs/rules/calendar.md)', () => {
    const raw = makeEnvironmentRawData()
    raw.biomes[0].weather = [
      { fieldId: 'clear', weight: 1 },
      { fieldId: 'rain', weight: 1 }
    ]
    raw.config.calendar.seasonWeatherMultipliers.winter = { rain: 1000 }
    const seasonal = createGameData(raw)
    // 10 ngày một năm: ngày 8 là mùa đông, ngày 0 là mùa xuân (không có hệ số).
    const rainyCount = (day: number): number => {
      let rain = 0
      for (let seed = 0; seed < 100; seed++) {
        const state = atFloor(makeGameState({ seed, party: [ally('a')], nextMonsterId: 10 }), 1)
        const started = run(
          { ...state, time: day * 24 + 12 },
          { type: 'startWildBattle' },
          seasonal
        )
        if (fieldOf(started).weather.id === 'rain') rain++
      }
      return rain
    }
    expect(rainyCount(8)).toBeGreaterThanOrEqual(98)
    expect(rainyCount(0)).toBeGreaterThan(30)
    expect(rainyCount(0)).toBeLessThan(70)
  })
})

describe('đấu trường boss (bossField)', () => {
  const natural = (biome: Biome): void => {
    biome.weather = [
      { fieldId: 'clear', weight: 1 },
      { fieldId: 'fog', weight: 1 }
    ]
    biome.terrain = [
      { fieldId: 'none', weight: 1 },
      { fieldId: 'calm', weight: 1 }
    ]
  }
  const challenge = (gameData: GameData, seed = 7): GameState =>
    run(
      atFloor(makeGameState({ seed, party: [ally('a')], nextMonsterId: 10 }), 1),
      { type: 'challengeBoss' },
      gameData
    )

  it('cố định cả hai lớp: không tốn RNG, log nguồn biome', () => {
    const arena = dataWithBiome((biome) => {
      natural(biome)
      biome.bosses[0].bossField = { weather: 'storm', terrain: 'misty' }
    })
    const started = challenge(arena)
    expect(fieldOf(started)).toEqual(makeField({ weather: 'storm', terrain: 'misty' }))
    // Cùng RNG với biome không có môi trường tự nhiên (không tung lớp nào).
    expect(started.rng).toBe(challenge(data).rng)
    expect(eventsOf(started, 'fieldChanged')).toEqual([
      { type: 'fieldChanged', layer: 'weather', fieldId: 'storm', source: 'biome' },
      { type: 'fieldChanged', layer: 'terrain', fieldId: 'misty', source: 'biome' }
    ])
  })

  it('chỉ ghi một lớp: lớp đó cố định, lớp kia vẫn tung theo trọng số', () => {
    const weatherOnly = dataWithBiome((biome) => {
      natural(biome)
      biome.bosses[0].bossField = { weather: 'rain' }
    })
    const terrains = new Set<string>()
    for (let seed = 0; seed < 40; seed++) {
      const field = fieldOf(challenge(weatherOnly, seed))
      expect(field.weather.id).toBe('rain')
      terrains.add(field.terrain.id)
    }
    expect([...terrains].sort()).toEqual(['calm', 'none'])
  })

  it('trận quái hoang thường không dùng đấu trường của boss', () => {
    const arena = dataWithBiome((biome) => {
      biome.bosses[0].bossField = { weather: 'storm' }
    })
    expect(fieldOf(startAt(arena)).weather.id).toBe('clear')
  })

  it('kiểm tra dữ liệu: lớp lạ, môi trường sai lớp / không tồn tại, không phải object', () => {
    const issuesWith = (bossField: unknown): string => {
      const raw = makeEnvironmentRawData()
      // Ép kiểu: dữ liệu JSON sai dạng để kiểm tra lỗi.
      raw.biomes[0].bosses[0].bossField = bossField as Biome['bosses'][number]['bossField']
      try {
        createGameData(raw)
        return ''
      } catch (error) {
        return String(error)
      }
    }
    expect(issuesWith({ weather: 'storm', terrain: 'calm' })).toBe('')
    expect(issuesWith({ side: 'storm' })).toMatch(/bossField: lớp lạ "side"/)
    expect(issuesWith({ weather: 'calm' })).toMatch(/không thuộc lớp weather/)
    expect(issuesWith({ terrain: 'ghost' })).toMatch(/ghost/)
    expect(issuesWith('rain')).toMatch(/bossField phải là object/)
  })
})

describe('hiệu ứng skill setField', () => {
  it('đặt môi trường theo duration, giảm thời hạn cuối mỗi lượt kể cả lượt vừa đặt', () => {
    const after = turn(battle([ally('a')], [passive('e1')]), skill(0, 'rainDance'))
    expect(fieldOf(after).weather).toEqual({ id: 'rain', turnsLeft: 4 })
    expect(eventsOf(after, 'fieldChanged')).toEqual([
      { type: 'fieldChanged', layer: 'weather', fieldId: 'rain', source: 'skill', monsterId: 'a' }
    ])
  })

  it('hết hạn thì về môi trường mặc định (không quay lại môi trường tự nhiên), log fieldEnded', () => {
    // Mưa tự nhiên cả trận bị bão 2 lượt thay.
    let state = turn(
      battle([ally('a')], [passive('e1')], makeField({ weather: 'rain' })),
      skill(0, 'squall')
    )
    expect(fieldOf(state).weather).toEqual({ id: 'storm', turnsLeft: 1 })
    state = turn(state, idle())
    expect(fieldOf(state).weather).toEqual({ id: 'clear', turnsLeft: null })
    expect(eventsOf(state, 'fieldEnded')).toEqual([
      { type: 'fieldEnded', layer: 'weather', fieldId: 'storm' }
    ])
  })

  it('đặt lại môi trường đang có: lấy thời hạn dài hơn; môi trường cả trận giữ cả trận', () => {
    const short = turn(
      battle([ally('a')], [passive('e1')], makeField({ weather: 'rain' }, 2)),
      skill(0, 'rainDance')
    )
    expect(fieldOf(short).weather).toEqual({ id: 'rain', turnsLeft: 4 })
    const natural = turn(
      battle([ally('a')], [passive('e1')], makeField({ weather: 'rain' })),
      skill(0, 'rainDance')
    )
    expect(fieldOf(natural).weather).toEqual({ id: 'rain', turnsLeft: null })
  })

  it('skill đánh cả hai địch chỉ đặt môi trường một lần (timing perSkill)', () => {
    const after = turn(battle([ally('a')], [passive('e1'), passive('e2')]), skill(0, 'squall'))
    expect(eventsOf(after, 'damage')).toHaveLength(2)
    expect(eventsOf(after, 'fieldChanged')).toHaveLength(1)
  })

  it('đặt địa hình thay địa hình đang có, lớp thời tiết không đổi', () => {
    const state = battle(
      [ally('a', { skillIds: ['calmField'] })],
      [passive('e1')],
      makeField({ weather: 'rain', terrain: 'grassy' })
    )
    const after = turn(state, skill(0, 'calmField'))
    expect(fieldOf(after)).toEqual({
      weather: { id: 'rain', turnsLeft: null },
      terrain: { id: 'calm', turnsLeft: 2 },
      sides: { player: [], enemy: [] },
      rooms: []
    })
  })
})

describe('cuối lượt', () => {
  it('sát thương môi trường % max HP cho mọi quái trên sân, trừ hệ miễn và trait miễn', () => {
    const state = battle(
      [ally('a'), ally('b', { traits: [{ id: 'coat', level: 1 }] })],
      [passive('e1'), passive('e2', { elementIds: ['fire'] })],
      makeField({ weather: 'storm' })
    )
    const after = turn(state, idle(0), idle(1))
    expect(eventsOf(after, 'fieldDamage').map((e) => [e.monsterId, e.amount.toNumber()])).toEqual([
      ['a', 5],
      ['e1', 5]
    ])
    expect(fighter(after, 'b').damageTaken.toNumber()).toBe(0)
    expect(fighter(after, 'e2').damageTaken.toNumber()).toBe(0)
  })

  it('boss hoang nhận ½ (làm tròn lên), tối thiểu 1; gục thì mất trạng thái', () => {
    const boss = turn(
      battle([ally('a')], [passive('e1')], makeField({ weather: 'storm' }), true),
      idle()
    )
    expect(fighter(boss, 'e1').damageTaken.toNumber()).toBe(3) // 2,5 → 3

    const weak = passive('e1', {
      damageTaken: 49,
      statuses: [{ statusId: 'poison', turnsLeft: 2 }]
    })
    const ended = turn(
      battle([ally('a')], [weak, passive('e2')], makeField({ weather: 'storm' })),
      idle()
    )
    expect(eventsOf(ended, 'fieldDamage')[1]).toMatchObject({ monsterId: 'e1' })
    expect(eventsOf(ended, 'faint')).toEqual([{ type: 'faint', monsterId: 'e1' }])
    expect(fighter(ended, 'e1').statuses).toEqual([])
    // Gục vì môi trường thì không chịu thêm sát thương trạng thái.
    expect(eventsOf(ended, 'statusDamage').some((e) => e.monsterId === 'e1')).toBe(false)
  })

  it('địa hình cỏ hồi máu quái đứng trên đất (dùng hàm hồi máu chung, log heal)', () => {
    const state = battle(
      [ally('a', { damageTaken: 20 }), ally('b', { damageTaken: 20, elementIds: ['flying'] })],
      [passive('e1')],
      makeField({ terrain: 'grassy' })
    )
    const after = turn(state, idle(0), idle(1))
    expect(fighter(after, 'a').damageTaken.toNumber()).toBe(15)
    expect(fighter(after, 'b').damageTaken.toNumber()).toBe(20)
  })

  it('thứ tự: trait cuối lượt → môi trường → trạng thái bất thường', () => {
    const a = ally('a', {
      damageTaken: 10,
      traits: [{ id: 'regen', level: 1 }],
      statuses: [{ statusId: 'poison', turnsLeft: 3 }]
    })
    const after = turn(battle([a], [passive('e1')], makeField({ weather: 'storm' })), idle())
    const order = (after.battle?.log ?? []).flatMap((event) =>
      (event.type === 'heal' || event.type === 'fieldDamage' || event.type === 'statusDamage') &&
      event.monsterId === 'a'
        ? [event.type]
        : []
    )
    expect(order).toEqual(['heal', 'fieldDamage', 'statusDamage'])
  })

  it('trait hồi máu theo thời tiết chỉ khi đúng thời tiết', () => {
    const dish = ally('a', { damageTaken: 20, traits: [{ id: 'rainDish', level: 1 }] })
    const rainy = turn(battle([dish], [passive('e1')], makeField({ weather: 'rain' })), idle())
    expect(fighter(rainy, 'a').damageTaken.toNumber()).toBe(15)
    const clear = turn(battle([dish], [passive('e1')]), idle())
    expect(fighter(clear, 'a').damageTaken.toNumber()).toBe(20)
  })

  it('số cực lớn: sát thương môi trường đúng % max HP, không ra Infinity / NaN', () => {
    const huge = ally('a', {
      genes: { hp: 1e300, attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 }
    })
    const after = turn(battle([huge], [passive('e1')], makeField({ weather: 'storm' })), idle())
    const [event] = eventsOf(after, 'fieldDamage')
    expect(event.amount.isFinite()).toBe(true)
    expect(event.amount.eq(getMaxHp(data, huge).div(10).ceil())).toBe(true)
  })
})

describe('môi trường chặn trạng thái (blockStatus)', () => {
  it('chặn trên quái đứng trên đất, log statusBlockedByField; quái hệ Bay vẫn dính', () => {
    const calm = makeField({ terrain: 'calm' })
    const blocked = turn(battle([ally('a')], [passive('e1')], calm), skill(0, 'hypnosis'))
    expect(eventsOf(blocked, 'statusBlockedByField')).toEqual([
      { type: 'statusBlockedByField', monsterId: 'e1', statusId: 'sleep', fieldId: 'calm' }
    ])
    expect(fighter(blocked, 'e1').statuses).toEqual([])
    const flying = passive('e1', { elementIds: ['normal', 'flying'] })
    const slept = turn(battle([ally('a')], [flying], calm), skill(0, 'hypnosis'))
    expect(fighter(slept, 'e1').statuses.map((s) => s.statusId)).toEqual(['sleep'])
  })

  it('miễn nhiễm xét trước môi trường', () => {
    const misty = makeField({ terrain: 'misty' })
    const toxin = ally('a', { skillIds: ['toxin'] })
    const grass = turn(
      battle([toxin], [passive('e1', { elementIds: ['grass'] })], misty),
      skill(0, 'toxin')
    )
    expect(eventsOf(grass, 'statusImmune')).toHaveLength(1)
    expect(eventsOf(grass, 'statusBlockedByField')).toEqual([])
    const normal = turn(battle([toxin], [passive('e1')], misty), skill(0, 'toxin'))
    expect(eventsOf(normal, 'statusBlockedByField')).toHaveLength(1)
  })
})

describe('trait đặt môi trường khi vào sân (setFieldOnEntry)', () => {
  const caller = (id: string, traitId: string, overrides: MonsterOverrides = {}): Monster =>
    ally(id, { traits: [{ id: traitId, level: 1 }], ...overrides })

  it('vào trận: đặt sau môi trường tự nhiên, log nguồn trait', () => {
    const started = startAt(data, 7, [caller('a', 'rainCaller')])
    expect(fieldOf(started).weather).toEqual({ id: 'rain', turnsLeft: 5 })
    expect(eventsOf(started, 'fieldChanged').map((e) => e.source)).toEqual([
      'biome',
      'biome',
      'trait'
    ])
  })

  it('nhiều quái cùng vào sân: tốc độ cao đặt trước, môi trường của quái chậm hơn thắng', () => {
    const fastStorm = startAt(data, 7, [
      caller('a', 'stormCaller'),
      caller('b', 'rainCaller', {
        traits: [
          { id: 'rainCaller', level: 1 },
          { id: 'slow', level: 1 }
        ]
      })
    ])
    expect(fieldOf(fastStorm).weather.id).toBe('rain')
    const fastRain = startAt(data, 7, [
      caller('a', 'rainCaller'),
      caller('b', 'stormCaller', {
        traits: [
          { id: 'stormCaller', level: 1 },
          { id: 'slow', level: 1 }
        ]
      })
    ])
    expect(fieldOf(fastRain).weather).toEqual({ id: 'storm', turnsLeft: 3 })
  })

  it('môi trường tự nhiên cả trận không bị rút ngắn', () => {
    const rainy = dataWithBiome((biome) => (biome.weather = [{ fieldId: 'rain', weight: 1 }]))
    const started = startAt(rainy, 7, [caller('a', 'rainCaller')])
    expect(fieldOf(started).weather).toEqual({ id: 'rain', turnsLeft: null })
  })

  it('đổi quái và thay quái gục giữa trận cũng kích hoạt', () => {
    const party = [ally('a'), ally('b'), caller('c', 'rainCaller')]
    const switched = turn(
      battle(party, [passive('e1')]),
      { slot: 0, kind: 'switch', monsterId: 'c' },
      idle(1)
    )
    expect(fieldOf(switched).weather).toEqual({ id: 'rain', turnsLeft: 4 })

    const fainted = [ally('a', { damageTaken: 50 }), ally('b'), caller('c', 'rainCaller')]
    const waiting = {
      ...battle(fainted, [passive('e1')]),
      battle: {
        ...defined(battle(fainted, [passive('e1')]).battle, 'trận'),
        phase: 'chooseReplacement' as const
      }
    }
    const replaced = run(waiting, {
      type: 'replaceFainted',
      replacements: [{ slot: 0, monsterId: 'c' }]
    })
    expect(fieldOf(replaced).weather).toEqual({ id: 'rain', turnsLeft: 5 })
  })
})
