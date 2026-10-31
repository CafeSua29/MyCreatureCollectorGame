// Hook trait lượt và hành động (registries/actionTraitHooks.ts): priority theo loại skill
// (Prankster, kể cả Quick Guard), đi sau trong cùng mức priority (Stall, kể cả Trick Room), mất
// lượt xen kẽ (Truant) / theo tỉ lệ, dùng skill ngẫu nhiên; cấp trait; kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeField,
  makeFieldMoveRawData,
  makeMonster,
  makeRoomRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import type {
  BattleCommand,
  BattleEvent,
  BattleField,
  BattleState,
  GameData,
  GameState,
  Monster,
  RawGameData,
  TraitDef
} from '../model'

function trait(id: string, type: string, params: unknown): TraitDef {
  return { id, kind: 'negative', hooks: [{ type, params }] }
}

const TRAITS: TraitDef[] = [
  {
    ...trait('prankster', 'priorityModifier', { skillCategory: 'status', amount: 1 }),
    kind: 'rare'
  },
  {
    ...trait('darkPrankster', 'priorityModifier', {
      skillCategory: 'status',
      amount: 1,
      failsAgainstElementIds: ['ghost']
    }),
    kind: 'rare'
  },
  trait('stall', 'actLast', {}),
  trait('truant', 'skipEveryOtherTurn', {}),
  trait('animosity', 'skipTurnChance', { chance: 10 }),
  trait('rampage', 'randomSkillChance', { chance: 25 })
]

const withActionTraits = (raw: RawGameData): GameData => {
  raw.traits.push(...TRAITS)
  return createGameData(withFixtureText(raw))
}

const data = withActionTraits(makeFieldMoveRawData())
const roomData = withActionTraits(makeRoomRawData())

type TraitList = (string | [string, number])[]

/** Quái mẫu: tốc độ gen cho trước, máu rất lớn để không gục giữa các lượt. */
function fighter(
  id: string,
  {
    speed = 10,
    traits = [],
    skillIds = ['idle', 'strike']
  }: Partial<{
    speed: number
    traits: TraitList
    skillIds: string[]
  }> = {}
): Monster {
  return makeMonster({
    id,
    skillIds,
    genes: toBigStats({ ...uniformStats(10), hp: '1e6', speed }),
    traits: traits.map((entry) =>
      typeof entry === 'string' ? { id: entry, level: 1 } : { id: entry[0], level: entry[1] }
    )
  })
}

const cast = (slot: number, skillId: string, target = 0): BattleCommand => ({
  slot,
  kind: 'skill',
  skillId,
  target
})
const run = (state: GameState, commands: BattleCommand[], gameData = data): GameState =>
  gameReducer(gameData, state, { type: 'submitTurn', commands })

const battleOf = (state: GameState): BattleState => defined(state.battle, 'trận')

/** Sự kiện loại `type` của lượt vừa xử lý (log cộng dồn qua các lượt). */
function eventsOfTurn<T extends BattleEvent['type']>(
  before: GameState,
  after: GameState,
  type: T
): Extract<BattleEvent, { type: T }>[] {
  return battleOf(after)
    .log.slice(battleOf(before).log.length)
    .filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type)
}

/** Thứ tự quái dùng skill trong một lượt. */
function skillOrder(state: GameState, commands: BattleCommand[], gameData = data): string[] {
  return eventsOfTurn(state, run(state, commands, gameData), 'useSkill').map((e) => e.monsterId)
}

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1)
const withSeed = (state: GameState, seed: number): GameState => ({ ...state, rng: seed })

