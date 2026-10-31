// Hiệu ứng theo phe (mục "Môi trường" ở battle-environment.md): đặt / cộng tầng / quá tầng / môi trường yêu
// cầu, hết hạn, Tailwind, Mist, Safeguard, bẫy khi vào sân giữa trận (Spikes, Stealth Rock, Toxic
// Spikes, Sticky Web), thay quái gục vì bẫy, màn chắn (Reflect, chí mạng bỏ qua), AI.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { computeStats } from '../monster'
import { SKILL_EFFECTS, type SkillEffectAiContext } from '../registries'
import { BIG_ZERO, createRng } from '../shared'
import {
  atFloor,
  defined,
  makeArena,
  makeBattleState,
  makeField,
  makeMonster,
  makeSideFieldData,
  makeSideFieldRawData,
  uniformStats,
  type MonsterOverrides,
  makeGameState
} from '../testing'
import type {
  ActiveSideField,
  BattleCommand,
  BattleEvent,
  BattleField,
  GameAction,
  GameData,
  GameState,
  Monster
} from '../model'
import { computeDamage, expectedDamage } from './damage'

// Quái mẫu: HP 50, mọi chỉ số 50, hệ cỏ. strike: vật lý thường 50 → 7,5 sát thương (không STAB).
const data = makeSideFieldData()

const run = (state: GameState, action: GameAction, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, action)

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  run(state, { type: 'submitTurn', commands })

const skillCommand = (slot: number, skillId: string, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})

const idle = (slot = 0): BattleCommand => skillCommand(slot, 'idle')

const switchTo = (slot: number, monsterId: string): BattleCommand => ({
  slot,
  kind: 'switch',
  monsterId
})

/** Quái ta hệ ma (không miễn độc, đứng trên đất), biết các skill đặt hiệu ứng theo phe. */
const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    elementIds: ['ghost'],
    skillIds: ['idle', 'reflectMove', 'spikesMove', 'veilMove'],
    ...overrides
  })

const enemy = (
  id: string,
  skillIds: string[] = ['idle'],
  overrides: MonsterOverrides = {}
): Monster => makeMonster({ id, elementIds: ['normal'], skillIds, ...overrides })

const sideEntry = (id: string, layers = 1, turnsLeft: number | null = null): ActiveSideField => ({
  id,
  turnsLeft,
  layers
})

const battle = (
  party: Monster[],
  enemies: Monster[],
  field: BattleField = makeField()
): GameState => makeBattleState(party, enemies, { field })

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

/** Trận đang chờ thay quái gục ở ô 0. */
function waitingReplacement(party: Monster[], field: BattleField): GameState {
  const state = battle(party, [enemy('e1')], field)
  return { ...state, battle: { ...defined(state.battle, 'trận'), phase: 'chooseReplacement' } }
}

