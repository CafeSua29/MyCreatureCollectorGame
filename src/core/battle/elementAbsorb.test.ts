// Hút skill theo hệ (trait absorbElement, battle/elementAbsorb.ts): hồi máu, không sát thương / hiệu
// ứng, trước accuracy, đánh lan, skill trạng thái, hệ đổi theo môi trường, cùng phe không hút, tăng
// sát thương kiểu Flash Fire (không cộng dồn, mất khi rời sân), AI, kiểm tra dữ liệu và save v20.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { SAVE_VERSION, deserializeState, gameReducer, migrateState, serializeState } from '../game'
import { validateGameState } from '../game/validateGameState'
import { getCurrentHp } from '../monster'
import {
  dataIssuesAfter,
  defined,
  makeArena,
  makeBattleContext,
  makeBattleState,
  makeField,
  makeMonster,
  makeSideFieldRawData,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleState,
  GameData,
  GameState,
  Monster,
  Skill,
  TraitDef
} from '../model'
import { expectedDamage } from './damage'
import { cloneDraft } from './draft'
import { absorbAiScore } from './elementAbsorb'

function trait(id: string, params: unknown): TraitDef {
  return { id, kind: 'rare', hooks: [{ type: 'absorbElement', params }] }
}

const TRAITS: TraitDef[] = [
  trait('waterAbsorb', { elementIds: ['water'], healPercent: 25 }),
  trait('flashFire', { elementIds: ['fire'], healPercent: 0, boostPercent: 50 }),
  // Kiểu Storm Drain: miễn hệ nước, hút xong +1 đặc công.
  trait('stormDrain', {
    elementIds: ['water'],
    healPercent: 0,
    stages: [{ stat: 'spAttack', delta: 1 }]
  })
]

const skill = (overrides: Partial<Skill> & Pick<Skill, 'id'>): Skill => ({
  elementId: 'water',
  category: 'special',
  power: 50,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...overrides
})

const SKILLS: Skill[] = [
  skill({ id: 'shakySplash', accuracy: 50 }),
  skill({ id: 'tide', target: 'allEnemies' }),
  skill({
    id: 'soak',
    category: 'status',
    power: 0,
    effects: [{ type: 'applyStatus', params: { statusId: 'poison' } }]
  }),
  skill({
    id: 'rinse',
    category: 'status',
    power: 0,
    target: 'ally',
    effects: [{ type: 'statStage', params: { who: 'target', stat: 'attack', delta: 1 } }]
  }),
  // Kiểu Weather Ball: hệ thường, mưa thành hệ nước.
  skill({
    id: 'weatherBall',
    elementId: 'normal',
    fieldModifiers: [{ fieldId: 'rain', elementId: 'water' }]
  })
]

const data: GameData = (() => {
  const raw = makeSideFieldRawData()
  raw.traits.push(...TRAITS)
  raw.skills.push(...SKILLS)
  return createGameData(withFixtureText(raw))
})()

/** Quái ta hệ ma, HP 50, biết các skill hệ nước / lửa. */
const fighter = (id: string, traits: string[] = [], extra: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    elementIds: ['ghost'],
    skillIds: ['splash', 'blast', 'tide', 'soak'],
    traits: traits.map((traitId) => ({ id: traitId, level: 1 })),
    ...extra
  })

/** Quái địch hệ ma, chỉ biết idle (AI không đánh). */
const foe = (id: string, traits: string[] = [], extra: MonsterOverrides = {}): Monster =>
  fighter(id, traits, { skillIds: ['idle'], ...extra })

