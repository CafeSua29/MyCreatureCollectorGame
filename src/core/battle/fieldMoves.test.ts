// Chiêu "hiệu ứng sân" kiểu Pokémon (mục "Skill" và "Môi trường" ở battle-environment.md): mục tiêu allAllies,
// chữa trạng thái, Haze, dọn / đổi hiệu ứng theo phe và địa hình, đổi bậc theo hệ, room làm mới /
// đổi hệ / chặn đổi quái, chặn chí mạng, guard, nhân tiền, AI, kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { SKILL_EFFECTS } from '../registries'
import { toBig } from '../shared'
import {
  dataIssues,
  defined,
  expectActionError,
  makeBattleState,
  makeField,
  makeFieldMoveData,
  makeFieldMoveRawData,
  makeMonster,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleField,
  GameData,
  GameState,
  Monster
} from '../model'

const data: GameData = makeFieldMoveData()

const turn = (state: GameState, ...commands: BattleCommand[]): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands })

const skillCommand = (slot: number, skillId: string, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})

// Quái ta luôn biết thêm idle để ra lệnh đứng yên.
const ally = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, ...overrides, skillIds: [...(overrides.skillIds ?? []), 'idle'] })

// Địch mặc định chỉ đứng yên để không làm lệch kết quả.
const foe = (id: string, overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ id, skillIds: ['idle'], ...overrides })

const battleOf = (state: GameState): NonNullable<GameState['battle']> =>
  defined(state.battle, 'trận')

const eventsOf = <T extends BattleEvent['type']>(
  state: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] =>
  battleOf(state).log.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

const member = (state: GameState, id: string): Monster =>
  defined(
    state.party.find((m) => m.id === id),
    `quái ${id}`
  )

const scene = (party: Monster[], enemies: Monster[], field?: BattleField): GameState =>
  makeBattleState(party, enemies, field ? { field } : {})

describe('mục tiêu allAllies', () => {
  it('hiệu ứng lên quái dùng và đồng đội; không có đồng đội thì chỉ quái dùng', () => {
    const state = scene([ally('a', { skillIds: ['howl'] }), ally('b')], [foe('e1')])
    const after = turn(state, skillCommand(0, 'howl'), skillCommand(1, 'idle'))
    expect(battleOf(after).stages).toEqual({ a: { attack: 1 }, b: { attack: 1 } })

    const solo = scene(
      [ally('a', { skillIds: ['howl'] }), ally('b', { damageTaken: 50 })],
      [foe('e1')]
    )
    expect(battleOf(turn(solo, skillCommand(0, 'howl'))).stages).toEqual({ a: { attack: 1 } })
  })

  it('hồi máu + chữa trạng thái cả hai (kiểu Jungle Healing)', () => {
    const poisoned = { statuses: [{ statusId: 'poison', turnsLeft: 3 }], damageTaken: 20 }
    const state = scene(
      [ally('a', { skillIds: ['jungleHealing'], ...poisoned }), ally('b', poisoned)],
      [foe('e1')]
    )
    const after = turn(state, skillCommand(0, 'jungleHealing'), skillCommand(1, 'idle'))
    for (const id of ['a', 'b']) expect(member(after, id).statuses).toEqual([])
    // Hồi 13 rồi độc cuối lượt không còn.
    expect(member(after, 'b').damageTaken.toNumber()).toBe(7)
    expect(eventsOf(after, 'statusCured').map((e) => e.monsterId)).toEqual(['a', 'b'])
  })

  it('AI có lựa chọn allAllies và chấm điểm hiệu ứng cả hai quái', () => {
    const state = scene(
      [ally('a', { skillIds: ['howl'] }), ally('b')],
      [foe('e1', { skillIds: ['howl'] }), foe('e2')]
    )
    const after = turn(state, skillCommand(0, 'idle'), skillCommand(1, 'idle'))
    expect(battleOf(after).stages.e1).toEqual({ attack: 1 })
    expect(battleOf(after).stages.e2).toEqual({ attack: 1 })
  })
})

describe('chữa trạng thái cả đội (kiểu Heal Bell)', () => {
  it('chữa cả quái dự bị; aiValue = tổng trọng số trạng thái của phe mình', () => {
    const poisoned = { statuses: [{ statusId: 'poison', turnsLeft: 3 }] }
    const state = scene(
      [ally('a', { skillIds: ['healBell'] }), ally('b'), ally('c', poisoned)],
      [foe('e1', poisoned)]
    )
    const after = turn(state, skillCommand(0, 'healBell'), skillCommand(1, 'idle'))
    expect(member(after, 'c').statuses).toEqual([])
    expect(battleOf(after).enemies[0].statuses).not.toEqual([])

    const value = SKILL_EFFECTS.cureTeamStatus.aiValue(
      {},
      {
        data,
        user: ally('a'),
        target: ally('a'),
        targetIsAlly: true,
        stages: {},
        expectedDamage: toBig(0),
        field: makeField(),
        side: 'player',
        allies: [ally('a')],
        foes: [],
        allyReserves: [ally('c', poisoned)],
        foeReserves: []
      }
    )
    expect(value).toBeCloseTo(data.config.ai.statusWeights.poison)
  })
})

