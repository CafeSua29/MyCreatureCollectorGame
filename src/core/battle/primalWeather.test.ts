// Thời tiết nguyên thủy và đồ cầm theo môi trường (mục "Thời tiết nguyên thủy" ở
// battle-environment.md): actsAs, primal (chặn hệ, khóa lớp, tan khi quái đặt rời sân), gió bí ẩn hết
// khắc hệ Bay, miễn sát thương theo môi trường, Damp Rock / Utility Umbrella / Seed, Mimicry.

import { describe, expect, it } from 'vitest'
import { createGameData, tryCreateGameData } from '../gameData'
import { gameReducer } from '../game'
import { computeStats } from '../monster'
import { skillInField } from '../registries'
import {
  defined,
  held,
  makeBattleState,
  makeEnvironmentRawData,
  makeField,
  makeMonster,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleField,
  GameState,
  Monster,
  RawGameData
} from '../model'

/** Dữ liệu môi trường + thời tiết nguyên thủy, trait / skill / đồ cầm mẫu. Nước khắc hệ Bay × 2. */
function makePrimalRawData(): RawGameData {
  const raw = makeEnvironmentRawData()
  for (const element of raw.elements) {
    if (element.id === 'water') element.effectiveness = { ...element.effectiveness, flying: 2 }
  }
  raw.fieldEffects.push(
    {
      id: 'heavyRain',
      layer: 'weather',
      actsAs: ['rain'],
      primal: true,
      hooks: [
        { type: 'elementDamageMultiplier', params: { elementIds: ['water'], multiplier: 1.5 } },
        { type: 'blockElementSkills', params: { elementIds: ['fire'] } }
      ]
    },
    {
      id: 'winds',
      layer: 'weather',
      primal: true,
      hooks: [{ type: 'neutralizeWeakness', params: { elementIds: ['flying'] } }]
    }
  )
  raw.traits.push(
    {
      id: 'primalSea',
      kind: 'rare',
      hooks: [{ type: 'setFieldOnEntry', params: { layer: 'weather', fieldId: 'heavyRain' } }]
    },
    {
      id: 'stormVeil',
      kind: 'rare',
      hooks: [{ type: 'fieldDamageImmunity', params: { fieldIds: ['storm'] } }]
    },
    { id: 'mimic', kind: 'rare', hooks: mimicHooks() }
  )
  raw.skills.push(
    {
      id: 'ember',
      elementId: 'fire',
      category: 'special',
      power: 50,
      accuracy: 100,
      priority: 0,
      target: 'enemy',
      effects: []
    },
    {
      id: 'grassyField',
      elementId: 'normal',
      category: 'status',
      power: 0,
      accuracy: 100,
      priority: 0,
      target: 'self',
      effects: [{ type: 'setField', params: { layer: 'terrain', fieldId: 'grassy', turns: 2 } }]
    },
    {
      id: 'ballOfWeather',
      elementId: 'normal',
      category: 'special',
      power: 50,
      accuracy: 100,
      priority: 0,
      target: 'enemy',
      effects: [],
      fieldModifiers: [{ fieldId: 'rain', power: 100, elementId: 'water' }]
    }
  )
  raw.items.push(
    {
      id: 'dampStone',
      category: 'held',
      price: 10,
      persistent: true,
      hooks: [{ type: 'fieldDuration', params: { fieldIds: ['rain'], turns: 8 } }]
    },
    {
      id: 'umbrella',
      category: 'held',
      price: 10,
      persistent: true,
      hooks: [{ type: 'weatherShield', params: { weatherIds: ['rain'] } }]
    },
    {
      id: 'leafSeed',
      category: 'held',
      price: 10,
      hooks: [
        {
          type: 'trigger',
          params: {
            on: 'fieldChanged',
            scope: 'self',
            when: [{ if: 'fieldActive', layer: 'terrain', fieldIds: ['grassy'] }],
            effects: [{ do: 'stage', to: 'self', stats: ['defense'], delta: 1 }]
          }
        }
      ]
    }
  )
  return withFixtureText(raw)
}