describe('setSideField: đặt, cộng tầng, làm mới', () => {
  it('đặt cho phe mình: thời hạn theo duration, giảm cuối lượt; log phe và số lượt khi đặt', () => {
    const after = turn(battle([ally('a')], [enemy('e1')]), skillCommand(0, 'reflectMove'))
    expect(fieldOf(after).sides).toEqual({ player: [sideEntry('reflect', 1, 4)], enemy: [] })
    expect(eventsOf(after, 'sideFieldSet')).toEqual([
      {
        type: 'sideFieldSet',
        side: 'player',
        fieldId: 'reflect',
        layers: 1,
        turnsLeft: 5,
        monsterId: 'a'
      }
    ])
  })

  it('đặt lại hiệu ứng không cộng tầng: làm mới, lấy thời hạn dài hơn', () => {
    const field = makeField({ sides: { player: [sideEntry('reflect', 1, 2)] } })
    const after = turn(battle([ally('a')], [enemy('e1')], field), skillCommand(0, 'reflectMove'))
    expect(fieldOf(after).sides.player).toEqual([sideEntry('reflect', 1, 4)])
  })

  it('bẫy đặt lên phe địch, cả trận, cộng tầng tới tối đa; quá tầng thì thất bại', () => {
    let state = battle([ally('a')], [enemy('e1')])
    for (let i = 0; i < 3; i++) state = turn(state, skillCommand(0, 'spikesMove'))
    expect(fieldOf(state).sides.enemy).toEqual([sideEntry('spikes', 3)])
    const fourth = turn(state, skillCommand(0, 'spikesMove'))
    expect(fieldOf(fourth).sides.enemy).toEqual([sideEntry('spikes', 3)])
    expect(eventsOf(fourth, 'sideFieldFailed')).toEqual([
      {
        type: 'sideFieldFailed',
        side: 'enemy',
        fieldId: 'spikes',
        monsterId: 'a',
        reason: 'maxLayers'
      }
    ])
  })

  it('cần môi trường yêu cầu (kiểu Aurora Veil cần tuyết)', () => {
    const plain = turn(battle([ally('a')], [enemy('e1')]), skillCommand(0, 'veilMove'))
    expect(fieldOf(plain).sides.player).toEqual([])
    expect(eventsOf(plain, 'sideFieldFailed')[0]?.reason).toBe('requiresField')
    const stormy = battle([ally('a')], [enemy('e1')], makeField({ weather: 'storm' }))
    expect(fieldOf(turn(stormy, skillCommand(0, 'veilMove'))).sides.player).toEqual([
      sideEntry('veil', 1, 4)
    ])
  })

  it('hết hạn: mất khỏi phe, log sideFieldEnded; bẫy cả trận không hết', () => {
    const field = makeField({
      sides: { player: [sideEntry('tailwind', 1, 2)], enemy: [sideEntry('spikes', 1)] }
    })
    const once = turn(battle([ally('a')], [enemy('e1')], field), idle())
    expect(fieldOf(once).sides.player).toEqual([sideEntry('tailwind', 1, 1)])
    const twice = turn(once, idle())
    expect(fieldOf(twice).sides).toEqual({ player: [], enemy: [sideEntry('spikes', 1)] })
    expect(eventsOf(twice, 'sideFieldEnded')).toEqual([
      { type: 'sideFieldEnded', side: 'player', fieldId: 'tailwind' }
    ])
  })

  it('vào trận chưa có hiệu ứng theo phe nào (bẫy không kích hoạt lúc mở trận)', () => {
    const state = run(
      atFloor(makeGameState({ seed: 3, party: [ally('a')], nextMonsterId: 10 }), 1),
      { type: 'startWildBattle' }
    )
    expect(fieldOf(state).sides).toEqual({ player: [], enemy: [] })
  })
})

describe('Tailwind, Mist, Safeguard', () => {
  it('Tailwind nhân tốc độ của phe đó: đổi thứ tự lượt', () => {
    const fast = enemy('e1', ['idle'], { genes: { ...uniformStats(10), speed: 20 } })
    const order = (field: BattleField): string[] =>
      eventsOf(turn(battle([ally('a')], [fast], field), idle()), 'useSkill').map((e) => e.monsterId)
    expect(order(makeField())).toEqual(['e1', 'a'])
    expect(order(makeField({ sides: { player: [sideEntry('tailwind', 1, 3)] } }))).toEqual([
      'a',
      'e1'
    ])
    const field = makeField({ sides: { player: [sideEntry('tailwind', 1, 3)] } })
    const speed = (side: 'player' | 'enemy'): number =>
      computeStats(data, ally('a'), { field, side }).final.speed.toNumber()
    expect([speed('player'), speed('enemy')]).toEqual([100, 50])
  })

  it('Mist chặn quái khác hạ bậc, không chặn quái tự hạ bậc', () => {
    const field = makeField({ sides: { player: [sideEntry('mist', 1, 5)] } })
    const party = [ally('a', { skillIds: ['selfDrop'] }), ally('b')]
    const after = turn(
      battle(party, [enemy('e1', ['growl'])], field),
      skillCommand(0, 'selfDrop'),
      idle(1)
    )
    expect(eventsOf(after, 'stageBlockedByField')).toEqual([
      { type: 'stageBlockedByField', monsterId: 'a', stat: 'attack', fieldId: 'mist' },
      { type: 'stageBlockedByField', monsterId: 'b', stat: 'attack', fieldId: 'mist' }
    ])
    expect(defined(after.battle, 'trận').stages).toEqual({ a: { attack: -1 } })
  })

  it('Safeguard chặn dính trạng thái trên phe đó', () => {
    const field = makeField({ sides: { player: [sideEntry('safeguard', 1, 5)] } })
    const after = turn(battle([ally('a')], [enemy('e1', ['hypnosis'])], field), idle())
    expect(eventsOf(after, 'statusBlockedByField')).toEqual([
      { type: 'statusBlockedByField', monsterId: 'a', statusId: 'sleep', fieldId: 'safeguard' }
    ])
    expect(fighter(after, 'a').statuses).toEqual([])
  })
})

