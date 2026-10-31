// Cụm 11 (docs/rules/pokemon-moves.md mục "Chiêu còn lại"): phản lực, Facade, Collision Course,
// priority theo môi trường, Snipe Shot, Throat Chop, Salt Cure, Burn Up, Fell Stinger, phá màn
// chắn, Clear Smog.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { getCurrentHp, getMaxHp } from '../monster'
import { expectedDamage, hiddenPowerElement } from './damage'
import {
  dataIssuesAfter,
  defined,
  held,
  makeBattleState,
  makeField,
  makeMonster,
  makeSideFieldRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import type { BattleEvent, GameState, Monster, NormalSpecies, Skill, StatusDef } from '../model'

const attack = (id: string, fields: Partial<Skill> = {}): Skill => ({
  id,
  elementId: 'normal',
  category: 'physical',
  power: 40,
  accuracy: 100,
  priority: 0,
  target: 'enemy',
  effects: [],
  ...fields
})

const SKILLS: Skill[] = [
  attack('slam', { recoilPercent: 50 }),
  attack('punchHit', { moveFlags: ['punch'] }),
  attack('triple', { hits: { min: 3, max: 3 }, escalatingHits: true }),
  attack('flatTriple', { hits: { min: 3, max: 3 } }),
  attack('beam', { category: 'special', charge: {} }),
  attack('techno', { elementFromHeldItem: true }),
  attack('spread', { fieldModifiers: [{ fieldId: 'rain', target: 'allEnemies' }] }),
  attack('thief', { stealsBoosts: true }),
  attack('pledgeA'),
  attack('pledgeB', {
    spell: {
      powerBonus: [
        {
          percent: 100,
          when: [{ if: 'previousSkillThisTurn', skillIds: ['pledgeA'], sameSide: true }]
        }
      ],
      after: [
        {
          do: 'placeSideField',
          side: 'own',
          fieldId: 'luckyRain',
          if: [{ if: 'previousSkillThisTurn', skillIds: ['pledgeA'], sameSide: true }]
        }
      ]
    }
  }),
  attack('gear', {
    category: 'status',
    power: 0,
    target: 'self',
    spell: {
      after: [
        {
          do: 'stage',
          to: 'side',
          stats: ['attack'],
          delta: 1,
          if: [{ if: 'hasAbility', who: 'target', abilityIds: ['plusT'] }]
        }
      ]
    }
  }),
  attack('gift', {
    randomPower: [
      { power: 40, weight: 1 },
      { power: 0, weight: 1 }
    ]
  }),
  attack('dance', { elementFromUser: 'first' }),
  attack('cudgel', { elementFromUser: 'last' }),
  attack('rageHit', { spell: { after: [{ do: 'status', to: 'self', statusId: 'raging' }] } }),
  attack('swords', {
    category: 'status',
    power: 0,
    target: 'self',
    effects: [{ type: 'statStage', params: { who: 'self', stat: 'attack', delta: 2 } }]
  }),
  attack('scald', {
    effects: [{ type: 'applyStatus', params: { statusId: 'burn', chance: 99 } }]
  }),
  attack('plainHit'),
  attack('facadeHit', { ignoresStatusPenalty: true }),
  attack('fireHit', { elementId: 'fire' }),
  attack('course', {
    elementId: 'fire',
    spell: { powerBonus: [{ percent: 100, when: [{ if: 'superEffective' }] }] }
  }),
  attack('glide', { fieldModifiers: [{ fieldId: 'rain', priority: 1 }] }),
  attack('snipe', { ignoresRedirect: true }),
  attack('chop', { effects: [{ type: 'applyStatus', params: { statusId: 'chopped' } }] }),
  attack('song', { category: 'special', moveFlags: ['sound'] }),
  attack('cure', { effects: [{ type: 'applyStatus', params: { statusId: 'salted' } }] }),
  attack('burnUp', {
    elementId: 'fire',
    spell: {
      requires: [{ if: 'element', who: 'self', elementIds: ['fire'] }],
      after: [{ do: 'identity', to: 'self', removeElementIds: ['fire'] }]
    }
  }),
  attack('stinger', {
    spell: {
      onTarget: [
        {
          do: 'stage',
          to: 'self',
          stats: ['attack'],
          delta: 3,
          if: [{ if: 'fainted', who: 'other' }]
        }
      ]
    }
  }),
  attack('brick', { breaksScreens: true }),
  attack('smog', { spell: { onTarget: [{ do: 'restoreStages', to: 'other', all: true }] } }),
  attack('lure', {
    category: 'status',
    power: 0,
    target: 'self',
    priority: 2,
    spell: { after: [{ do: 'provoke', to: 'self' }] }
  })
]
const STATUSES: StatusDef[] = [
  {
    id: 'raging',
    kind: 'buff',
    battleOnly: true,
    hooks: [{ type: 'endsAfterAction', params: {} }],
    traitHooks: [
      {
        type: 'trigger',
        params: {
          on: 'damaged',
          scope: 'self',
          effects: [{ do: 'stage', to: 'self', stats: ['attack'], delta: 1 }]
        }
      }
    ]
  },
  {
    id: 'chopped',
    kind: 'debuff',
    battleOnly: true,
    duration: { min: 2, max: 2 },
    blocksSoundSkills: true,
    hooks: []
  },
  {
    id: 'salted',
    kind: 'debuff',
    battleOnly: true,
    hooks: [
      {
        type: 'turnEndDamage',
        params: { percent: 10, byElement: { elementIds: ['water'], percent: 20 } }
      }
    ]
  }
]

const raw = makeSideFieldRawData()
raw.skills.push(...SKILLS)
raw.statuses.push(...STATUSES)
raw.items.push(
  { id: 'herb', category: 'held', price: 10, hooks: [{ type: 'skipChargeTurn', params: {} }] },
  {
    id: 'fireDrive',
    category: 'held',
    price: 10,
    persistent: true,
    hooks: [],
    skillElement: { skillIds: ['techno'], elementId: 'fire' }
  }
)
raw.fieldEffects.push({
  id: 'luckyRain',
  layer: 'side',
  duration: 4,
  hooks: [{ type: 'secondaryChance', params: { multiplier: 2 } }]
})
raw.traits.push({
  id: 'plusT',
  kind: 'positive',
  hooks: [
    {
      type: 'aura',
      params: {
        scope: 'allies',
        hooks: [
          {
            type: 'statWhen',
            params: {
              percent: { spAttack: 50 },
              when: [{ if: 'hasAbility', who: 'self', abilityIds: ['plusT'] }]
            }
          }
        ]
      }
    }
  ]
})
const plusIndex = raw.species.findIndex((s) => s.id === 'weakling')
raw.species[plusIndex] = { ...(raw.species[plusIndex] as NormalSpecies), abilities: ['plusT'] }
// Kiểu Iron Fist / Reckless: +20% skill có cờ đấm / phản lực (điều kiện moveFlag).
raw.traits.push({
  id: 'sheer',
  kind: 'positive',
  hooks: [
    { type: 'secondaryEffectChance', params: { percent: -100 } },
    {
      type: 'damageDealtModifier',
      params: { percent: 30, when: [{ if: 'moveFlag', flags: ['secondary'] }] }
    }
  ]
})
raw.traits.push(
  {
    id: 'contrary',
    kind: 'positive',
    hooks: [{ type: 'stageMultiplier', params: { gain: -1, loss: -1 } }]
  },
  {
    id: 'simple',
    kind: 'positive',
    hooks: [{ type: 'stageMultiplier', params: { gain: 2, loss: 2 } }]
  }
)
raw.traits.push({
  id: 'hardHead',
  kind: 'positive',
  hooks: [{ type: 'recoilImmunity', params: {} }]
})
raw.traits.push({
  id: 'fist',
  kind: 'positive',
  hooks: [
    {
      type: 'damageDealtModifier',
      params: { percent: 20, when: [{ if: 'moveFlag', flags: ['punch', 'recoil'] }] }
    }
  ]
})
raw.config.ai.statusWeights = {
  ...raw.config.ai.statusWeights,
  chopped: 0.1,
  salted: 0.3,
  raging: 0.05
}
const data = createGameData(withFixtureText(raw))

const fighter = (
  id: string,
  skillIds: string[],
  speed = 10,
  fields: Partial<Monster> = {}
): Monster =>
  makeMonster({
    id,
    skillIds,
    genes: toBigStats({ ...uniformStats(20), hp: '1e6', speed }),
    ...fields
  })
const idle = (id: string, fields: Partial<Monster> = {}): Monster =>
  fighter(id, ['idle'], 1, fields)

function turn(
  state: GameState,
  skillId: string,
  target = 0
): { state: GameState; log: BattleEvent[] } {
  const next = gameReducer(data, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target }]
  })
  return { state: next, log: defined(next.battle).log.slice(defined(state.battle).log.length) }
}
const damageTo = (log: BattleEvent[], id: string): number =>
  log.reduce(
    (sum, e) => (e.type === 'damage' && e.targetId === id ? sum + Number(e.amount) : sum),
    0
  )