/** Kiểu Mimicry: địa hình cỏ → hệ cỏ, hết địa hình → hệ cũ. */
function mimicHooks(): RawGameData['traits'][number]['hooks'] {
  return ['entry', 'fieldChanged'].flatMap((on) => [
    {
      type: 'trigger',
      params: {
        on,
        scope: 'self',
        effects: [{ do: 'identity', to: 'self', elementIds: ['grass'] }],
        when: [{ if: 'fieldActive', layer: 'terrain', fieldIds: ['grassy'] }]
      }
    },
    {
      type: 'trigger',
      params: {
        on,
        scope: 'self',
        effects: [{ do: 'identity', to: 'self', restoreElements: true }],
        when: [
          { if: 'not', condition: { if: 'fieldActive', layer: 'terrain', fieldIds: ['grassy'] } }
        ]
      }
    }
  ])
}

const data = createGameData(makePrimalRawData())

const skill = (slot: number, skillId: string, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const fighterSkills = ['idle', 'ember', 'splash', 'rainDance']
const terrainSkills = ['idle', 'grassyField']

const fighter = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, elementIds: ['ghost'], skillIds: fighterSkills, ...overrides })

const passive = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, elementIds: ['normal'], skillIds: ['idle'], ...overrides })

const battle = (party: Monster[], enemies: Monster[], field: BattleField): GameState =>
  makeBattleState(party, enemies, { field })

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  (state.battle?.log ?? []).filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const fieldOf = (state: GameState): BattleField => defined(state.battle, 'trận').field

const damageTo = (state: GameState, targetId: string): Extract<BattleEvent, { type: 'damage' }> =>
  defined(
    eventsOf(state, 'damage').find((event) => event.targetId === targetId),
    `sát thương lên ${targetId}`
  )

/** Phe ta: a mang Primordial Sea (giữ mưa nguyên thủy), b đánh, c dự bị. */
const primalBattle = (aTraits: string[] = ['primalSea']): GameState =>
  battle(
    [fighter('a', { traits: aTraits.map((id) => ({ id, level: 1 })) }), fighter('b'), fighter('c')],
    [passive('x'), passive('y')],
    makeField({ weather: 'heavyRain' })
  )

describe('thời tiết nguyên thủy (primal)', () => {
  it('chặn skill gây sát thương hệ bị chặn, skill hệ khác vẫn đánh và tính là mưa', () => {
    const next = turn(primalBattle(), skill(0, 'idle'), skill(1, 'ember'))
    expect(eventsOf(next, 'skillBlocked')).toEqual([
      { type: 'skillBlocked', monsterId: 'b', skillId: 'ember' }
    ])
    expect(eventsOf(next, 'damage')).toHaveLength(0)
    // actsAs: Weather Ball đổi theo mưa thành hệ nước khi đang mưa nguyên thủy.
    const ball = skillInField(data, makeField({ weather: 'heavyRain' }), data.skills.ballOfWeather)
    expect(ball.elementId).toBe('water')
  })

  it('môi trường thường không thay được (fieldFailed, giữ nguyên lớp); kéo dài không hạn', () => {
    const next = turn(primalBattle(), skill(0, 'idle'), skill(1, 'rainDance'))
    expect(eventsOf(next, 'fieldFailed')).toEqual([
      { type: 'fieldFailed', layer: 'weather', fieldId: 'rain', monsterId: 'b' }
    ])
    expect(fieldOf(next).weather).toEqual({ id: 'heavyRain', turnsLeft: null })
  })

  it('tan khi quái đặt rời sân (đổi quái); không ai giữ thì tan sau hành động đầu', () => {
    const switched = turn(
      primalBattle(),
      { slot: 0, kind: 'switch', monsterId: 'c' },
      skill(1, 'idle')
    )
    expect(eventsOf(switched, 'fieldEnded')).toEqual([
      { type: 'fieldEnded', layer: 'weather', fieldId: 'heavyRain' }
    ])
    expect(fieldOf(switched).weather.id).toBe('clear')
    const kept = turn(primalBattle(), skill(0, 'idle'), skill(1, 'idle'))
    expect(fieldOf(kept).weather.id).toBe('heavyRain')
    const unsustained = turn(primalBattle([]), skill(0, 'idle'), skill(1, 'idle'))
    expect(fieldOf(unsustained).weather.id).toBe('clear')
  })

  it('trait theo mưa (actsAs) có tác dụng trong mưa nguyên thủy', () => {
    const swimmer = fighter('s', { traits: [{ id: 'swimmer', level: 1 }] })
    const speedIn = (weather: string): string =>
      computeStats(data, swimmer, { field: makeField({ weather }) }).final.speed.toString()
    expect(speedIn('heavyRain')).toBe(speedIn('rain'))
    expect(speedIn('heavyRain')).not.toBe(speedIn('clear'))
  })

  it('gió bí ẩn: hệ Bay của bên nhận hết bị khắc (× 2 thành × 1)', () => {
    const flyer = (): Monster => passive('x', { elementIds: ['flying'] })
    const hit = (weather: string): GameState =>
      turn(battle([fighter('a')], [flyer()], makeField({ weather })), skill(0, 'splash'))
    expect(damageTo(hit('clear'), 'x').effectiveness).toBe(2)
    expect(damageTo(hit('winds'), 'x').effectiveness).toBe(1)
  })
})