describe('bẫy khi vào sân giữa trận', () => {
  const party = (incoming: MonsterOverrides = {}): Monster[] => [
    ally('a'),
    ally('b'),
    ally('c', incoming)
  ]
  const switchInto = (field: BattleField, incoming: MonsterOverrides = {}): GameState =>
    turn(battle(party(incoming), [enemy('e1')], field), switchTo(0, 'c'), idle(1))
  const playerSide = (...entries: ActiveSideField[]): BattleField =>
    makeField({ sides: { player: entries } })

  it('Spikes: % max HP theo số tầng, chỉ quái đứng trên đất; log fieldDamage', () => {
    const after = switchInto(playerSide(sideEntry('spikes', 2)))
    expect(eventsOf(after, 'fieldDamage')).toEqual([
      { type: 'fieldDamage', monsterId: 'c', fieldId: 'spikes', amount: expect.anything() }
    ])
    expect(fighter(after, 'c').damageTaken.toNumber()).toBe(10) // 20% × 50
    const flyer = switchInto(playerSide(sideEntry('spikes', 3)), { elementIds: ['flying'] })
    expect(fighter(flyer, 'c').damageTaken.toNumber()).toBe(0)
  })

  it('Stealth Rock: nhân khắc hệ, trúng cả quái không đứng trên đất', () => {
    const rocks = playerSide(sideEntry('rocks'))
    // Lửa đánh cỏ × 2: 10% × 2 × 50 = 10.
    expect(fighter(switchInto(rocks, { elementIds: ['grass'] }), 'c').damageTaken.toNumber()).toBe(
      10
    )
    expect(
      fighter(switchInto(rocks, { elementIds: ['grass', 'flying'] }), 'c').damageTaken.toNumber()
    ).toBe(10)
    expect(fighter(switchInto(rocks), 'c').damageTaken.toNumber()).toBe(5)
  })

  it('Toxic Spikes: 1 tầng độc, 2 tầng độc nặng; Safeguard chặn; quái hệ hút thì bẫy mất', () => {
    const poisoned = switchInto(playerSide(sideEntry('toxicSpikes', 1)))
    expect(fighter(poisoned, 'c').statuses.map((s) => s.statusId)).toEqual(['poison'])
    const badly = switchInto(playerSide(sideEntry('toxicSpikes', 2)))
    expect(fighter(badly, 'c').statuses.map((s) => s.statusId)).toEqual(['badPoison'])

    const guarded = switchInto(
      playerSide(sideEntry('safeguard', 1, 5), sideEntry('toxicSpikes', 1))
    )
    expect(fighter(guarded, 'c').statuses).toEqual([])
    expect(eventsOf(guarded, 'statusBlockedByField')[0]?.fieldId).toBe('safeguard')

    const absorbed = switchInto(playerSide(sideEntry('toxicSpikes', 2)), { elementIds: ['grass'] })
    expect(fighter(absorbed, 'c').statuses).toEqual([])
    expect(fieldOf(absorbed).sides.player).toEqual([])
    expect(eventsOf(absorbed, 'sideFieldAbsorbed')).toEqual([
      { type: 'sideFieldAbsorbed', side: 'player', fieldId: 'toxicSpikes', monsterId: 'c' }
    ])
    // Quái không đứng trên đất không bị và không hút.
    const flyer = switchInto(playerSide(sideEntry('toxicSpikes', 1)), {
      elementIds: ['grass', 'flying']
    })
    expect(fieldOf(flyer).sides.player).toEqual([sideEntry('toxicSpikes', 1)])
  })

  it('Sticky Web: hạ bậc tốc độ quái vào sân', () => {
    const after = switchInto(playerSide(sideEntry('web')))
    expect(defined(after.battle, 'trận').stages.c).toEqual({ speed: -1 })
  })

  it('thay quái gục: quái thay gục vì bẫy thì chọn thay tiếp, hết dự bị thì để trống ô', () => {
    const spikes = playerSide(sideEntry('spikes', 3)) // 30% = 15
    const weak = { damageTaken: 40 } // còn 10 HP
    const party = [ally('a', { damageTaken: 50 }), ally('b'), ally('c', weak), ally('d')]
    const replace = (state: GameState, monsterId: string): GameState =>
      run(state, { type: 'replaceFainted', replacements: [{ slot: 0, monsterId }] })

    const again = replace(waitingReplacement(party, spikes), 'c')
    expect(fighter(again, 'c').damageTaken.toNumber()).toBe(50)
    expect(defined(again.battle, 'trận').phase).toBe('chooseReplacement')
    const filled = replace(again, 'd')
    expect(defined(filled.battle, 'trận').playerSlots).toEqual(['d', 'b'])
    expect(defined(filled.battle, 'trận').phase).toBe('chooseActions')

    const lastOne = replace(waitingReplacement(party.slice(0, 3), spikes), 'c')
    expect(defined(lastOne.battle, 'trận').playerSlots).toEqual([null, 'b'])
    expect(defined(lastOne.battle, 'trận').phase).toBe('chooseActions')
  })
})