describe('phản lực, Facade, khắc hệ', () => {
  it('phản lực: mất % sát thương vừa gây (làm tròn, ít nhất 1)', () => {
    const { log } = turn(makeBattleState([fighter('a', ['slam'], 100)], [idle('e')]), 'slam')
    const recoil = log.find((e) => e.type === 'selfDamage' && e.reason === 'recoil')
    expect(recoil && Number(recoil.type === 'selfDamage' ? recoil.amount : 0)).toBe(
      Math.round(damageTo(log, 'e') / 2)
    )
  })

  it('Sheer Force: bỏ hiệu ứng phụ, +30% với skill có hiệu ứng phụ', () => {
    const run = (skill: string, traits: string[]): { dealt: number; burned: boolean } => {
      const user = fighter('a', [skill], 100, { traits: traits.map((id) => ({ id, level: 1 })) })
      const result = turn(makeBattleState([user], [idle('e')]), skill)
      const enemy = defined(defined(result.state.battle).enemies[0])
      return {
        dealt: damageTo(result.log, 'e'),
        burned: enemy.statuses.some((s) => s.statusId === 'burn')
      }
    }
    const plain = run('scald', [])
    const sheer = run('scald', ['sheer'])
    expect(plain.burned).toBe(true)
    expect(sheer.burned).toBe(false)
    expect(sheer.dealt).toBeGreaterThan(plain.dealt)
    expect(run('plainHit', ['sheer']).dealt).toBe(run('plainHit', []).dealt)
  })

  it('Rock Head (recoilImmunity) miễn phản lực', () => {
    const user = fighter('a', ['slam'], 100, { traits: [{ id: 'hardHead', level: 1 }] })
    const { log } = turn(makeBattleState([user], [idle('e')]), 'slam')
    expect(damageTo(log, 'e')).toBeGreaterThan(0)
    expect(log.some((e) => e.type === 'selfDamage')).toBe(false)
  })

  it('Facade bỏ qua giảm sát thương của bỏng', () => {
    const burned = (skill: string): Monster =>
      fighter('a', [skill], 100, { statuses: [{ statusId: 'burn', turnsLeft: null }] })
    const plain = damageTo(
      turn(makeBattleState([burned('plainHit')], [idle('e')]), 'plainHit').log,
      'e'
    )
    const facade = damageTo(
      turn(makeBattleState([burned('facadeHit')], [idle('e')]), 'facadeHit').log,
      'e'
    )
    expect(facade).toBeGreaterThan(plain * 1.8)
  })

  it('Collision Course: power tăng khi khắc hệ, không tăng khi không khắc', () => {
    const run = (skill: string, elementIds: string[]): number =>
      damageTo(
        turn(makeBattleState([fighter('a', [skill], 100)], [idle('e', { elementIds })]), skill).log,
        'e'
      )
    expect(run('course', ['grass'])).toBeGreaterThan(run('fireHit', ['grass']) * 1.8)
    expect(run('course', ['normal'])).toBe(run('fireHit', ['normal']))
  })
})

