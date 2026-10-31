// Hook môi trường dùng cho môi trường của map (mục "Môi trường" ở battle-environment.md): lọc theo hệ
// (exceptElementIds) và theo mặt đất cho chỉ số, accuracy theo hệ / nhóm skill, nhân hồi máu
// (healMultiplier), tỉ lệ dính trạng thái cuối lượt (turnEndStatusChance).

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { computeStats } from '../monster'
import { cloneData } from '../shared'
import { fieldAccuracyMultiplier } from '../registries'
import {
  dataIssues,
  defined,
  makeBattleState,
  makeEnvironmentRawData,
  makeField,
  makeMonster,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleEvent,
  BattleField,
  FieldEffectDef,
  GameData,
  GameState,
  Monster,
  RawGameData
} from '../model'

/** Môi trường mẫu số tròn để tính tay. */
const MAP_FIELDS: FieldEffectDef[] = [
  {
    // Như đầm lầy: tốc độ × 0,5 cho quái đứng trên đất, trừ hệ nước.
    id: 'mire',
    layer: 'terrain',
    duration: 5,
    hooks: [
      {
        type: 'statMultiplier',
        params: { stat: 'speed', multiplier: 0.5, exceptElementIds: ['water'], grounded: true }
      }
    ]
  },
  {
    // Như bão tuyết: accuracy × 0,5 trừ skill hệ nước.
    id: 'whiteout',
    layer: 'weather',
    duration: 5,
    hooks: [
      { type: 'accuracyMultiplier', params: { multiplier: 0.5, exceptElementIds: ['water'] } }
    ]
  },
  {
    // Như địa hình pha lê: skill status accuracy × 2.
    id: 'crystal',
    layer: 'terrain',
    duration: 5,
    hooks: [{ type: 'accuracyMultiplier', params: { multiplier: 2, categories: ['status'] } }]
  },
  {
    // Như đất nguyền: hồi máu × 0,5 cho quái đứng trên đất.
    id: 'cursed',
    layer: 'terrain',
    duration: 5,
    hooks: [{ type: 'healMultiplier', params: { multiplier: 0.5, grounded: true } }]
  },
  {
    // Hồi máu × 0,5 cho mọi quái (không xét mặt đất), dùng cùng địa hình cỏ.
    id: 'gloom',
    layer: 'weather',
    duration: 5,
    hooks: [{ type: 'healMultiplier', params: { multiplier: 0.5 } }]
  },
  {
    // Như chướng khí: cuối lượt 100% dính độc, trừ hệ fire.
    id: 'miasma',
    layer: 'weather',
    duration: 5,
    hooks: [
      {
        type: 'turnEndStatusChance',
        params: { statusId: 'poison', chance: 100, immuneElementIds: ['fire'] }
      }
    ]
  },
  {
    // Như địa hình núi lửa: mất 10% max HP cuối lượt, chỉ quái đứng trên đất.
    id: 'lava',
    layer: 'terrain',
    duration: 5,
    hooks: [
      { type: 'turnEndDamage', params: { percent: 10, immuneElementIds: [], grounded: true } }
    ]
  },
  {
    id: 'haze',
    layer: 'weather',
    duration: 5,
    hooks: [
      {
        type: 'turnEndStatusChance',
        params: { statusId: 'poison', chance: 50, immuneElementIds: [] }
      }
    ]
  }
]

function makeMapFieldRawData(): RawGameData {
  const raw = makeEnvironmentRawData()
  raw.fieldEffects.push(...cloneData(MAP_FIELDS))
  return withFixtureText(raw)
}

const data: GameData = createGameData(makeMapFieldRawData())

const monster = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, elementIds: ['normal'], skillIds: ['idle'], ...overrides })

const turnIn = (field: BattleField, party: Monster[], enemies: Monster[]): GameState =>
  gameReducer(data, makeBattleState(party, enemies, { field }), {
    type: 'submitTurn',
    commands: party.slice(0, 2).map((_, slot) => ({ slot, kind: 'skill', skillId: 'idle' }))
  })

const fighter = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id) ?? state.battle?.enemies.find((m) => m.id === id),
    `quái ${id}`
  )

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