describe('priorityModifier (Prankster)', () => {
  it('skill đúng loại được cộng priority, loại khác thì không', () => {
    const state = makeBattleState(
      [fighter('a', { traits: ['prankster'] })],
      [fighter('e1', { speed: 100, skillIds: ['idle'] })]
    )
    expect(skillOrder(state, [cast(0, 'idle')])).toEqual(['a', 'e1'])
    expect(skillOrder(state, [cast(0, 'strike')])).toEqual(['e1', 'a'])
  })

  it('priority không đổi theo cấp trait', () => {
    // Cấp 50: vẫn +1 nên idle (0 + 1) ngang quick (1) của địch nhanh hơn: địch đi trước.
    const state = makeBattleState(
      [fighter('a', { traits: [['prankster', 50]] })],
      [fighter('e1', { speed: 100, skillIds: ['quick'] })]
    )
    expect(skillOrder(state, [cast(0, 'idle')])).toEqual(['e1', 'a'])
  })

  it('Quick Guard chặn skill được trait đẩy lên priority 1', () => {
    const guarded: BattleField = makeField({
      sides: { player: [{ id: 'quickGuard', turnsLeft: 1, layers: 1 }] }
    })
    const scene = (traits: TraitList): GameState =>
      makeBattleState([fighter('a')], [fighter('e1', { traits, skillIds: ['growl'] })], {
        field: guarded
      })
    const boosted = scene(['prankster'])
    const afterBoosted = run(boosted, [cast(0, 'idle')])
    expect(eventsOfTurn(boosted, afterBoosted, 'protectedByField')).toHaveLength(1)
    expect(battleOf(afterBoosted).stages).toEqual({})

    const plain = scene([])
    const afterPlain = run(plain, [cast(0, 'idle')])
    expect(eventsOfTurn(plain, afterPlain, 'protectedByField')).toEqual([])
    expect(battleOf(afterPlain).stages).toEqual({ a: { attack: -1 } })
  })
})

describe('priorityModifier: thất bại trước hệ (Prankster trước Bóng tối)', () => {
  const scene = (enemyElements: string[], skillIds = ['growl', 'strike']): GameState =>
    makeBattleState(
      [fighter('a', { traits: ['darkPrankster'], skillIds })],
      [{ ...fighter('e1', { skillIds: ['idle'] }), elementIds: enemyElements }]
    )

  it('skill được cộng priority không có tác dụng lên địch mang hệ đó', () => {
    const state = scene(['ghost'])
    const after = run(state, [cast(0, 'growl')])
    expect(eventsOfTurn(state, after, 'boostUnaffected')).toEqual([
      { type: 'boostUnaffected', monsterId: 'e1', userId: 'a', traitId: 'darkPrankster' }
    ])
    expect(battleOf(after).stages).toEqual({})
  })

  it('địch không mang hệ đó, hoặc skill không được cộng priority: như thường', () => {
    const plain = scene(['fire'])
    const afterPlain = run(plain, [cast(0, 'growl')])
    expect(eventsOfTurn(plain, afterPlain, 'boostUnaffected')).toEqual([])
    expect(battleOf(afterPlain).stages).toEqual({ e1: { attack: -1 } })

    const ghost = scene(['ghost'])
    const afterStrike = run(ghost, [cast(0, 'strike')])
    expect(eventsOfTurn(ghost, afterStrike, 'boostUnaffected')).toEqual([])
  })
})

describe('actLast (Stall)', () => {
  const scene = (player: Monster, enemy: Monster, field?: BattleField): GameState =>
    makeBattleState([player], [enemy], field ? { field } : {})

  it('đi sau dù nhanh hơn; priority vẫn thắng', () => {
    const state = scene(
      fighter('a', { speed: 100, traits: ['stall'], skillIds: ['idle', 'quick'] }),
      fighter('e1', { speed: 1, skillIds: ['idle'] })
    )
    expect(skillOrder(state, [cast(0, 'idle')])).toEqual(['e1', 'a'])
    expect(skillOrder(state, [cast(0, 'quick')])).toEqual(['a', 'e1'])
  })

  it('hai quái cùng mang trait thì so tốc độ như thường', () => {
    const state = scene(
      fighter('a', { speed: 100, traits: ['stall'] }),
      fighter('e1', { speed: 1, traits: ['stall'], skillIds: ['idle'] })
    )
    expect(skillOrder(state, [cast(0, 'idle')])).toEqual(['a', 'e1'])
  })

  it('Trick Room: quái chậm mang trait vẫn đi sau', () => {
    const trickRoom = makeField({ rooms: [{ id: 'trickRoom', turnsLeft: 5 }] })
    const commands = [cast(0, 'idle')]
    const plain = scene(fighter('a', { speed: 1 }), fighter('e1', { speed: 100 }), trickRoom)
    expect(skillOrder(plain, commands, roomData)).toEqual(['a', 'e1'])
    const stalled = scene(
      fighter('a', { speed: 1, traits: ['stall'] }),
      fighter('e1', { speed: 100, skillIds: ['idle'] }),
      trickRoom
    )
    expect(skillOrder(stalled, commands, roomData)).toEqual(['e1', 'a'])
  })
})