describe('điều kiện moveFlag', () => {
  it('trait tăng sát thương chỉ với skill có cờ đấm / phản lực', () => {
    const run = (skill: string, traits: string[]): number => {
      const user = fighter('a', [skill], 100, { traits: traits.map((id) => ({ id, level: 1 })) })
      return damageTo(turn(makeBattleState([user], [idle('e')]), skill).log, 'e')
    }
    expect(run('punchHit', ['fist'])).toBeGreaterThan(run('punchHit', []))
    expect(run('slam', ['fist'])).toBeGreaterThan(run('slam', []))
    expect(run('plainHit', ['fist'])).toBe(run('plainHit', []))
  })
})

describe('stageMultiplier', () => {
  it('Contrary đảo chiều, Simple nhân đôi đổi bậc', () => {
    const stageAfter = (traits: string[]): number | undefined => {
      const user = fighter('a', ['swords'], 100, { traits: traits.map((id) => ({ id, level: 1 })) })
      return defined(turn(makeBattleState([user], [idle('e')]), 'swords').state.battle).stages.a
        ?.attack
    }
    expect(stageAfter([])).toBe(2)
    expect(stageAfter(['contrary'])).toBe(-2)
    expect(stageAfter(['simple'])).toBe(4)
  })
})

describe('power ngẫu nhiên, hệ theo quái dùng, Rage', () => {
  it('randomPower: có lần gây sát thương, có lần không; AI dùng power trung bình', () => {
    const dealt = new Set<boolean>()
    for (let seed = 1; seed <= 20; seed++) {
      const state = { ...makeBattleState([fighter('a', ['gift'], 100)], [idle('e')]), rng: seed }
      dealt.add(damageTo(turn(state, 'gift').log, 'e') > 0)
    }
    expect(dealt).toEqual(new Set([true, false]))
    const user = fighter('a', ['gift', 'plainHit'])
    const input = { data, attacker: user, defender: idle('e'), spread: false }
    expect(expectedDamage({ ...input, skill: data.skills.gift }).toNumber()).toBeCloseTo(
      expectedDamage({ ...input, skill: { ...data.skills.plainHit, power: 20 } }).toNumber()
    )
  })

  it('elementFromUser: hệ đầu / cuối của quái dùng (khắc hệ theo đó)', () => {
    const run = (skill: string, elementIds: string[]): number =>
      damageTo(
        turn(
          makeBattleState(
            [fighter('a', [skill], 100, { elementIds })],
            [idle('e', { elementIds: ['grass'] })]
          ),
          skill
        ).log,
        'e'
      )
    expect(run('dance', ['fire', 'water'])).toBeGreaterThan(run('dance', ['water', 'fire']))
    expect(run('cudgel', ['water', 'fire'])).toBeGreaterThan(run('cudgel', ['fire', 'water']))
  })

  it('Rage: trúng đòn thì +1 công tới khi dùng skill khác', () => {
    let state = makeBattleState(
      [fighter('a', ['rageHit', 'plainHit'], 100)],
      [fighter('e', ['plainHit'], 1)]
    )
    state = turn(state, 'rageHit').state
    expect(defined(state.battle).stages.a?.attack).toBe(1)
    state = turn(state, 'plainHit').state
    expect(defined(state.party[0]).statuses.some((s) => s.statusId === 'raging')).toBe(false)
  })
})