describe('miễn sát thương theo môi trường (fieldIds)', () => {
  it('chỉ miễn môi trường có trong danh sách', () => {
    const veiled = (weather: string): GameState =>
      turn(
        battle(
          [fighter('a', { traits: [{ id: 'stormVeil', level: 1 }] })],
          [passive('x')],
          makeField({ weather })
        ),
        skill(0, 'idle')
      )
    expect(eventsOf(veiled('storm'), 'fieldDamage').map((e) => e.monsterId)).toEqual(['x'])
  })
})

describe('đồ cầm theo môi trường', () => {
  it('Damp Rock: quái cầm đặt mưa 8 lượt thay vì duration 5', () => {
    const withStone = turn(
      battle([fighter('a', { equipment: [held('dampStone')] })], [passive('x')], makeField()),
      skill(0, 'rainDance')
    )
    // Cuối lượt đặt đã giảm 1 lượt.
    expect(fieldOf(withStone).weather).toEqual({ id: 'rain', turnsLeft: 7 })
    const plain = turn(battle([fighter('a')], [passive('x')], makeField()), skill(0, 'rainDance'))
    expect(fieldOf(plain).weather).toEqual({ id: 'rain', turnsLeft: 4 })
  })

  it('Utility Umbrella: mưa không tăng sát thương lên quái cầm, trait theo mưa của nó tắt', () => {
    const hit = (weather: string, enemy: Monster): GameState =>
      turn(battle([fighter('a')], [enemy], makeField({ weather })), skill(0, 'splash'))
    const plainClear = damageTo(hit('clear', passive('x')), 'x').amount
    const plainRain = damageTo(hit('rain', passive('x')), 'x').amount
    const shielded = damageTo(hit('rain', passive('x', { equipment: [held('umbrella')] })), 'x')
    expect(plainRain.gt(plainClear)).toBe(true)
    expect(shielded.amount.eq(plainClear)).toBe(true)
    // Rain Dish của quái cầm ô không hồi máu trong mưa.
    const dish = (equipment: Monster['equipment']): GameState =>
      turn(
        battle(
          [fighter('a', { traits: [{ id: 'rainDish', level: 1 }], damageTaken: 20, equipment })],
          [passive('x')],
          makeField({ weather: 'rain' })
        ),
        skill(0, 'idle')
      )
    expect(eventsOf(dish([]), 'heal')).toHaveLength(1)
    expect(eventsOf(dish([held('umbrella')]), 'heal')).toHaveLength(0)
  })

  it('Seed: địa hình đổi sang đúng địa hình thì tăng bậc và mất đồ', () => {
    const next = turn(
      battle(
        [
          fighter('a', { skillIds: terrainSkills }),
          fighter('b', { equipment: [held('leafSeed')] })
        ],
        [passive('x')],
        makeField()
      ),
      skill(0, 'grassyField'),
      skill(1, 'idle')
    )
    expect(eventsOf(next, 'stage')).toContainEqual({
      type: 'stage',
      monsterId: 'b',
      stat: 'defense',
      delta: 1
    })
    expect(eventsOf(next, 'heldItemConsumed')).toEqual([
      { type: 'heldItemConsumed', monsterId: 'b', itemId: 'leafSeed' }
    ])
  })
})