describe('skipEveryOtherTurn (Truant)', () => {
  const party = (): Monster[] => [fighter('a', { traits: ['truant'] }), fighter('b'), fighter('c')]
  const enemies = [fighter('e1', { skillIds: ['idle'] })]

  it('lượt đầu đánh, lượt sau nghỉ, xen kẽ', () => {
    const turn1 = makeBattleState(party(), enemies)
    const turn2 = run(turn1, [cast(0, 'strike'), cast(1, 'idle')])
    expect(eventsOfTurn(turn1, turn2, 'traitSkipTurn')).toEqual([])
    const turn3 = run(turn2, [cast(0, 'strike'), cast(1, 'idle')])
    expect(eventsOfTurn(turn2, turn3, 'traitSkipTurn')).toEqual([
      { type: 'traitSkipTurn', monsterId: 'a', traitId: 'truant' }
    ])
    const users = eventsOfTurn(turn2, turn3, 'useSkill').map((e) => e.monsterId)
    expect(users.sort()).toEqual(['b', 'e1'])
    const turn4 = run(turn3, [cast(0, 'strike'), cast(1, 'idle')])
    expect(eventsOfTurn(turn3, turn4, 'traitSkipTurn')).toEqual([])
  })

  it('lượt nghỉ vẫn đổi quái được; vào sân lại thì đếm lại từ đầu', () => {
    const turn1 = makeBattleState(party(), enemies)
    const turn2 = run(turn1, [cast(0, 'strike'), cast(1, 'idle')])
    const turn3 = run(turn2, [{ slot: 0, kind: 'switch', monsterId: 'c' }, cast(1, 'idle')])
    expect(battleOf(turn3).playerSlots[0]).toBe('c')
    const turn4 = run(turn3, [{ slot: 0, kind: 'switch', monsterId: 'a' }, cast(1, 'idle')])
    // Lượt 4: theo lần ra sân đầu thì là lượt nghỉ, nhưng a vừa vào lại nên được đánh.
    const turn5 = run(turn4, [cast(0, 'strike'), cast(1, 'idle')])
    expect(eventsOfTurn(turn4, turn5, 'traitSkipTurn')).toEqual([])
    expect(eventsOfTurn(turn4, turn5, 'useSkill').map((e) => e.monsterId)).toContain('a')
  })
})

describe('skipTurnChance', () => {
  // Cấp 46: 10% × (1 + 0,2 × 45) = 100%: luôn mất lượt.
  it('tỉ lệ kẹp 100 theo cấp; mất lượt vì trait thì không tung trạng thái', () => {
    for (const level of [46, 1e6]) {
      const asleep = makeMonster({
        ...fighter('a', { traits: [['animosity', level]] }),
        statuses: [{ statusId: 'sleep', turnsLeft: 3 }]
      })
      const state = makeBattleState([asleep], [fighter('e1', { skillIds: ['idle'] })])
      const after = run(state, [cast(0, 'strike')])
      expect(eventsOfTurn(state, after, 'traitSkipTurn')).toEqual([
        { type: 'traitSkipTurn', monsterId: 'a', traitId: 'animosity' }
      ])
      expect(eventsOfTurn(state, after, 'statusSkipTurn')).toEqual([])
    }
  })

  it('cấp 1 (10%): có seed mất lượt, có seed không; cùng seed cùng kết quả', () => {
    const state = makeBattleState(
      [fighter('a', { traits: ['animosity'] })],
      [fighter('e1', { skillIds: ['idle'] })]
    )
    const skipped = SEEDS.map((seed) => {
      const seeded = withSeed(state, seed)
      const once = eventsOfTurn(seeded, run(seeded, [cast(0, 'strike')]), 'traitSkipTurn')
      expect(eventsOfTurn(seeded, run(seeded, [cast(0, 'strike')]), 'traitSkipTurn')).toEqual(once)
      return once.length > 0
    })
    expect(skipped).toContain(true)
    expect(skipped).toContain(false)
  })
})