describe('mục tiêu theo môi trường, cướp bậc, Pledge, Plus / Minus', () => {
  it('fieldModifiers.target: trời mưa thì đánh mọi địch', () => {
    const run = (weather: string): string[] => {
      const state = makeBattleState([fighter('a', ['spread'], 100)], [idle('e'), idle('f')], {
        field: makeField({ weather })
      })
      return [
        ...new Set(
          turn(state, 'spread').log.flatMap((e) => (e.type === 'damage' ? [e.targetId] : []))
        )
      ]
    }
    expect(run('rain').sort()).toEqual(['e', 'f'])
    expect(run('clear')).toEqual(['e'])
  })

  it('Spectral Thief cướp bậc tăng trước khi đánh', () => {
    const state = makeBattleState([fighter('a', ['thief'], 100)], [idle('e')], {
      stages: { e: { attack: 2, defense: -1 } }
    })
    const stages = defined(turn(state, 'thief').state.battle).stages
    expect(stages.a?.attack).toBe(2)
    expect(stages.e).toEqual({ defense: -1 })
  })

  it('Pledge kết hợp: đồng đội vừa dùng Pledge khác thì ×2 và đặt hiệu ứng theo phe', () => {
    const state = makeBattleState(
      [fighter('a', ['pledgeA'], 100), fighter('b', ['pledgeB'], 50)],
      [idle('e')]
    )
    const next = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: 'pledgeA', target: 0 },
        { slot: 1, kind: 'skill', skillId: 'pledgeB', target: 0 }
      ]
    })
    expect(defined(next.battle).field.sides.player.map((f) => f.id)).toEqual(['luckyRain'])
    const alone = turn(makeBattleState([fighter('b', ['pledgeB'], 100)], [idle('e')]), 'pledgeB')
    expect(defined(alone.state.battle).field.sides.player).toEqual([])
  })

  it('Plus: đồng đội cùng có Plus thì +50% đặc công; Gear Up chỉ tăng quái có Plus', () => {
    const plus = (id: string, skillIds: string[]): Monster =>
      fighter(id, skillIds, 100, { speciesId: 'weakling', baseSpeciesId: 'weakling' })
    const other = fighter('b', ['idle'], 1, {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling'
    })
    const state = makeBattleState([plus('a', ['gear']), other], [idle('e')])
    const next = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [
        { slot: 0, kind: 'skill', skillId: 'gear', target: 0 },
        { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
      ]
    })
    const stages = defined(next.battle).stages
    expect(stages.a?.attack).toBe(1)
    expect(stages.b?.attack).toBeUndefined()
  })

  it('Plus: đặc công +50% chỉ khi đồng đội cũng có Plus', () => {
    const plus = (id: string): Monster =>
      fighter(id, ['song', 'idle'], 100 - id.length, {
        speciesId: 'weakling',
        baseSpeciesId: 'weakling'
      })
    const plain = fighter('b', ['idle'], 1, {
      speciesId: 'strongling',
      baseSpeciesId: 'strongling'
    })
    const dealt = (ally: Monster): number => {
      const state = makeBattleState([plus('a'), ally], [idle('e')])
      const next = gameReducer(data, state, {
        type: 'submitTurn',
        commands: [
          { slot: 0, kind: 'skill', skillId: 'song', target: 0 },
          { slot: 1, kind: 'skill', skillId: 'idle', target: 0 }
        ]
      })
      return damageTo(defined(next.battle).log, 'e')
    }
    expect(dealt(plus('bb'))).toBeGreaterThan(dealt(plain) * 1.3)
  })
})

