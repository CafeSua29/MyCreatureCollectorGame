// Bậc chí mạng và bậc chính xác / né (docs/rules/battle.md mục "Chí mạng", "Bậc trận"): hệ số
// chính xác theo bậc, tỉ lệ chí mạng theo bậc (skill, Focus Energy, trait), luôn chí mạng, hiệu ứng
// `focus`, White Herb, kiểm tra dữ liệu / save.

import { describe, expect, it } from 'vitest'
import { gameReducer, validateGameState } from '../game'
import { createGameData } from '../gameData'
import { accuracyStageFactor } from '../monster'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { BattleEvent, GameData, GameState, Monster, RawGameData } from '../model'
import { critStageChance } from './damage'
import { skillAccuracy } from './environment'

/** Dữ liệu mẫu: bậc 0 không chí mạng, mọi bậc ≥ 1 chí mạng chắc chắn (dễ kiểm tra bằng log). */
function critData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = makeRawData()
  raw.config.battle = { ...raw.config.battle, critChance: 0, critStageChances: [100, 100, 100] }
  raw.skills.push(
    {
      id: 'slash',
      elementId: 'normal',
      category: 'physical',
      power: 40,
      accuracy: 100,
      priority: 0,
      target: 'enemy',
      effects: [],
      critStage: 1
    },
    {
      id: 'frostBreath',
      elementId: 'normal',
      category: 'special',
      power: 40,
      accuracy: 100,
      priority: 0,
      target: 'enemy',
      effects: [],
      alwaysCrit: true
    },
    {
      id: 'focusEnergy',
      elementId: 'normal',
      category: 'status',
      power: 0,
      accuracy: 100,
      priority: 0,
      target: 'self',
      effects: [],
      spell: { after: [{ do: 'focus', to: 'self', stages: 2 }] }
    },
    {
      id: 'sandAttack',
      elementId: 'normal',
      category: 'status',
      power: 0,
      accuracy: 100,
      priority: 0,
      target: 'enemy',
      effects: [{ type: 'statStage', params: { who: 'target', stat: 'accuracy', delta: -1 } }]
    }
  )
  raw.traits.push(
    { id: 'luckyStar', kind: 'positive', hooks: [{ type: 'critStage', params: { stages: 1 } }] },
    { id: 'armor', kind: 'positive', hooks: [{ type: 'critImmunity', params: {} }] }
  )
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = critData()

const ally = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id: 'a',
    skillIds: ['strike', 'slash', 'frostBreath', 'focusEnergy'],
    ...overrides
  })
const foe = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({
    id: 'x',
    skillIds: ['idle'],
    genes: { ...uniformStats(1), hp: 100000, speed: 1 },
    ...overrides
  })

const turn = (state: GameState, skillId: string, gameData: GameData = data): GameState =>
  gameReducer(gameData, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
  })

const criticals = (state: GameState): boolean[] =>
  defined(state.battle, 'trận')
    .log.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage')
    .map((e) => e.critical)

describe('bậc chính xác / né', () => {
  it('hệ số như Pokémon: (3 + s) / 3 hoặc 3 / (3 − s), kẹp ±6, chính xác trừ né', () => {
    const factor = (accuracy: number, evasion = 0): number =>
      accuracyStageFactor(data.config, { accuracy, evasion })
    expect(factor(0)).toBe(1)
    expect(factor(1)).toBeCloseTo(4 / 3)
    expect(factor(-1)).toBeCloseTo(3 / 4)
    expect(factor(6)).toBe(3)
    expect(factor(-6)).toBeCloseTo(1 / 3)
    expect(factor(100)).toBe(3)
    expect(factor(2, 2)).toBe(1)
    expect(factor(0, 1)).toBeCloseTo(3 / 4)
  })

  it('accuracy của skill nhân hệ số bậc (kẹp 100); không truyền bậc thì như cũ', () => {
    const user = ally()
    const target = foe()
    const field = defined(makeBattleState([user], [target]).battle, 'trận').field
    const at = (stages: Record<string, Record<string, number>>): number =>
      skillAccuracy(data, field, data.skills.shaky, { user, target, stages })
    expect(at({})).toBe(50)
    expect(at({ a: { accuracy: 6 } })).toBe(100)
    expect(at({ x: { evasion: 6 } })).toBeCloseTo(50 / 3)
    expect(at({ a: { accuracy: 1 }, x: { evasion: 1 } })).toBe(50)
  })

  it('Sand Attack hạ bậc chính xác của mục tiêu; save hợp lệ', () => {
    const state = makeBattleState([ally({ skillIds: ['sandAttack'] })], [foe()])
    const next = turn(state, 'sandAttack')
    expect(defined(next.battle, 'trận').stages.x).toEqual({ accuracy: -1 })
    expect(validateGameState(data, next)).toEqual([])
  })
})

