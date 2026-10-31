// Quái lớn trong trận (docs/rules/monster-size.md): chiếm cả 2 ô, hành động 2 lần, đánh lan trúng
// một lần, vào / ra sân, thay quái gục, quái hoang lớn đi một mình, đội theo ô.

import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { createGameData } from '../gameData'
import { gameReducer, validateGameState } from '../game'
import { levelEvolutionOptions } from '../progression'
import { getMaxHp } from '../monster'
import { generateEncounter, generateTrainerTeam } from '../world'
import {
  atFloor,
  defined,
  expectActionError,
  FIXTURE_GYM_LEADER_ID,
  fixtureSite,
  makeBattleState,
  makeGameState,
  makeMonster,
  makeRawData
} from '../testing'
import type { EvolutionScene } from '../registries'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameAction,
  GameData,
  GameState,
  Monster
} from '../model'

type RawData = ReturnType<typeof makeRawData>

/** oak là quái lớn (5000 kg); mọi biome chỉ gặp oak nếu `wildOak`. */
function sizeData({ wildOak = false } = {}): GameData {
  const raw: RawData = makeRawData()
  for (const species of raw.species) {
    if (species.kind === 'normal' && species.id === 'oak') species.weightKg = 5000
  }
  if (wildOak) {
    for (const biome of raw.biomes) {
      biome.encounters = [{ speciesId: 'oak', weight: 1 }]
      biome.doubleChance = 100
    }
  }
  return createGameData(raw)
}

const data = sizeData()
const run = (state: GameState, action: GameAction, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, action)
const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  run(state, { type: 'submitTurn', commands })

const skills = ['strike', 'wave', 'idle']
const big = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, speciesId: 'oak', baseSpeciesId: 'oak', skillIds: skills, ...overrides })
const small = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: skills, ...overrides })
const idleFoe = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], ...overrides })

const skillCommand = (slot: number, skillId: string, target?: number): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})
const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)
const battleOf = (state: GameState): BattleState => defined(state.battle)

/** Trận với ô sân ghi rõ (quái lớn ở mọi ô của nó). */
function sized(
  party: Monster[],
  enemies: Monster[],
  slots: { player: (string | null)[]; enemy: (string | null)[] }
): GameState {
  const state = makeBattleState(party, enemies)
  const onField = [...new Set([...slots.player, ...slots.enemy])].filter(
    (id): id is string => id !== null
  )
  return {
    ...state,
    battle: {
      ...battleOf(state),
      playerSlots: slots.player,
      enemySlots: slots.enemy,
      participants: [...new Set(slots.player)].filter((id): id is string => id !== null),
      volatiles: Object.fromEntries(onField.map((id) => [id, { firstTurn: 1 }]))
    }
  }
}

describe('mở trận', () => {
  it('quái lớn đầu đội chiếm cả hai ô; quái lớn không đủ ô thì quái sau ra thay', () => {
    const start = (party: Monster[]): (string | null)[] =>
      battleOf(run(atFloor(makeGameState({ seed: 3, party }), 1), { type: 'startWildBattle' }))
        .playerSlots
    expect(start([big('L'), small('a')])).toEqual(['L', 'L'])
    expect(start([small('a'), big('L'), small('b')])).toEqual(['a', 'b'])
    expect(start([small('a'), big('L')])).toEqual(['a', null])
  })

  it('quái hoang lớn luôn xuất hiện một mình (kể cả map luôn gặp 2 quái)', () => {
    const wild = sizeData({ wildOak: true })
    const state = atFloor(makeGameState({ seed: 5, party: [small('a')] }), 1)
    const battle = battleOf(run(state, { type: 'startWildBattle' }, wild))
    expect(battle.enemies).toHaveLength(1)
    expect(battle.enemySlots).toEqual([battle.enemies[0].id, battle.enemies[0].id])
    const encounter = generateEncounter(wild, state.rng, fixtureSite(wild, 1), 50)
    expect(encounter.enemies).toHaveLength(1)
  })
})