describe('Power Herb, Drive', () => {
  it('Power Herb: skill nạp đánh ngay, đồ mất', () => {
    const user = fighter('a', ['beam'], 100, { equipment: [held('herb')] })
    const { state, log } = turn(makeBattleState([user], [idle('e')]), 'beam')
    expect(damageTo(log, 'e')).toBeGreaterThan(0)
    expect(defined(state.party[0]).equipment).toEqual([])
    const plain = turn(makeBattleState([fighter('a', ['beam'], 100)], [idle('e')]), 'beam')
    expect(damageTo(plain.log, 'e')).toBe(0)
  })

  it('Drive đổi hệ Techno Blast, không mất', () => {
    const run = (equipment: ReturnType<typeof held>[]): number =>
      damageTo(
        turn(
          makeBattleState(
            [fighter('a', ['techno'], 100, { equipment })],
            [idle('e', { elementIds: ['grass'] })]
          ),
          'techno'
        ).log,
        'e'
      )
    expect(run([held('fireDrive')])).toBeGreaterThan(run([]) * 1.8)
  })
})

describe('escalatingHits', () => {
  it('đòn thứ n power × n: tổng gấp đôi đòn đều; AI tính theo trung bình', () => {
    const run = (skill: string): number =>
      damageTo(turn(makeBattleState([fighter('a', [skill], 100)], [idle('e')]), skill).log, 'e')
    expect(run('triple')).toBeGreaterThan(run('flatTriple') * 1.8)
    const input = { data, attacker: fighter('a', ['triple']), defender: idle('e'), spread: false }
    expect(expectedDamage({ ...input, skill: data.skills.triple }).toNumber()).toBeCloseTo(
      expectedDamage({ ...input, skill: data.skills.flatTriple }).toNumber() * 2
    )
  })
})