describe('Haze và đổi bậc theo hệ', () => {
  it('Haze xóa bậc của mọi quái trên sân; aiValue theo bậc địch trừ bậc ta', () => {
    const state = makeBattleState([ally('a', { skillIds: ['haze'] }), ally('b')], [foe('e1')], {
      stages: { a: { attack: -1 }, e1: { attack: 2 } }
    })
    const after = turn(state, skillCommand(0, 'haze'), skillCommand(1, 'idle'))
    expect(battleOf(after).stages).toEqual({})
    expect(
      eventsOf(after, 'stagesReset')
        .map((e) => e.monsterId)
        .sort()
    ).toEqual(['a', 'e1'])

    const ctx = {
      data,
      user: ally('a'),
      target: ally('a'),
      targetIsAlly: true,
      stages: { a: { attack: -1 }, e1: { attack: 2 } },
      expectedDamage: toBig(0),
      field: makeField(),
      side: 'player' as const,
      allies: [ally('a')],
      foes: [foe('e1')],
      allyReserves: [],
      foeReserves: []
    }
    expect(SKILL_EFFECTS.resetStages.aiValue({}, ctx)).toBeCloseTo(
      3 * data.config.ai.stageValuePerStep
    )
  })

  it('Flower Shield: chỉ quái hệ cỏ (cả hai phe) được +1 thủ', () => {
    const state = scene(
      [ally('a', { skillIds: ['flowerShield'] }), ally('b', { elementIds: ['water'] })],
      [foe('e1')]
    )
    const after = turn(state, skillCommand(0, 'flowerShield'), skillCommand(1, 'idle'))
    expect(battleOf(after).stages).toEqual({ a: { defense: 1 }, e1: { defense: 1 } })
  })
})

describe('dọn / đổi hiệu ứng theo phe và địa hình', () => {
  const field = makeField({
    terrain: 'grassy',
    sides: {
      player: [
        { id: 'spikes', turnsLeft: null, layers: 2 },
        { id: 'reflect', turnsLeft: 3, layers: 1 }
      ],
      enemy: [
        { id: 'reflect', turnsLeft: 3, layers: 1 },
        { id: 'rocks', turnsLeft: null, layers: 1 }
      ]
    }
  })

  it('Defog: dọn mọi hiệu ứng phe địch, chỉ bẫy phe mình, địa hình về mặc định', () => {
    const state = scene([ally('a', { skillIds: ['defog'] }), ally('b')], [foe('e1')], field)
    const after = turn(state, skillCommand(0, 'defog'), skillCommand(1, 'idle'))
    const { sides, terrain } = battleOf(after).field
    expect(sides.enemy).toEqual([])
    expect(sides.player.map((e) => e.id)).toEqual(['reflect'])
    expect(terrain.id).toBe('none')
    expect(eventsOf(after, 'fieldRemoved')).toEqual([
      { type: 'fieldRemoved', layer: 'terrain', fieldId: 'grassy', monsterId: 'a' }
    ])
    expect(eventsOf(after, 'sideFieldRemoved')).toHaveLength(3)
  })

  it('Rapid Spin: đánh rồi dọn bẫy phe mình', () => {
    const state = scene([ally('a', { skillIds: ['rapidSpin'] }), ally('b')], [foe('e1')], field)
    const after = turn(state, skillCommand(0, 'rapidSpin'), skillCommand(1, 'idle'))
    expect(battleOf(after).field.sides.player.map((e) => e.id)).toEqual(['reflect'])
    expect(battleOf(after).field.sides.enemy).toHaveLength(2)
  })

  it('Court Change: đổi hiệu ứng hai phe, giữ tầng', () => {
    const state = scene([ally('a', { skillIds: ['courtChange'] }), ally('b')], [foe('e1')], field)
    const after = turn(state, skillCommand(0, 'courtChange'), skillCommand(1, 'idle'))
    expect(battleOf(after).field.sides.player.map((e) => e.id)).toEqual(['reflect', 'rocks'])
    expect(battleOf(after).field.sides.enemy[0]).toMatchObject({ id: 'spikes', layers: 2 })
  })

  it('dọn khi không có gì: không log', () => {
    const state = scene([ally('a', { skillIds: ['defog'] }), ally('b')], [foe('e1')])
    const after = turn(state, skillCommand(0, 'defog'), skillCommand(1, 'idle'))
    expect(eventsOf(after, 'fieldRemoved')).toEqual([])
    expect(eventsOf(after, 'sideFieldRemoved')).toEqual([])
  })
})