describe('một lệnh mỗi lượt, sát thương × damageMultiplier', () => {
  const state = sized([big('L'), small('a')], [idleFoe('e1'), idleFoe('e2')], {
    player: ['L', 'L'],
    enemy: ['e1', 'e2']
  })

  it('quái lớn chỉ ra một lệnh ở ô đầu; lệnh ở ô thứ hai là lỗi, state giữ nguyên', () => {
    const next = turn(state, skillCommand(0, 'strike', 1))
    expect(eventsOf(next, 'useSkill').filter((e) => e.monsterId === 'L')).toHaveLength(1)
    expect(battleOf(next).records.L.turnsTaken).toBe(1)
    expectActionError(
      () => turn(state, skillCommand(0, 'strike'), skillCommand(1, 'strike')),
      'malformedAction'
    )
    expectActionError(() => turn(state, skillCommand(1, 'strike')), 'malformedAction')
    expect(battleOf(state).turn).toBe(1)
  })

  it('sát thương skill của quái lớn × damageMultiplier (cùng seed, cùng chỉ số)', () => {
    const plainData = (() => {
      const raw = makeRawData()
      raw.config.size.largeWeightKg = 1e9
      return createGameData(raw)
    })()
    const dealt = (gameData: GameData): number =>
      defined(
        eventsOf(
          run(state, { type: 'submitTurn', commands: [skillCommand(0, 'strike', 0)] }, gameData),
          'damage'
        )[0]
      ).amount.toNumber()
    const large = dealt(data)
    const plain = dealt(plainData)
    expect(large).toBeGreaterThanOrEqual(plain * data.config.size.damageMultiplier - 1)
    expect(large).toBeLessThanOrEqual(plain * data.config.size.damageMultiplier + 1)
  })

  it('boss lớn của địch cũng chỉ hành động một lần', () => {
    const boss = big('B', { skillIds: ['strike'] })
    const bossFight = sized([small('a'), small('b')], [boss], {
      player: ['a', 'b'],
      enemy: ['B', 'B']
    })
    const withBoss = { ...bossFight, battle: { ...battleOf(bossFight), isBoss: true } }
    const next = turn(withBoss, skillCommand(0, 'idle'), skillCommand(1, 'idle'))
    expect(eventsOf(next, 'useSkill').filter((e) => e.monsterId === 'B')).toHaveLength(1)
  })

  it('skill đánh lan trúng quái lớn một lần', () => {
    const fight = sized([small('a')], [idleFoe('E', { speciesId: 'oak', baseSpeciesId: 'oak' })], {
      player: ['a', null],
      enemy: ['E', 'E']
    })
    const next = turn(fight, skillCommand(0, 'wave'))
    expect(eventsOf(next, 'damage').filter((e) => e.targetId === 'E')).toHaveLength(1)
  })
})

describe('vào / ra sân', () => {
  const party = [small('a'), small('b'), big('L'), small('c')]
  const pair = sized(party, [idleFoe('e1')], { player: ['a', 'b'], enemy: ['e1', null] })

  it('đổi sang quái lớn cần cả hai ô cùng rút', () => {
    expectActionError(
      () => turn(pair, { slot: 0, kind: 'switch', monsterId: 'L' }, skillCommand(1, 'idle')),
      'largeNeedsAllSlots',
      { monsterId: 'L' }
    )
    const next = turn(
      pair,
      { slot: 0, kind: 'switch', monsterId: 'L' },
      { slot: 1, kind: 'switch', monsterId: 'L' }
    )
    expect(battleOf(next).playerSlots).toEqual(['L', 'L'])
    expect(battleOf(next).volatiles.a).toBeUndefined()
    expect(battleOf(next).volatiles.b).toBeUndefined()
    expect(eventsOf(next, 'enter').filter((e) => e.monsterId === 'L')).toHaveLength(1)
  })

  it('ô còn lại trống thì một lệnh đổi là đủ', () => {
    const alone = sized(party, [idleFoe('e1')], { player: ['a', null], enemy: ['e1', null] })
    const next = turn(alone, { slot: 0, kind: 'switch', monsterId: 'L' })
    expect(battleOf(next).playerSlots).toEqual(['L', 'L'])
  })

  it('quái lớn rút về: quái vào ô đầu, ô còn lại trống và được thay ngay sau lượt', () => {
    const large = sized(party, [idleFoe('e1')], { player: ['L', 'L'], enemy: ['e1', null] })
    const next = turn(large, { slot: 0, kind: 'switch', monsterId: 'a' })
    expect(battleOf(next).playerSlots).toEqual(['a', null])
    expect(battleOf(next).phase).toBe('chooseReplacement')
    const filled = run(next, {
      type: 'replaceFainted',
      replacements: [{ slot: 1, monsterId: 'b' }]
    })
    expect(battleOf(filled).playerSlots).toEqual(['a', 'b'])
  })
})