describe('Hidden Power', () => {
  it('hệ theo tính chẵn lẻ của gen (công thức IV gốc); hệ không có trong dữ liệu thì giữ hệ skill', () => {
    const withGenes = (odd: string[]): Monster =>
      makeMonster({
        genes: toBigStats({
          hp: odd.includes('hp') ? 31 : 30,
          attack: odd.includes('attack') ? 31 : 30,
          defense: odd.includes('defense') ? 31 : 30,
          speed: odd.includes('speed') ? 31 : 30,
          spAttack: odd.includes('spAttack') ? 31 : 30,
          spDefense: odd.includes('spDefense') ? 31 : 30
        })
      })
    // Toàn chẵn: chỉ số 0 = fighting (fixture không có) → giữ hệ skill.
    expect(hiddenPowerElement(data, withGenes([]), 'normal')).toBe('normal')
    // Bit HP + công + tốc + đặc công (1 + 2 + 8 + 16 = 27) → ⌊27 × 15 / 63⌋ = 6 → ghost.
    expect(
      hiddenPowerElement(data, withGenes(['hp', 'attack', 'speed', 'spAttack']), 'normal')
    ).toBe('ghost')
    // Toàn lẻ (63) → 15 = dark (fixture không có) → giữ hệ skill.
    expect(
      hiddenPowerElement(
        data,
        withGenes(['hp', 'attack', 'defense', 'speed', 'spAttack', 'spDefense']),
        'normal'
      )
    ).toBe('normal')
  })
})

describe('thứ tự, mục tiêu', () => {
  it('priority theo môi trường: đi trước quái nhanh hơn khi trời mưa', () => {
    const scene = (weather: string): GameState =>
      makeBattleState([fighter('a', ['glide'], 1)], [fighter('e', ['plainHit'], 100)], {
        field: makeField({ weather })
      })
    const first = (state: GameState): string | undefined => {
      const use = turn(state, 'glide').log.find((e) => e.type === 'useSkill')
      return use?.type === 'useSkill' ? use.monsterId : undefined
    }
    expect(first(scene('rain'))).toBe('a')
    expect(first(scene('clear'))).toBe('e')
  })

  it('Snipe Shot không bị nhử đòn', () => {
    const state = makeBattleState(
      [fighter('a', ['snipe', 'plainHit'], 1)],
      [idle('e'), fighter('f', ['lure'], 100)]
    )
    expect(damageTo(turn(state, 'plainHit').log, 'f')).toBeGreaterThan(0)
    const sniped = turn(state, 'snipe').log
    expect(damageTo(sniped, 'e')).toBeGreaterThan(0)
    expect(damageTo(sniped, 'f')).toBe(0)
  })
})

