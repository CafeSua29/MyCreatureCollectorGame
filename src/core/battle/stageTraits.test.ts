// Hook trait bậc trận (registries/stageTraitHooks.ts, battle/stageChanges.ts): Intimidate khi vào
// sân, Speed Boost cuối lượt, Moxie khi hạ gục, Defiant khi bị hạ bậc, Clear Body chặn hạ bậc, %
// chỉ số theo số quái đã hạ; Mist, thế thân, bẫy; AI; save v18.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { SAVE_VERSION, deserializeState, gameReducer, migrateState, serializeState } from '../game'
import { validateGameState } from '../game/validateGameState'
import { SKILL_EFFECTS, type SkillEffectAiContext } from '../registries'
import { BIG_ZERO, toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeField,
  makeMonster,
  makeSideFieldRawData,
  toBigStats,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type {
  ActiveSideField,
  BattleCommand,
  BattleEvent,
  BattleState,
  GameData,
  GameState,
  Monster,
  Skill,
  TraitDef
} from '../model'
import { battleStats, cloneDraft, clearOnFieldState, type Draft } from './draft'
import { triggerEntryEffects } from './environment'

function trait(id: string, type: string, params: unknown): TraitDef {
  return { id, kind: 'rare', hooks: [{ type, params }] }
}

const TRAITS: TraitDef[] = [
  trait('intimidate', 'stageOnEntry', { target: 'allEnemies', stat: 'attack', stages: -1 }),
  {
    id: 'terror',
    kind: 'rare',
    hooks: [
      { type: 'stageOnEntry', params: { target: 'allEnemies', stat: 'attack', stages: -1 } },
      { type: 'stageOnEntry', params: { target: 'allEnemies', stat: 'speed', stages: -1 } }
    ]
  },
  trait('dauntless', 'stageOnEntry', { target: 'self', stat: 'defense', stages: 1 }),
  trait('speedBoost', 'stageOnTurnEnd', { stat: 'speed', stages: 1 }),
  trait('moxie', 'stageOnKnockout', { stat: 'attack', stages: 1 }),
  trait('defiant', 'stageOnStatLowered', { stat: 'attack', stages: 2 }),
  trait('clearBody', 'statLowerImmunity', { stats: 'all' }),
  trait('keenAttack', 'statLowerImmunity', { stats: ['attack'] }),
  trait('eyeOfGods', 'statModifierAfterKnockout', { percent: { attack: 10 } })
]

const statusSkill = (id: string, target: Skill['target'], effects: Skill['effects']): Skill => ({
  id,
  elementId: 'normal',
  category: 'status',
  power: 0,
  accuracy: 100,
  priority: 0,
  target,
  effects
})

// Hạ công đồng đội (kiểm tra Defiant không chạy khi đồng đội hạ bậc).
const SKILLS: Skill[] = [
  statusSkill('allyDrop', 'ally', [
    { type: 'statStage', params: { who: 'target', stat: 'attack', delta: -1 } }
  ])
]

const data: GameData = (() => {
  const raw = makeSideFieldRawData()
  raw.traits.push(...TRAITS)
  raw.skills.push(...SKILLS)
  return createGameData(withFixtureText(raw))
})()

/** Quái mẫu mọi chỉ số 50 (HP 50), hệ ma (đứng trên đất), trait cấp 1 cho trước. */
const DROPPER: MonsterOverrides = { skillIds: ['idle', 'selfDrop', 'allyDrop'] }

const fighter = (id: string, traitIds: string[] = [], extra: MonsterOverrides = {}): Monster =>
  makeMonster({
    id,
    elementIds: ['ghost'],
    skillIds: ['idle', 'strike', 'wave', 'growl'],
    traits: traitIds.map((traitId) => ({ id: traitId, level: 1 })),
    ...extra
  })

/** Quái địch hệ nước (strike hệ thường đánh trúng), chỉ biết idle (AI không đổi bậc gì). */
const foe = (id: string, traitIds: string[] = [], extra: MonsterOverrides = {}): Monster =>
  fighter(id, traitIds, { skillIds: ['idle'], elementIds: ['water'], ...extra })

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

/** Chạy trait vào sân của mọi quái đang trên sân (như lúc mở trận). */
function openWith(
  party: Monster[],
  enemies: Monster[],
  overrides: Partial<BattleState> = {}
): Draft {
  const d = cloneDraft(makeBattleState(party, enemies, overrides))
  const onField = [...d.battle.playerSlots, ...d.battle.enemySlots].flatMap((id) =>
    id === null ? [] : [[...d.party, ...d.battle.enemies].find((m) => m.id === id) as Monster]
  )
  triggerEntryEffects(data, d, onField)
  return d
}

const sideEntry = (id: string): ActiveSideField => ({ id, turnsLeft: null, layers: 1 })

describe('stageOnEntry (kiểu Intimidate)', () => {
  it('mở trận: hạ công mọi địch trên sân, log trait trước thay đổi', () => {
    const d = openWith([fighter('a', ['intimidate']), fighter('b')], [foe('e1'), foe('e2')])
    expect(d.battle.stages.e1).toEqual({ attack: -1 })
    expect(d.battle.stages.e2).toEqual({ attack: -1 })
    expect(d.battle.stages.b).toBeUndefined()
    const types = d.battle.log.map((event) => event.type)
    expect(types).toEqual(['traitTriggered', 'stage', 'stage'])
    expect(d.battle.log[0]).toEqual({
      type: 'traitTriggered',
      monsterId: 'a',
      traitId: 'intimidate'
    })
  })

  it('một trait nhiều hook: log trait một lần; target self tự tăng bậc', () => {
    const d = openWith([fighter('a', ['terror', 'dauntless'])], [foe('e1')])
    expect(d.battle.stages.e1).toEqual({ attack: -1, speed: -1 })
    expect(d.battle.stages.a).toEqual({ defense: 1 })
    expect(d.battle.log.filter((event) => event.type === 'traitTriggered')).toHaveLength(2)
  })

  it('Mist chặn, Clear Body chặn (log trait), thế thân chặn', () => {
    const misted = openWith([fighter('a', ['intimidate'])], [foe('e1')], {
      field: { ...makeField(), sides: { player: [], enemy: [sideEntry('mist')] } }
    })
    expect(misted.battle.stages.e1).toBeUndefined()
    expect(misted.battle.log.some((event) => event.type === 'stageBlockedByField')).toBe(true)

    const clear = openWith([fighter('a', ['intimidate'])], [foe('e1', ['keenAttack'])])
    expect(clear.battle.stages.e1).toBeUndefined()
    expect(clear.battle.log).toContainEqual({
      type: 'stageBlockedByTrait',
      monsterId: 'e1',
      stat: 'attack',
      traitId: 'keenAttack'
    })

    const shielded = openWith([fighter('a', ['intimidate'])], [foe('e1')], {
      volatiles: { a: { firstTurn: 1 }, e1: { firstTurn: 1, substituteHp: toBig(10) } }
    })
    expect(shielded.battle.stages.e1).toBeUndefined()
  })

  it('Defiant: bị Intimidate hạ công thì +2 công (thực +1); đã ở −6 thì không kích hoạt', () => {
    const d = openWith([fighter('a', ['intimidate'])], [foe('e1', ['defiant'])])
    expect(d.battle.stages.e1).toEqual({ attack: 1 })
    const floor = openWith([fighter('a', ['intimidate'])], [foe('e1', ['defiant'])], {
      stages: { e1: { attack: -6 } }
    })
    expect(floor.battle.stages.e1).toEqual({ attack: -6 })
  })

  it('vào giữa trận (đổi quái) cũng hạ bậc địch', () => {
    const state = makeBattleState(
      [fighter('a'), fighter('b'), fighter('c', ['intimidate'])],
      [foe('e1'), foe('e2')]
    )
    const after = run(state, [{ slot: 0, kind: 'switch', monsterId: 'c' }, cast(1, 'idle')])
    expect(battleOf(after).stages.e1?.attack).toBe(-1)
    expect(battleOf(after).stages.e2?.attack).toBe(-1)
  })
})

describe('stageOnStatLowered / statLowerImmunity với skill và bẫy', () => {
  it('địch hạ bậc thì Defiant chạy; đồng đội hoặc tự hạ thì không', () => {
    const byFoe = run(makeBattleState([fighter('a')], [foe('e1', ['defiant'])]), [cast(0, 'growl')])
    expect(battleOf(byFoe).stages.e1).toEqual({ attack: 1 })

    const byAlly = run(
      makeBattleState([fighter('a', [], DROPPER), fighter('b', ['defiant'])], [foe('e1')]),
      [cast(0, 'allyDrop', 1), cast(1, 'idle')]
    )
    expect(battleOf(byAlly).stages.b).toEqual({ attack: -1 })

    const bySelf = run(makeBattleState([fighter('a', ['defiant'], DROPPER)], [foe('e1')]), [
      cast(0, 'selfDrop')
    ])
    expect(battleOf(bySelf).stages.a).toEqual({ attack: -1 })
  })

  it('Clear Body chặn hạ bậc do đồng đội; tự hạ vẫn được', () => {
    const byAlly = run(
      makeBattleState([fighter('a', [], DROPPER), fighter('b', ['clearBody'])], [foe('e1')]),
      [cast(0, 'allyDrop', 1), cast(1, 'idle')]
    )
    expect(battleOf(byAlly).stages.b).toBeUndefined()
    const bySelf = run(makeBattleState([fighter('a', ['clearBody'], DROPPER)], [foe('e1')]), [
      cast(0, 'selfDrop')
    ])
    expect(battleOf(bySelf).stages.a).toEqual({ attack: -1 })
  })

  it('Sticky Web: Clear Body chặn, Defiant kích hoạt (bẫy coi như phe địch gây)', () => {
    const web = { ...makeField(), sides: { player: [sideEntry('web')], enemy: [] } }
    const switchIn = (traitIds: string[]): GameState =>
      run(
        makeBattleState([fighter('a'), fighter('b'), fighter('c', traitIds)], [foe('e1')], {
          field: web
        }),
        [{ slot: 0, kind: 'switch', monsterId: 'c' }, cast(1, 'idle')]
      )
    expect(battleOf(switchIn(['clearBody'])).stages.c).toBeUndefined()
    expect(battleOf(switchIn(['defiant'])).stages.c).toEqual({ speed: -1, attack: 2 })
  })
})

describe('stageOnTurnEnd (kiểu Speed Boost)', () => {
  it('cuối lượt +1 tốc độ; quái vừa vào giữa lượt thì chưa, lượt sau mới có', () => {
    const state = makeBattleState(
      [fighter('a', ['speedBoost']), fighter('b'), fighter('c', ['speedBoost'])],
      [foe('e1')]
    )
    const first = run(state, [cast(0, 'idle'), { slot: 1, kind: 'switch', monsterId: 'c' }])
    expect(battleOf(first).stages.a).toEqual({ speed: 1 })
    expect(battleOf(first).stages.c).toBeUndefined()
    const second = run(first, [cast(0, 'idle'), cast(1, 'idle')])
    expect(battleOf(second).stages.a).toEqual({ speed: 2 })
    expect(battleOf(second).stages.c).toEqual({ speed: 1 })
  })

  it('kẹp ở +6', () => {
    const state = makeBattleState([fighter('a', ['speedBoost'])], [foe('e1')], {
      stages: { a: { speed: 6 } }
    })
    expect(battleOf(run(state, [cast(0, 'idle')])).stages.a).toEqual({ speed: 6 })
  })
})

describe('hạ gục: stageOnKnockout (Moxie), statModifierAfterKnockout', () => {
  // strike: 7,5 sát thương → quái còn 5 HP gục; wave đánh lan ít hơn nên để còn 1 HP.
  const nearlyDown = { damageTaken: 45 }
  const almostDown = { damageTaken: 49 }

  it('đòn skill hạ một địch: +1 công, đếm hạ gục', () => {
    const state = makeBattleState(
      [fighter('a', ['moxie'])],
      [foe('e1', [], nearlyDown), foe('e2'), foe('e3')]
    )
    const after = run(state, [cast(0, 'strike', 0)])
    expect(battleOf(after).stages.a).toEqual({ attack: 1 })
    expect(battleOf(after).volatiles.a?.knockouts).toBe(1)
  })

  it('đánh lan hạ hai địch: +2, đếm 2', () => {
    const state = makeBattleState(
      [fighter('a', ['moxie'])],
      [foe('e1', [], almostDown), foe('e2', [], almostDown), foe('e3')]
    )
    const after = run(state, [cast(0, 'wave')])
    expect(battleOf(after).stages.a).toEqual({ attack: 2 })
    expect(battleOf(after).volatiles.a?.knockouts).toBe(2)
  })

  it('địch gục vì trạng thái không tính', () => {
    const poisoned = {
      damageTaken: 49,
      statuses: [{ statusId: 'poison', turnsLeft: 3 }]
    }
    const state = makeBattleState(
      [fighter('a', ['moxie'])],
      [foe('e1', [], poisoned), foe('e2'), foe('e3')]
    )
    const after = run(state, [cast(0, 'idle')])
    expect(eventsOf(after, 'faint')).toHaveLength(1)
    expect(battleOf(after).stages.a).toBeUndefined()
    expect(battleOf(after).volatiles.a?.knockouts).toBeUndefined()
  })

  it('% chỉ số × số quái đã hạ × hệ số cấp; mất khi rời sân; số cực lớn', () => {
    const d = cloneDraft(makeBattleState([fighter('a', ['eyeOfGods'])], [foe('e1')]))
    const a = defined(d.party[0])
    expect(battleStats(data, d, a).attack.toNumber()).toBe(50)
    defined(d.battle.volatiles.a).knockouts = 2
    expect(battleStats(data, d, a).attack.toNumber()).toBe(60)
    a.traits = [{ id: 'eyeOfGods', level: 6 }] // +20% mỗi quái
    expect(battleStats(data, d, a).attack.toNumber()).toBe(70)
    const genes = a.genes
    a.genes = toBigStats({ ...uniformStats(10), attack: '1e1000' })
    const huge = battleStats(data, d, a).attack
    expect(huge.div('2.8e1000').minus(1).abs().lt(1e-30)).toBe(true)
    clearOnFieldState(data, d, 'a')
    d.battle.volatiles.a = { firstTurn: 1 }
    a.genes = genes
    expect(battleStats(data, d, a).attack.toNumber()).toBe(50)
  })
})

describe('AI: statStage hạ bậc', () => {
  const user = fighter('u')
  const value = (target: Monster): number =>
    SKILL_EFFECTS.statStage.aiValue({ who: 'target', stat: 'attack', delta: -1 }, {
      data,
      user,
      target,
      targetIsAlly: false,
      stages: {},
      expectedDamage: BIG_ZERO,
      field: makeField(),
      side: 'player',
      allies: [user],
      foes: [target],
      allyReserves: [],
      foeReserves: []
    } satisfies SkillEffectAiContext)
  const step = data.config.ai.stageValuePerStep

  it('địch thường: +1 bậc; miễn hạ bậc: 0; Defiant: trừ phần địch tự tăng', () => {
    expect(value(foe('t'))).toBeCloseTo(step)
    expect(value(foe('t', ['clearBody']))).toBe(0)
    expect(value(foe('t', ['defiant']))).toBeCloseTo(step - 2 * step)
  })
})

describe('kiểm tra params', () => {
  const issuesWith = (type: string, params: unknown): string[] =>
    dataIssuesAfter((raw) => raw.traits.push(trait('broken', type, params)), {
      regenerateText: true
    })

  it('báo lỗi params sai', () => {
    const cases: [string, unknown, string][] = [
      ['stageOnEntry', { target: 'allAllies', stat: 'attack', stages: -1 }, 'target'],
      ['stageOnEntry', { target: 'self', stat: 'hp', stages: 1 }, 'stat'],
      ['stageOnTurnEnd', { stat: 'speed', stages: 0 }, 'stages'],
      ['stageOnKnockout', { stat: 'attack', stages: 1.5 }, 'stages'],
      ['stageOnStatLowered', null, 'params phải là object'],
      ['statLowerImmunity', { stats: [] }, 'stats'],
      ['statLowerImmunity', { stats: ['attack', 'attack'] }, 'stats'],
      ['statLowerImmunity', { stats: ['hp'] }, 'stats'],
      ['statModifierAfterKnockout', { percent: { hp: 10 } }, 'hp'],
      ['statModifierAfterKnockout', {}, 'percent là bắt buộc']
    ]
    for (const [type, params, fragment] of cases) {
      const issues = issuesWith(type, params)
      expect(
        issues.some((issue) => issue.includes('broken') && issue.includes(fragment)),
        `${type} ${JSON.stringify(params)}: ${issues.join('; ')}`
      ).toBe(true)
    }
  })

  it('fixture hook hợp lệ', () => {
    expect(dataIssuesAfter((raw) => raw.traits.push(...TRAITS), { regenerateText: true })).toEqual(
      []
    )
  })
})

describe('save v18', () => {
  it('knockouts phải nguyên ≥ 1; migrate v17 → v18 giữ nguyên trận', () => {
    const state = makeBattleState([fighter('a')], [foe('e1')])
    const withKo = (knockouts: number): GameState => ({
      ...state,
      battle: {
        ...battleOf(state),
        volatiles: { a: { firstTurn: 1, knockouts }, e1: { firstTurn: 1 } }
      }
    })
    expect(validateGameState(data, withKo(3))).toEqual([])
    expect(validateGameState(data, withKo(0)).join('\n')).toMatch(/battle\.volatiles\.a\.knockouts/)
    expect(validateGameState(data, withKo(1.5)).join('\n')).toMatch(/knockouts/)

    const raw = JSON.parse(JSON.stringify(serializeState(state)))
    raw.version = 17
    const migrated = migrateState(deserializeState(raw), data)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(battleOf(migrated).volatiles).toEqual(battleOf(state).volatiles)
    expect(validateGameState(data, migrated)).toEqual([])
  })
})