describe('room mới', () => {
  it('Mud Sport giảm sát thương hệ thường; đặt lại thì làm mới thời hạn, không tắt', () => {
    const attacker = foe('e1', { skillIds: ['strike'] })
    const plain = turn(
      scene([ally('a'), ally('b')], [attacker]),
      skillCommand(0, 'idle'),
      skillCommand(1, 'idle')
    )
    const muddy = makeField({ rooms: [{ id: 'mudSport', turnsLeft: 2 }] })
    const reduced = turn(
      scene([ally('a', { skillIds: ['mudSportMove'] }), ally('b')], [attacker], muddy),
      skillCommand(0, 'mudSportMove'),
      skillCommand(1, 'idle')
    )
    const total = (state: GameState): number =>
      eventsOf(state, 'damage').reduce((sum, e) => sum + e.amount.toNumber(), 0)
    expect(total(reduced)).toBeLessThan(total(plain))
    // Làm mới về 5 rồi giảm 1 cuối lượt.
    expect(battleOf(reduced).field.rooms).toEqual([{ id: 'mudSport', turnsLeft: 4 }])
    expect(eventsOf(reduced, 'roomRemoved')).toEqual([])
  })

  it('Ion Deluge: skill hệ thường thành hệ lửa trong lượt dùng (lửa đánh cỏ × 2), hết sau lượt', () => {
    const state = scene(
      [ally('a', { skillIds: ['ionDelugeMove'] }), ally('b', { skillIds: ['strike'] })],
      [foe('e1')]
    )
    const after = turn(state, skillCommand(0, 'ionDelugeMove'), skillCommand(1, 'strike'))
    expect(eventsOf(after, 'useSkill').find((e) => e.monsterId === 'b')).toMatchObject({
      elementId: 'fire'
    })
    expect(eventsOf(after, 'damage')[0].effectiveness).toBe(2)
    expect(battleOf(after).field.rooms).toEqual([])
  })

  it('Fairy Lock: lượt sau không đổi quái, không chạy trốn; thay quái gục vẫn được', () => {
    const state = scene(
      [ally('a', { skillIds: ['fairyLockMove'] }), ally('b'), ally('c')],
      [foe('e1')]
    )
    const locked = turn(state, skillCommand(0, 'fairyLockMove'), skillCommand(1, 'idle'))
    expectActionError(
      () => turn(locked, { slot: 0, kind: 'switch', monsterId: 'c' }, skillCommand(1, 'idle')),
      'escapeBlocked',
      { fieldId: 'fairyLock' }
    )
    expectActionError(() => gameReducer(data, locked, { type: 'flee' }), 'escapeBlocked', {
      fieldId: 'fairyLock'
    })
    // Hết sau 2 lượt.
    const free = turn(locked, skillCommand(0, 'idle'), skillCommand(1, 'idle'))
    expect(battleOf(free).field.rooms).toEqual([])
  })
})