describe('trạng thái và hệ', () => {
  it('Throat Chop chặn skill âm thanh', () => {
    const state = makeBattleState(
      [fighter('a', ['song'], 100, { statuses: [{ statusId: 'chopped', turnsLeft: 2 }] })],
      [idle('e')]
    )
    expect(turn(state, 'song').log.some((e) => e.type === 'skillBlocked')).toBe(true)
  })

  it('Salt Cure mất nhiều hơn với hệ chỉ định', () => {
    const lost = (elementIds: string[]): string => {
      const target = idle('e', { elementIds })
      const after = turn(makeBattleState([fighter('a', ['cure'], 100)], [target]), 'cure').state
      const enemy = defined(defined(after.battle).enemies[0])
      return getMaxHp(data, enemy).minus(getCurrentHp(data, enemy)).toString()
    }
    expect(Number(lost(['water']))).toBeGreaterThan(Number(lost(['normal'])))
  })

  it('Burn Up bỏ hệ Lửa; không có hệ Lửa thì thất bại', () => {
    const fire = turn(
      makeBattleState([fighter('a', ['burnUp'], 100, { elementIds: ['fire'] })], [idle('e')]),
      'burnUp'
    )
    expect(defined(fire.state.party[0]).elementIds).toEqual([])
    const plain = turn(makeBattleState([fighter('a', ['burnUp'], 100)], [idle('e')]), 'burnUp')
    expect(plain.log.some((e) => e.type === 'skillFailed')).toBe(true)
  })

  it('Fell Stinger: +3 công khi hạ gục mục tiêu', () => {
    const healthy = idle('e')
    const weak = { ...healthy, damageTaken: getMaxHp(data, healthy).minus(1) }
    const kill = turn(
      makeBattleState([fighter('a', ['stinger'], 100)], [weak, idle('f')]),
      'stinger'
    )
    expect(defined(kill.state.battle).stages.a?.attack).toBe(3)
    const miss = turn(makeBattleState([fighter('a', ['stinger'], 100)], [idle('e')]), 'stinger')
    expect(defined(miss.state.battle).stages.a?.attack).toBeUndefined()
  })

  it('phá màn chắn của phe mục tiêu; Clear Smog xóa mọi bậc', () => {
    const screened = makeBattleState([fighter('a', ['brick'], 100)], [idle('e')], {
      field: makeField({ sides: { enemy: [{ id: 'reflect', turnsLeft: 5, layers: 1 }] } })
    })
    expect(defined(turn(screened, 'brick').state.battle).field.sides.enemy).toEqual([])
    const boosted = makeBattleState([fighter('a', ['smog'], 100)], [idle('e')], {
      stages: { e: { attack: 2, defense: -1 } }
    })
    expect(defined(turn(boosted, 'smog').state.battle).stages.e ?? {}).toEqual({})
  })
})

describe('kiểm tra dữ liệu', () => {
  it('cờ / tham số sai', () => {
    const issues = dataIssuesAfter(
      (r) => {
        r.skills.push({
          ...attack('bad'),
          recoilPercent: 0,
          moveFlags: ['loud' as never],
          fieldModifiers: [{ fieldId: 'rain', priority: 0.5 }],
          spell: { after: [{ do: 'identity', to: 'self', removeElementIds: ['nope'] }] }
        })
      },
      { regenerateText: true }
    ).join('\n')
    for (const fragment of ['recoilPercent', 'moveFlags', 'priority', 'removeElementIds']) {
      expect(issues).toContain(fragment)
    }
  })
})