describe('màn chắn (damageTakenMultiplier)', () => {
  const attacker = makeMonster({ id: 'atk', elementIds: ['ghost'] })
  const defender = makeMonster({ id: 'def' })
  const enemySide = (...entries: ActiveSideField[]): BattleField =>
    makeField({ sides: { enemy: entries } })
  const expected = (
    field: BattleField,
    { skillId = 'strike', count = 1, gameData = data } = {}
  ): number =>
    expectedDamage({
      data: gameData,
      attacker,
      defender,
      skill: gameData.skills[skillId],
      spread: false,
      arena: makeArena(field, { defenderSideCount: count })
    }).toNumber()

  it('theo category và số quái trên sân của phe nhận; không nhân dồn (lấy nhỏ nhất)', () => {
    expect(expected(makeField())).toBe(7.5)
    expect(expected(enemySide(sideEntry('reflect')))).toBe(3.75)
    expect(expected(enemySide(sideEntry('reflect')), { count: 2 })).toBe(5.625)
    // Màn chắn phe khác (phe đánh) không áp.
    expect(expected(makeField({ sides: { player: [sideEntry('reflect')] } }))).toBe(7.5)
    expect(expected(enemySide(sideEntry('reflect')), { skillId: 'splash' })).toBe(7.5)
    expect(expected(enemySide(sideEntry('veil')), { skillId: 'splash' })).toBe(6)
    expect(expected(enemySide(sideEntry('reflect'), sideEntry('veil')))).toBe(3.75)
  })

  it('đánh thật: làm tròn xuống; chí mạng bỏ qua màn chắn (cả AI dự đoán)', () => {
    const field = enemySide(sideEntry('reflect'))
    const real = computeDamage({
      data,
      attacker,
      defender,
      skill: data.skills.strike,
      spread: false,
      arena: makeArena(field),
      rng: createRng(1)
    })
    expect(real.damage.toNumber()).toBe(3)

    const raw = makeSideFieldRawData()
    raw.config.battle.critChance = 100
    const alwaysCrit = createGameData(raw)
    expect(expected(field, { gameData: alwaysCrit })).toBe(11.25) // 7,5 × 1,5
    const crit = computeDamage({
      data: alwaysCrit,
      attacker,
      defender,
      skill: alwaysCrit.skills.strike,
      spread: false,
      arena: makeArena(field),
      rng: createRng(1)
    })
    expect(crit.critical).toBe(true)
    expect(crit.damage.toNumber()).toBe(11)
  })
})