const run = (state: GameState, commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })
const cast = (slot: number, skillId: string, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')
const eventsOf = (state: GameState, type: BattleEvent['type']): BattleEvent[] =>
  battleOf(state).log.filter((event) => event.type === type)
const monsterIn = (state: GameState, id: string): Monster =>
  defined(
    [...state.party, ...battleOf(state).enemies].find((monster) => monster.id === id),
    `quái ${id}`
  )
const hpOf = (state: GameState, id: string): number =>
  getCurrentHp(data, monsterIn(state, id)).toNumber()
const damagedIds = (state: GameState): string[] =>
  eventsOf(state, 'damage').flatMap((event) => (event.type === 'damage' ? [event.targetId] : []))

describe('absorbElement: hút skill và hồi máu', () => {
  it('không sát thương, hồi % max HP (làm tròn lên), log trait của quái hút', () => {
    const after = run(
      makeBattleState([fighter('a')], [foe('e1', ['waterAbsorb'], { damageTaken: 20 })]),
      [cast(0, 'splash')]
    )
    expect(damagedIds(after)).toEqual([])
    expect(hpOf(after, 'e1')).toBe(30 + Math.ceil(12.5))
    expect(battleOf(after).log).toContainEqual({
      type: 'traitTriggered',
      monsterId: 'e1',
      traitId: 'waterAbsorb'
    })
  })

  it('đầy máu thì chỉ log trait; skill hệ khác đánh bình thường', () => {
    const full = run(makeBattleState([fighter('a')], [foe('e1', ['waterAbsorb'])]), [
      cast(0, 'splash')
    ])
    expect(eventsOf(full, 'heal')).toHaveLength(0)
    expect(eventsOf(full, 'traitTriggered')).toHaveLength(1)
    const fire = run(makeBattleState([fighter('a')], [foe('e1', ['waterAbsorb'])]), [
      cast(0, 'blast')
    ])
    expect(damagedIds(fire)).toEqual(['e1'])
  })

  it('xét trước accuracy: skill 50% luôn bị hút, không có miss', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = {
        ...makeBattleState(
          [fighter('a', [], { skillIds: ['shakySplash'] })],
          [foe('e1', ['waterAbsorb'])]
        ),
        rng: seed
      }
      const after = run(state, [cast(0, 'shakySplash')])
      expect(eventsOf(after, 'miss')).toHaveLength(0)
      expect(eventsOf(after, 'traitTriggered')).toHaveLength(1)
    }
  })

  it('skill trạng thái cùng hệ cũng bị hút (không dính độc)', () => {
    const after = run(makeBattleState([fighter('a')], [foe('e1', ['waterAbsorb'])]), [
      cast(0, 'soak')
    ])
    expect(monsterIn(after, 'e1').statuses).toEqual([])
    expect(eventsOf(after, 'statusApplied')).toHaveLength(0)
  })

  it('đánh lan: mục tiêu hút bỏ qua, mục tiêu khác vẫn trúng', () => {
    const after = run(makeBattleState([fighter('a')], [foe('e1', ['waterAbsorb']), foe('e2')]), [
      cast(0, 'tide')
    ])
    expect(damagedIds(after)).toEqual(['e2'])
  })

  it('hệ đổi theo môi trường (kiểu Weather Ball): mưa thành nước thì bị hút', () => {
    const attacker = fighter('a', [], { skillIds: ['weatherBall'] })
    const target = (): Monster => foe('e1', ['waterAbsorb'], { elementIds: ['water'] })
    const clear = run(makeBattleState([attacker], [target()]), [cast(0, 'weatherBall')])
    expect(damagedIds(clear)).toEqual(['e1'])
    const rain = run(
      makeBattleState([attacker], [target()], { field: makeField({ weather: 'rain' }) }),
      [cast(0, 'weatherBall')]
    )
    expect(damagedIds(rain)).toEqual([])
  })

  it('skill của đồng đội không bị hút', () => {
    const after = run(
      makeBattleState(
        [fighter('a', [], { skillIds: ['rinse'] }), fighter('b', ['waterAbsorb'])],
        [foe('e1')]
      ),
      [cast(0, 'rinse'), cast(1, 'splash')]
    )
    expect(battleOf(after).stages.b?.attack).toBe(1)
  })
})

describe('absorbElement: tăng sát thương (kiểu Flash Fire)', () => {
  it('hút thì đánh dấu trait, hút lại không cộng dồn', () => {
    const once = run(makeBattleState([fighter('a')], [foe('e1', ['flashFire'])]), [
      cast(0, 'blast')
    ])
    expect(battleOf(once).volatiles.e1?.absorbBoosts).toEqual(['flashFire'])
    const twice = run(once, [cast(0, 'blast')])
    expect(battleOf(twice).volatiles.e1?.absorbBoosts).toEqual(['flashFire'])
  })

  it('skill hệ đã hút × 1,5; hệ khác không đổi', () => {
    const attacker = foe('e1', ['flashFire'])
    const target = fighter('a')
    const damage = (skillId: string, absorbBoosts: string[]): number =>
      expectedDamage({
        data,
        attacker,
        defender: target,
        skill: data.skills[skillId],
        spread: false,
        arena: makeArena(makeField(), {
          attackerContext: makeBattleContext({ absorbBoosts })
        })
      }).toNumber()
    expect(damage('blast', ['flashFire']) / damage('blast', [])).toBeCloseTo(1.5)
    expect(damage('splash', ['flashFire'])).toBe(damage('splash', []))
  })

  it('rời sân thì mất', () => {
    const state = makeBattleState(
      [fighter('a', ['flashFire']), fighter('b'), fighter('c')],
      [foe('e1')],
      {
        volatiles: {
          a: { firstTurn: 1, absorbBoosts: ['flashFire'] },
          b: { firstTurn: 1 },
          e1: { firstTurn: 1 }
        }
      }
    )
    const switched = run(state, [{ slot: 0, kind: 'switch', monsterId: 'c' }, cast(1, 'splash')])
    expect(battleOf(switched).volatiles.a).toBeUndefined()
  })
})