describe('statMultiplier: exceptElementIds và grounded', () => {
  const speedIn = (m: Monster, field: BattleField): number =>
    computeStats(data, m, { field }).withField.speed.toNumber()

  it('quái đứng trên đất không thuộc hệ được trừ bị giảm; hệ nước và quái bay thì không', () => {
    const field = makeField({ terrain: 'mire' })
    const plain = monster('a')
    expect(speedIn(plain, field)).toBe(speedIn(plain, makeField()) * 0.5)
    const swimmer = monster('b', { elementIds: ['water'] })
    expect(speedIn(swimmer, field)).toBe(speedIn(swimmer, makeField()))
    const flyer = monster('c', { elementIds: ['flying'] })
    expect(speedIn(flyer, field)).toBe(speedIn(flyer, makeField()))
  })
})

describe('accuracyMultiplier: exceptElementIds và categories', () => {
  it('trừ hệ: skill hệ nước giữ nguyên, hệ khác bị nhân', () => {
    const field = makeField({ weather: 'whiteout' })
    expect(fieldAccuracyMultiplier(data, field, data.skills.strike)).toBe(0.5)
    expect(
      fieldAccuracyMultiplier(data, field, { ...data.skills.strike, elementId: 'water' })
    ).toBe(1)
  })

  it('theo nhóm skill: chỉ skill status được nhân', () => {
    const field = makeField({ terrain: 'crystal' })
    expect(fieldAccuracyMultiplier(data, field, data.skills.hypnosis)).toBe(2)
    expect(fieldAccuracyMultiplier(data, field, data.skills.strike)).toBe(1)
  })
})

describe('healMultiplier', () => {
  it('nhân hồi máu của môi trường (địa hình cỏ) và của trait (regen); làm tròn lên', () => {
    // Fixture: max HP 50, địa hình cỏ hồi 10% = 5, × 0,5 = 2,5 → 3.
    const hurt = monster('a', { damageTaken: 20 })
    const grassy = turnIn(
      makeField({ weather: 'gloom', terrain: 'grassy' }),
      [hurt],
      [monster('e')]
    )
    expect(fighter(grassy, 'a').damageTaken.toNumber()).toBe(17)
    const regen = monster('a', { damageTaken: 20, traits: [{ id: 'regen', level: 1 }] })
    const plain = turnIn(makeField(), [regen], [monster('e')])
    const halved = turnIn(makeField({ weather: 'gloom' }), [regen], [monster('e')])
    const healedPlain = 20 - fighter(plain, 'a').damageTaken.toNumber()
    const healedHalved = 20 - fighter(halved, 'a').damageTaken.toNumber()
    expect(healedPlain).toBeGreaterThan(0)
    expect(healedHalved).toBe(Math.ceil(healedPlain / 2))
  })

  it('grounded: chỉ quái đứng trên đất bị giảm', () => {
    const grounded = monster('a', { damageTaken: 20, traits: [{ id: 'regen', level: 1 }] })
    const flyer = monster('b', {
      damageTaken: 20,
      elementIds: ['flying'],
      traits: [{ id: 'regen', level: 1 }]
    })
    const plain = turnIn(makeField(), [grounded, flyer], [monster('e')])
    const cursed = turnIn(makeField({ terrain: 'cursed' }), [grounded, flyer], [monster('e')])
    expect(fighter(cursed, 'b').damageTaken).toEqual(fighter(plain, 'b').damageTaken)
    expect(fighter(cursed, 'a').damageTaken.gt(fighter(plain, 'a').damageTaken)).toBe(true)
  })
})

describe('turnEndDamage grounded', () => {
  it('chỉ quái đứng trên đất mất máu', () => {
    const after = turnIn(
      makeField({ terrain: 'lava' }),
      [monster('a'), monster('b', { elementIds: ['flying'] })],
      [monster('e')]
    )
    expect(fighter(after, 'a').damageTaken.toNumber()).toBe(5)
    expect(fighter(after, 'b').damageTaken.toNumber()).toBe(0)
  })
})