describe('Mimicry (identity restoreElements)', () => {
  it('địa hình cỏ đổi hệ, hết địa hình về hệ cũ; hệ không đổi thì không log', () => {
    let state = battle(
      [
        fighter('a', { skillIds: terrainSkills }),
        fighter('b', { traits: [{ id: 'mimic', level: 1 }] })
      ],
      [passive('x')],
      makeField()
    )
    state = turn(state, skill(0, 'grassyField'), skill(1, 'idle'))
    const b = (s: GameState): Monster =>
      defined(
        s.party.find((m) => m.id === 'b'),
        'b'
      )
    expect(b(state).elementIds).toEqual(['grass'])
    state = turn(state, skill(0, 'idle'), skill(1, 'idle'))
    expect(fieldOf(state).terrain.id).toBe('none')
    expect(b(state).elementIds).toEqual(['ghost'])
    // Log tích lũy cả trận: đổi sang cỏ rồi về hệ cũ.
    const raceId = b(state).raceId
    expect(eventsOf(state, 'identityChanged')).toEqual([
      { type: 'identityChanged', monsterId: 'b', elementIds: ['grass'], raceId },
      { type: 'identityChanged', monsterId: 'b', elementIds: ['ghost'], raceId }
    ])
    // Đặt lại địa hình khi đã là hệ cỏ: chỉ thêm một lần đổi.
    const again = turn(
      turn(state, skill(0, 'grassyField'), skill(1, 'idle')),
      skill(0, 'grassyField'),
      skill(1, 'idle')
    )
    expect(eventsOf(again, 'identityChanged')).toHaveLength(3)
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesOf = (edit: (raw: RawGameData) => void): string[] => {
    const raw = makePrimalRawData()
    edit(raw)
    const result = tryCreateGameData(withFixtureText(raw))
    return result.ok ? [] : result.issues
  }
  const fieldById = (raw: RawGameData, id: string): RawGameData['fieldEffects'][number] =>
    defined(
      raw.fieldEffects.find((field) => field.id === id),
      id
    )

  it('dữ liệu mẫu hợp lệ', () => {
    expect(issuesOf(() => {})).toEqual([])
  })

  it('actsAs sai lớp / chính nó / lồng; primal có duration hoặc ở lớp side', () => {
    expect(issuesOf((raw) => (fieldById(raw, 'heavyRain').actsAs = ['grassy']))).toContainEqual(
      'Môi trường "heavyRain": actsAs: "grassy" không thuộc lớp weather'
    )
    expect(issuesOf((raw) => (fieldById(raw, 'heavyRain').actsAs = ['heavyRain']))).toContainEqual(
      'Môi trường "heavyRain": actsAs không được chứa chính nó'
    )
    expect(
      issuesOf((raw) => {
        fieldById(raw, 'rain').actsAs = ['sun']
      })
    ).toContainEqual('Môi trường "heavyRain": actsAs "rain" cũng có actsAs (không lồng)')
    expect(issuesOf((raw) => (fieldById(raw, 'heavyRain').duration = 5))).toContainEqual(
      'Môi trường "heavyRain": môi trường primal không có duration (kéo dài theo quái đặt)'
    )
    expect(issuesOf((raw) => (fieldById(raw, 'heavyRain').layer = 'side'))).toContainEqual(
      'Môi trường "heavyRain": primal chỉ dùng cho thời tiết / địa hình'
    )
  })

  it('fieldDuration cần đúng một trong fieldIds / layer; weatherShield chỉ thời tiết', () => {
    const setHook = (raw: RawGameData, itemId: string, params: Record<string, unknown>): void => {
      const item = defined(
        raw.items.find((entry) => entry.id === itemId),
        itemId
      )
      if (item.category === 'held') item.hooks[0].params = params
    }
    expect(
      issuesOf((raw) => setHook(raw, 'dampStone', { turns: 8 })).some((issue) =>
        issue.includes('cần đúng một trong fieldIds / layer')
      )
    ).toBe(true)
    expect(
      issuesOf((raw) => setHook(raw, 'umbrella', { weatherIds: ['grassy'] })).some((issue) =>
        issue.includes('"grassy" không thuộc lớp weather')
      )
    ).toBe(true)
  })
})