describe('AI', () => {
  it('nhắm địch hút được: âm theo máu địch hồi được; không hút: null', () => {
    const state = makeBattleState(
      [fighter('a')],
      [foe('e1', ['waterAbsorb'], { damageTaken: 20 }), foe('e2', ['waterAbsorb'])]
    )
    const d = cloneDraft(state)
    const user = d.party[0]
    const [e1, e2] = d.battle.enemies
    const score = absorbAiScore(data, d, { user, skill: data.skills.splash, target: e1 })
    expect(score).toBeCloseTo((-13 / 50) * data.config.ai.healWeight)
    expect(absorbAiScore(data, d, { user, skill: data.skills.splash, target: e2 })).toBeCloseTo(0)
    expect(absorbAiScore(data, d, { user, skill: data.skills.blast, target: e1 })).toBeNull()
  })
})

describe('hút xong tăng bậc', () => {
  it('Storm Drain: không nhận sát thương, +1 đặc công', () => {
    const state = makeBattleState([fighter('a')], [foe('e', ['stormDrain'])])
    const after = run(state, [cast(0, 'splash')])
    expect(hpOf(after, 'e')).toBe(hpOf(state, 'e'))
    expect(battleOf(after).stages.e?.spAttack).toBe(1)
  })
})

describe('kiểm tra dữ liệu và save v20', () => {
  const issuesFor = (params: unknown): string[] =>
    dataIssuesAfter((raw) => raw.traits.push(trait('broken', params)), { regenerateText: true })

  it('params hợp lệ / sai', () => {
    expect(issuesFor({ elementIds: ['water'], healPercent: 25 })).toEqual([])
    expect(issuesFor({ elementIds: ['fire'], healPercent: 0, boostPercent: 50 })).toEqual([])
    // Hút chỉ để miễn (Well-Baked Body, Motor Drive) hợp lệ như gốc.
    expect(issuesFor({ elementIds: ['water'], healPercent: 0 })).toEqual([])
    const cases: [unknown, string][] = [
      [{ elementIds: ['water'], healPercent: 0, stages: [{ stat: 'hp', delta: 1 }] }, 'stages'],
      [{ elementIds: ['water'], healPercent: 0, stages: [{ stat: 'speed', delta: 0.5 }] }, 'delta'],
      [{ elementIds: ['lava'], healPercent: 25 }, 'lava'],
      [{ elementIds: [], healPercent: 25 }, 'elementIds'],
      [{ elementIds: ['water'], healPercent: 120 }, 'healPercent'],
      [{ elementIds: ['water'], healPercent: 0, boostPercent: 0 }, 'boostPercent'],
      [null, 'object']
    ]
    for (const [params, fragment] of cases) {
      expect(issuesFor(params).join('\n')).toContain(fragment)
    }
  })

  it('validateGameState kiểm tra absorbBoosts', () => {
    const state = makeBattleState([fighter('a')], [foe('e1')])
    const withBoosts = (absorbBoosts: unknown): GameState =>
      ({
        ...state,
        battle: { ...battleOf(state), volatiles: { a: { firstTurn: 1, absorbBoosts } } }
      }) as GameState
    expect(validateGameState(data, withBoosts(['flashFire']))).toEqual([])
    for (const bad of [[], ['nope'], ['flashFire', 'flashFire'], 'flashFire']) {
      expect(validateGameState(data, withBoosts(bad)).join('\n')).toMatch(/absorbBoosts/)
    }
  })

  it('lưu / đọc save giữ absorbBoosts; migrate v19 → v20 không đổi dữ liệu', () => {
    const state = makeBattleState([fighter('a')], [foe('e1')], {
      volatiles: { a: { firstTurn: 1, absorbBoosts: ['flashFire'] }, e1: { firstTurn: 1 } }
    })
    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    expect(battleOf(migrateState(deserializeState(raw), data)).volatiles).toEqual(
      battleOf(state).volatiles
    )
    raw.version = 19
    delete raw.battle.volatiles.a.absorbBoosts
    const migrated = migrateState(deserializeState(raw), data)
    expect(migrated.version).toBe(SAVE_VERSION)
    // Các bước sau v20 (trait Siralim, trang bị) không đổi absorbBoosts.
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(21)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