describe('turnEndStatusChance', () => {
  it('cuối lượt dính trạng thái; hệ miễn của hook và miễn nhiễm theo hệ thì không', () => {
    const after = turnIn(
      makeField({ weather: 'miasma' }),
      [monster('a'), monster('b', { elementIds: ['fire'] })],
      [monster('e', { elementIds: ['grass'] }), monster('f')]
    )
    expect(fighter(after, 'a').statuses.map((s) => s.statusId)).toEqual(['poison'])
    expect(fighter(after, 'b').statuses).toEqual([])
    // Hệ cỏ miễn độc (statusImmunities): không tung, không ghi log statusImmune.
    expect(fighter(after, 'e').statuses).toEqual([])
    expect(eventsOf(after, 'statusImmune')).toEqual([])
    expect(fighter(after, 'f').statuses.map((s) => s.statusId)).toEqual(['poison'])
  })

  it('quái không dính mới được (đã có, miễn nhiễm) thì không tốn RNG', () => {
    const poisoned = { statuses: [{ statusId: 'poison', turnsLeft: 3 }] }
    const party = [monster('a', poisoned)]
    const enemies = [monster('e', { elementIds: ['grass'] })]
    const withHaze = turnIn(makeField({ weather: 'haze' }), party, enemies)
    const without = turnIn(makeField(), party, enemies)
    expect(withHaze.rng).toBe(without.rng)
  })

  it('tỉ lệ < 100: có lượt dính, có lượt không, tất định theo RNG', () => {
    const results = new Set<boolean>()
    for (let seed = 0; seed < 30; seed++) {
      const state = makeBattleState([monster('a')], [monster('e', { elementIds: ['grass'] })], {
        field: makeField({ weather: 'haze' })
      })
      const after = gameReducer(
        data,
        { ...state, rng: seed },
        {
          type: 'submitTurn',
          commands: [{ slot: 0, kind: 'skill', skillId: 'idle' }]
        }
      )
      results.add(fighter(after, 'a').statuses.length > 0)
    }
    expect([...results].sort()).toEqual([false, true])
  })
})

describe('kiểm tra dữ liệu hook mới', () => {
  const issuesWith = (hooks: FieldEffectDef['hooks']): string => {
    const raw = makeMapFieldRawData()
    raw.fieldEffects.push({ id: 'bad', layer: 'weather', hooks })
    return dataIssues(withFixtureText(raw)).join('\n')
  }

  it('dữ liệu mẫu hợp lệ', () => {
    expect(dataIssues(makeMapFieldRawData())).toEqual([])
  })

  it('elementIds cùng exceptElementIds, hệ lạ, nhóm skill lạ / lặp / rỗng', () => {
    const both = issuesWith([
      {
        type: 'statMultiplier',
        params: { stat: 'speed', multiplier: 1, elementIds: ['fire'], exceptElementIds: ['water'] }
      }
    ])
    expect(both).toMatch(/chỉ dùng một trong elementIds \/ exceptElementIds/)
    const issues = issuesWith([
      {
        type: 'accuracyMultiplier',
        params: { multiplier: 1, exceptElementIds: ['lava'], categories: ['magic', 'magic'] }
      },
      { type: 'accuracyMultiplier', params: { multiplier: 1, categories: [] } }
    ])
    expect(issues).toMatch(/exceptElementIds: hệ không tồn tại "lava"/)
    expect(issues).toMatch(/categories: nhóm skill lạ "magic"/)
    expect(issues).toMatch(/categories bị lặp/)
    expect(issues).toMatch(/categories phải là danh sách không rỗng/)
  })

  it('healMultiplier / turnEndStatusChance sai', () => {
    const issues = issuesWith([
      { type: 'healMultiplier', params: { multiplier: -1, grounded: false } },
      {
        type: 'turnEndStatusChance',
        params: { statusId: 'dizzy', chance: 0, immuneElementIds: ['lava'] }
      }
    ])
    expect(issues).toMatch(/multiplier/)
    expect(issues).toMatch(/grounded chỉ được là true/)
    expect(issues).toMatch(/trạng thái không tồn tại "dizzy"/)
    expect(issues).toMatch(/chance/)
    expect(issues).toMatch(/immuneElementIds: hệ không tồn tại "lava"/)
  })
})