describe('bậc chí mạng', () => {
  it('tỉ lệ theo bậc: bậc 0 = critChance, bậc vượt danh sách lấy mục cuối', () => {
    const real = critData((raw) => {
      raw.config.battle = {
        ...raw.config.battle,
        critChance: 6.25,
        critStageChances: [12.5, 50, 100]
      }
    })
    expect([0, 1, 2, 3, 9].map((stage) => critStageChance(real, stage))).toEqual([
      6.25, 12.5, 50, 100, 100
    ])
  })

  it('skill critStage chí mạng, skill thường không (bậc 0 = 0%)', () => {
    const state = makeBattleState([ally()], [foe()])
    expect(criticals(turn(state, 'strike'))).toEqual([false])
    expect(criticals(turn(state, 'slash'))).toEqual([true])
  })

  it('alwaysCrit luôn chí mạng; trait miễn chí mạng của mục tiêu vẫn chặn', () => {
    const state = makeBattleState([ally()], [foe()])
    expect(criticals(turn(state, 'frostBreath'))).toEqual([true])
    const armored = makeBattleState([ally()], [foe({ traits: [{ id: 'armor', level: 1 }] })])
    expect(criticals(turn(armored, 'frostBreath'))).toEqual([false])
  })

  it('trait critStage (kiểu Super Luck) cộng bậc', () => {
    const state = makeBattleState([ally({ traits: [{ id: 'luckyStar', level: 1 }] })], [foe()])
    expect(criticals(turn(state, 'strike'))).toEqual([true])
  })

  it('Focus Energy: +2 bậc tới khi rời sân, dùng lại không cộng thêm; save hợp lệ', () => {
    const state = makeBattleState([ally()], [foe()])
    const focused = turn(state, 'focusEnergy')
    const battle = defined(focused.battle, 'trận')
    expect(battle.volatiles.a?.focusStages).toBe(2)
    expect(battle.log).toContainEqual({ type: 'focused', monsterId: 'a', stages: 2 })
    const again = turn(focused, 'focusEnergy')
    expect(defined(again.battle, 'trận').log.filter((e) => e.type === 'focused')).toHaveLength(1)
    expect(criticals(turn(focused, 'strike'))).toEqual([true])
    expect(validateGameState(data, focused)).toEqual([])
  })
})

describe('kiểm tra dữ liệu và save', () => {
  it('critStage nguyên ≥ 1, alwaysCrit chỉ true, chỉ skill gây sát thương; config, hook, hiệu ứng', () => {
    const issues = dataIssuesAfter(
      (raw) => {
        Object.assign(
          defined(
            raw.skills.find((s) => s.id === 'strike'),
            'strike'
          ),
          {
            critStage: 0.5,
            alwaysCrit: 1
          }
        )
        Object.assign(
          defined(
            raw.skills.find((s) => s.id === 'idle'),
            'idle'
          ),
          { critStage: 1 }
        )
        raw.config.battle = { ...raw.config.battle, critStageChances: [101] }
        raw.traits.push({
          id: 'badLuck',
          kind: 'positive',
          hooks: [{ type: 'critStage', params: {} }]
        })
        raw.skills.push({
          id: 'badFocus',
          elementId: 'normal',
          category: 'status',
          power: 0,
          accuracy: 100,
          priority: 0,
          target: 'self',
          effects: [{ type: 'statStage', params: { who: 'self', stat: 'luck', delta: 1 } }],
          spell: { after: [{ do: 'focus', to: 'self', stages: 0 }] }
        })
      },
      { regenerateText: true }
    )
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Skill "strike": critStage'),
        'Skill "strike": alwaysCrit chỉ được là true',
        'Skill "idle": critStage / alwaysCrit chỉ dùng cho skill gây sát thương',
        expect.stringContaining('battle.critStageChances[0]'),
        expect.stringContaining('badLuck'),
        expect.stringContaining('stat phải là chỉ số có bậc trận'),
        expect.stringContaining('stages')
      ])
    )
  })

  it('save: bậc trận lạ, focusStages sai thì báo lỗi', () => {
    const state = makeBattleState([ally()], [foe()])
    const battle = defined(state.battle, 'trận')
    const broken = {
      ...state,
      battle: {
        ...battle,
        stages: { a: { luck: 1 } },
        volatiles: { ...battle.volatiles, a: { firstTurn: 1, focusStages: 0 } }
      }
    } as unknown as GameState
    expect(validateGameState(data, broken)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('battle.stages.a.luck'),
        expect.stringContaining('focusStages')
      ])
    )
  })
})