describe('hiệu ứng theo phe mới', () => {
  function critRaw(): GameData {
    const raw = makeFieldMoveRawData()
    raw.config.battle.critChance = 100
    return createGameData(withFixtureText(raw))
  }

  it('Lucky Chant: đòn vào phe đó không chí mạng', () => {
    const critData = critRaw()
    const attacker = foe('e1', { skillIds: ['strike'] })
    const field = makeField({ sides: { player: [{ id: 'luckyChant', turnsLeft: 3, layers: 1 }] } })
    const run = (f?: BattleField): boolean[] => {
      const after = gameReducer(critData, scene([ally('a'), ally('b')], [attacker], f), {
        type: 'submitTurn',
        commands: [skillCommand(0, 'idle'), skillCommand(1, 'idle')]
      })
      return eventsOf(after, 'damage').map((e) => e.critical)
    }
    expect(run()).toEqual([true])
    expect(run(field)).toEqual([false])
  })

  it('Wide Guard chặn skill nhắm mọi địch, không chặn skill một mục tiêu', () => {
    const field = makeField({ sides: { player: [{ id: 'wideGuard', turnsLeft: 1, layers: 1 }] } })
    const spread = turn(
      scene([ally('a'), ally('b')], [foe('e1', { skillIds: ['wave'] })], field),
      skillCommand(0, 'idle'),
      skillCommand(1, 'idle')
    )
    expect(eventsOf(spread, 'protectedByField')).toHaveLength(2)
    expect(eventsOf(spread, 'damage')).toEqual([])
    const single = turn(
      scene([ally('a'), ally('b')], [foe('e1', { skillIds: ['strike'] })], field),
      skillCommand(0, 'idle'),
      skillCommand(1, 'idle')
    )
    expect(eventsOf(single, 'damage')).toHaveLength(1)
  })

  it('Quick Guard đặt trước (priority 3) chặn skill priority ≥ 1 ngay trong lượt', () => {
    const state = scene(
      [ally('a', { skillIds: ['quickGuardMove'] }), ally('b')],
      [foe('e1', { skillIds: ['quick'] })]
    )
    const after = turn(state, skillCommand(0, 'quickGuardMove'), skillCommand(1, 'idle'))
    expect(eventsOf(after, 'protectedByField')).toHaveLength(1)
    // Hết sau lượt dùng.
    expect(battleOf(after).field.sides.player).toEqual([])
  })

  it('Happy Hour: thắng trận nhận gấp đôi tiền', () => {
    const weak = foe('e1', { damageTaken: 49 })
    const won = (field?: BattleField): number => {
      const state = scene([ally('a', { skillIds: ['strike'] }), ally('b')], [weak], field)
      const after = turn(state, skillCommand(0, 'strike'), skillCommand(1, 'idle'))
      return defined(eventsOf(after, 'won')[0], 'thắng').money.toNumber()
    }
    const happy = makeField({
      sides: { player: [{ id: 'happyHour', turnsLeft: null, layers: 1 }] }
    })
    expect(won(happy)).toBe(won() * 2)
  })
})

describe('dữ liệu chiêu sân', () => {
  it('báo lỗi params / lớp / mục tiêu sai', () => {
    const raw = makeFieldMoveRawData()
    raw.fieldEffects.push(
      { id: 'badReuse', layer: 'side', onReuse: 'refresh', hooks: [] },
      { id: 'badReuse2', layer: 'room', duration: 2, onReuse: 'twice' as 'refresh', hooks: [] },
      {
        id: 'badGuard',
        layer: 'side',
        hooks: [{ type: 'protectFrom', params: { targets: ['self'], minPriority: 0.5 } }]
      },
      {
        id: 'badConvert',
        layer: 'room',
        duration: 1,
        hooks: [
          { type: 'convertElement', params: { fromElementIds: ['normal'], elementId: 'lava' } }
        ]
      }
    )
    const base = { elementId: 'normal', accuracy: 100, priority: 0, effects: [] }
    raw.skills.push(
      { ...base, id: 'hurtAllies', category: 'physical', power: 40, target: 'allAllies' },
      {
        ...base,
        id: 'cureFoe',
        category: 'status',
        power: 0,
        target: 'enemy',
        effects: [{ type: 'cureStatus', params: {} }]
      },
      {
        ...base,
        id: 'subFoe',
        category: 'status',
        power: 0,
        target: 'enemy',
        effects: [{ type: 'substitute', params: { hpCostPercent: 25 } }]
      },
      {
        ...base,
        id: 'badShield',
        category: 'status',
        power: 0,
        target: 'self',
        effects: [{ type: 'fieldStatStage', params: { stats: ['hp'], delta: 0, elementIds: [] } }]
      },
      {
        ...base,
        id: 'badFirst',
        category: 'physical',
        power: 40,
        target: 'enemy',
        firstTurnOnly: false as unknown as true
      },
      {
        ...base,
        id: 'badPass',
        category: 'status',
        power: 0,
        target: 'self',
        effects: [{ type: 'switchOut', params: { passOn: 'stages' } }]
      }
    )
    const issues = dataIssues(withFixtureText(raw)).join('\n')
    expect(issues).toMatch(/"badReuse".*onReuse chỉ dùng cho lớp room/)
    expect(issues).toMatch(/"badReuse2".*onReuse phải là/)
    expect(issues).toMatch(/"badGuard".*targets phải là/)
    expect(issues).toMatch(/"badGuard".*minPriority/)
    expect(issues).toMatch(/"badConvert".*elementId/)
    expect(issues).toMatch(/"hurtAllies".*phải nhắm địch/)
    expect(issues).toMatch(/"cureFoe".*chỉ dùng cho skill nhắm phe mình/)
    expect(issues).toMatch(/"subFoe".*chỉ dùng cho skill nhắm self/)
    expect(issues).toMatch(/"badShield".*stats phải là/)
    expect(issues).toMatch(/"badShield".*delta/)
    expect(issues).toMatch(/"badFirst".*firstTurnOnly chỉ được là true/)
    expect(issues).toMatch(/"badPass".*passOn phải là/)
  })
})