describe('thay quái gục', () => {
  /** Quái còn đúng 1 máu (gục vì đòn đánh lan của địch). */
  const dying = (monster: Monster): Monster => ({
    ...monster,
    damageTaken: getMaxHp(data, monster).minus(1)
  })
  const spreader = (): Monster => makeMonster({ id: 'e1', skillIds: ['wave'] })

  it('quái lớn gục: thay 2 quái thường hoặc 1 quái lớn, phải thay hết mức có thể', () => {
    const party = [dying(big('L')), small('a'), small('b'), big('M')]
    const state = sized(party, [spreader()], { player: ['L', 'L'], enemy: ['e1', null] })
    const fainted = turn(state, skillCommand(0, 'idle'))
    expect(battleOf(fainted).phase).toBe('chooseReplacement')
    const replace = (replacements: { slot: number; monsterId: string }[]): GameState =>
      run(fainted, { type: 'replaceFainted', replacements })
    expect(battleOf(replace([{ slot: 0, monsterId: 'M' }])).playerSlots).toEqual(['M', 'M'])
    const two = replace([
      { slot: 0, monsterId: 'a' },
      { slot: 1, monsterId: 'b' }
    ])
    expect(battleOf(two).playerSlots).toEqual(['a', 'b'])
    expectActionError(() => replace([{ slot: 0, monsterId: 'a' }]), 'replacementIncomplete', {
      slot: 1
    })
    expectActionError(
      () =>
        replace([
          { slot: 0, monsterId: 'a' },
          { slot: 1, monsterId: 'M' }
        ]),
      'largeNeedsAllSlots',
      { monsterId: 'M' }
    )
  })

  it('một ô gục, chỉ còn quái lớn dự bị: không thay được, ô để trống', () => {
    const party = [dying(small('a')), small('b', { level: 50 }), big('M')]
    const state = sized(party, [spreader()], { player: ['a', 'b'], enemy: ['e1', null] })
    const next = turn(state, skillCommand(0, 'idle'), skillCommand(1, 'idle'))
    expect(battleOf(next).phase).toBe('chooseActions')
    expect(battleOf(next).playerSlots).toEqual([null, 'b'])
  })
})

describe('đội theo ô', () => {
  it('đội NPC: teamSize tính theo ô; quái lớn không đủ ô thì đội dừng', () => {
    const allLarge = (() => {
      const raw = makeRawData()
      for (const species of raw.species) {
        if (species.kind === 'normal') species.weightKg = 5000
      }
      return createGameData(raw)
    })()
    const team = generateTrainerTeam(allLarge, 7, {
      site: fixtureSite(allLarge, 3),
      trainerClass: allLarge.trainers[FIXTURE_GYM_LEADER_ID],
      extraLevels: 0,
      realm: 0,
      nextMonsterId: 10,
      nextItemId: 1
    })
    // teamSize 3 ô: một quái lớn (2 ô), quái lớn thứ hai không vừa 1 ô còn lại.
    expect(team.enemies).toHaveLength(1)
  })

  it('moveToParty / swapWithStorage: quái lớn cần đủ ô', () => {
    const party = [small('a'), small('b'), small('c'), small('d'), small('e')]
    const state = { ...makeGameState({ seed: 1, party }), storage: [big('L'), small('f')] }
    expectActionError(() => run(state, { type: 'moveToParty', monsterId: 'L' }), 'partyFull')
    expect(run(state, { type: 'moveToParty', monsterId: 'f' }).party).toHaveLength(6)
    const swapped = run(state, {
      type: 'swapWithStorage',
      partyMonsterId: 'a',
      storageMonsterId: 'L'
    })
    expect(swapped.party.map((m) => m.id)).toEqual(['L', 'b', 'c', 'd', 'e'])
    const full = { ...state, party: [...party, small('g')] }
    expectActionError(
      () => run(full, { type: 'swapWithStorage', partyMonsterId: 'a', storageMonsterId: 'L' }),
      'partyFull'
    )
  })

  it('tiến hóa thành quái lớn cần đội còn đủ ô (quái trong kho thì không cần)', () => {
    const evolveData = (() => {
      const raw = makeRawData()
      for (const species of raw.species) {
        if (species.kind === 'normal' && species.id === 'strongling') species.weightKg = 5000
      }
      return createGameData(raw)
    })()
    const ready = small('w', { level: 10 })
    const scene = (party: Monster[]): EvolutionScene => ({
      party,
      place: null,
      aptitudeFloor: 1,
      time: 0
    })
    const five = [ready, small('b'), small('c'), small('d'), small('e')]
    expect(levelEvolutionOptions(evolveData, ready, scene(five))).toEqual(['strongling'])
    const six = [...five, small('f')]
    expect(levelEvolutionOptions(evolveData, ready, scene(six))).toEqual([])
    expect(levelEvolutionOptions(evolveData, ready, scene(six.slice(1)))).toEqual(['strongling'])
  })

  it('save: quái lớn phải chiếm mọi ô sân; đội quá số ô báo lỗi', () => {
    const state = sized([big('L'), small('a')], [idleFoe('e1')], {
      player: ['L', null],
      enemy: ['e1', null]
    })
    expect(validateGameState(data, state).join()).toMatch(
      /quái "L" lớn \/ hợp thể phải chiếm mọi ô sân/
    )
    const ok = sized([big('L'), small('a')], [idleFoe('e1')], {
      player: ['L', 'L'],
      enemy: ['e1', null]
    })
    expect(validateGameState(data, ok)).toEqual([])
    const crowded = makeGameState({
      seed: 1,
      party: [big('L1'), big('L2'), big('L3'), small('a')]
    })
    expect(validateGameState(data, crowded).join()).toMatch(/chiếm tối đa 6 ô/)
  })
})