describe('randomSkillChance', () => {
  // Cấp 16: 25% × (1 + 0,2 × 15) = 100%: luôn dùng skill ngẫu nhiên.
  const sure: [string, number] = ['rampage', 16]
  const foes = (): Monster[] => [
    fighter('e1', { skillIds: ['idle'] }),
    fighter('e2', { skillIds: ['idle'] })
  ]

  it('chọn đều trong mọi skill (kể cả skill đã chọn); log rồi dùng đúng skill đó', () => {
    const state = makeBattleState([fighter('a', { traits: [sure] })], foes())
    const used = SEEDS.map((seed) => {
      const seeded = withSeed(state, seed)
      const after = run(seeded, [cast(0, 'idle')])
      const [random] = eventsOfTurn(seeded, after, 'traitRandomSkill')
      const skillId = defined(random, 'traitRandomSkill').skillId
      expect(random).toEqual({
        type: 'traitRandomSkill',
        monsterId: 'a',
        traitId: 'rampage',
        skillId
      })
      const ownUse = eventsOfTurn(seeded, after, 'useSkill').filter((e) => e.monsterId === 'a')
      expect(ownUse.map((e) => e.skillId)).toEqual([skillId])
      return skillId
    })
    expect(new Set(used)).toEqual(new Set(['idle', 'strike']))
  })

  it('mục tiêu một địch chọn đều trong địch còn sống trên sân', () => {
    const state = makeBattleState([fighter('a', { traits: [sure], skillIds: ['strike'] })], foes())
    const targets = SEEDS.map((seed) => {
      const seeded = withSeed(state, seed)
      const [damage] = eventsOfTurn(seeded, run(seeded, [cast(0, 'strike', 0)]), 'damage')
      return defined(damage, 'damage').targetId
    })
    expect(new Set(targets)).toEqual(new Set(['e1', 'e2']))
  })

  it('cấp 1 (25%): có seed đổi lệnh, có seed giữ lệnh', () => {
    const state = makeBattleState([fighter('a', { traits: ['rampage'] })], foes())
    const triggered = SEEDS.map((seed) => {
      const seeded = withSeed(state, seed)
      return eventsOfTurn(seeded, run(seeded, [cast(0, 'idle')]), 'traitRandomSkill').length > 0
    })
    expect(triggered).toContain(true)
    expect(triggered).toContain(false)
  })

  it('mất lượt thì không tung skill ngẫu nhiên', () => {
    const state = makeBattleState(
      [fighter('a', { traits: [sure, ['animosity', 46]] })],
      [fighter('e1', { skillIds: ['idle'] })]
    )
    const after = run(state, [cast(0, 'idle')])
    expect(eventsOfTurn(state, after, 'traitRandomSkill')).toEqual([])
  })
})

describe('kiểm tra dữ liệu', () => {
  const issuesFor = (type: string, params: unknown): string[] =>
    dataIssuesAfter((raw) => raw.traits.push(trait('broken', type, params)), {
      regenerateText: true
    })

  it('params hợp lệ / sai', () => {
    expect(issuesFor('priorityModifier', { skillCategory: 'any', amount: -1 })).toEqual([])
    expect(issuesFor('skipTurnChance', { chance: 100 })).toEqual([])
    expect(issuesFor('randomSkillChance', { chance: 0.5 })).toEqual([])
    expect(issuesFor('actLast', {})).toEqual([])
    expect(issuesFor('skipEveryOtherTurn', {})).toEqual([])
    const cases: [string, unknown, string][] = [
      ['priorityModifier', { skillCategory: 'status', amount: 0 }, 'amount'],
      ['priorityModifier', { skillCategory: 'status', amount: 1.5 }, 'amount'],
      ['priorityModifier', { skillCategory: 'magic', amount: 1 }, 'skillCategory'],
      ['priorityModifier', { amount: 1 }, 'skillCategory'],
      [
        'priorityModifier',
        { skillCategory: 'status', amount: 1, failsAgainstElementIds: ['nope'] },
        'failsAgainstElementIds'
      ],
      [
        'priorityModifier',
        { skillCategory: 'status', amount: 1, failsAgainstElementIds: [] },
        'failsAgainstElementIds'
      ],
      ['skipTurnChance', { chance: 0 }, 'chance'],
      ['skipTurnChance', { chance: 101 }, 'chance'],
      ['randomSkillChance', {}, 'chance'],
      ['randomSkillChance', null, 'object'],
      ['actLast', { always: true }, 'không có params'],
      ['skipEveryOtherTurn', { turns: 2 }, 'không có params']
    ]
    for (const [type, params, fragment] of cases) {
      expect(issuesFor(type, params).join('\n'), type).toContain(fragment)
    }
  })
})