describe('AI: setSideField và hiệu ứng bị hiệu ứng theo phe chặn', () => {
  const user = makeMonster({ id: 'u' })
  // Hệ thường để không miễn độc (hệ cỏ mặc định miễn độc).
  const foe = makeMonster({ id: 'f', elementIds: ['normal'] })
  const context = (overrides: Partial<SkillEffectAiContext> = {}): SkillEffectAiContext => ({
    data,
    user,
    target: user,
    targetIsAlly: true,
    stages: {},
    expectedDamage: BIG_ZERO,
    field: makeField(),
    side: 'player',
    allies: [user],
    foes: [foe],
    allyReserves: [],
    foeReserves: [],
    ...overrides
  })
  const value = (params: unknown, overrides: Partial<SkillEffectAiContext> = {}): number =>
    SKILL_EFFECTS.setSideField.aiValue(params, context(overrides))
  const reflect = { side: 'own', fieldId: 'reflect' }
  const spikes = { side: 'foe', fieldId: 'spikes' }

  it('phe mình: lợi trên quái trên sân × fieldWeight; đã có còn ≥ 2 lượt thì 0', () => {
    expect(value(reflect)).toBeCloseTo(0.3)
    const active = (turnsLeft: number): BattleField =>
      makeField({ sides: { player: [sideEntry('reflect', 1, turnsLeft)] } })
    expect(value(reflect, { field: active(2) })).toBe(0)
    expect(value(reflect, { field: active(1) })).toBeCloseTo(0.3)
  })

  it('bẫy phe địch: chấm theo quái dự bị còn sống của địch (chỉ quái đứng trên đất); đủ tầng thì 0', () => {
    expect(value(spikes)).toBeCloseTo(0)
    const reserves = [makeMonster({ id: 'r1' }), makeMonster({ id: 'r2', elementIds: ['flying'] })]
    expect(value(spikes, { foeReserves: reserves })).toBeCloseTo(0.3)
    const full = makeField({ sides: { enemy: [sideEntry('spikes', 3)] } })
    expect(value(spikes, { foeReserves: reserves, field: full })).toBeCloseTo(0)
    expect(
      value(spikes, {
        foeReserves: reserves,
        field: makeField({ sides: { enemy: [sideEntry('spikes', 2)] } })
      })
    ).toBeCloseTo(0.3)
  })

  it('thiếu môi trường yêu cầu thì 0', () => {
    const veil = { side: 'own', fieldId: 'veil', requiresFieldId: 'storm' }
    expect(value(veil)).toBe(0)
    expect(value(veil, { field: makeField({ weather: 'storm' }) })).toBeGreaterThan(0)
  })

  it('statStage hạ bậc địch có Mist, applyStatus lên địch có Safeguard hoặc trạng thái cùng nhóm: 0', () => {
    const enemySide = (id: string): BattleField =>
      makeField({ sides: { enemy: [sideEntry(id, 1, 5)] } })
    const drop = { who: 'target', stat: 'attack', delta: -1 }
    const onFoe = { target: foe, targetIsAlly: false }
    expect(SKILL_EFFECTS.statStage.aiValue(drop, context(onFoe))).toBeGreaterThan(0)
    expect(
      SKILL_EFFECTS.statStage.aiValue(drop, context({ ...onFoe, field: enemySide('mist') }))
    ).toBe(0)
    const poison = { statusId: 'poison' }
    expect(SKILL_EFFECTS.applyStatus.aiValue(poison, context(onFoe))).toBeGreaterThan(0)
    expect(
      SKILL_EFFECTS.applyStatus.aiValue(
        poison,
        context({ ...onFoe, field: enemySide('safeguard') })
      )
    ).toBe(0)
    const badlyPoisoned = makeMonster({
      id: 'f',
      elementIds: ['normal'],
      statuses: [{ statusId: 'badPoison', turnsLeft: 2 }]
    })
    expect(
      SKILL_EFFECTS.applyStatus.aiValue(
        poison,
        context({ target: badlyPoisoned, targetIsAlly: false })
      )
    ).toBe(0)
  })
})
