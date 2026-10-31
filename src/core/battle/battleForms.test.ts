// Dạng chỉ có trong trận (docs/rules/battle-forms.md): hiệu ứng changeForm (đổi / về / bật tắt,
// untilLeave), dạng khi dùng skill (Stance Change), khi rời sân (Zero to Hero), dạng chặn đòn
// (Disguise, Ice Face), chỉ số / hệ / máu theo dạng, trả lại khi hết trận, skill đổi theo dạng.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { gameReducer } from '../game'
import { computeStats, getMaxHp, percentOfMaxHp, validateMonster } from '../monster'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeSideFieldRawData,
  toBigStats,
  uniformStats,
  withFixtureText
} from '../testing'
import { toBig } from '../shared'
import type {
  BattleEvent,
  GameState,
  Monster,
  NormalSpecies,
  Skill,
  TraitDef,
  TraitHookDef
} from '../model'

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
const trait = (id: string, hooks: TraitHookDef[]): TraitDef => ({ id, kind: 'positive', hooks })
const onEvent = (on: string, effects: unknown[], when?: unknown[]): TraitHookDef => ({
  type: 'trigger',
  params: { on, scope: 'self', effects, ...(when ? { when } : {}) }
})
const toForm = (extra: Record<string, unknown> = {}): unknown => ({
  do: 'changeForm',
  to: 'self',
  forms: { weakling: 'weaklingForm' },
  ...extra
})

const raw = makeSideFieldRawData()
raw.species.push({
  kind: 'normal',
  id: 'weaklingForm',
  raceId: 'neutral',
  elementIds: ['fire'],
  baseStats: { ...uniformStats(90), hp: 60 },
  evolutions: [],
  learnset: [{ level: 1, skillId: 'strike' }],
  catchRate: 50,
  formOf: 'weakling',
  formKind: 'battleOnly'
} satisfies NormalSpecies)
raw.skills.push(
  attack('hit'),
  attack('shield', {
    category: 'status',
    power: 0,
    target: 'self',
    priority: 4,
    effects: [{ type: 'protect', params: { consecutiveChanceDivisor: 3 } }]
  }),
  attack('formBeam', { formOverrides: [{ speciesIds: ['weaklingForm'], power: 200 }] })
)
raw.traits.push(
  trait('entryForm', [onEvent('turnEnd', [toForm()])]),
  trait('entryFormUntilLeave', [onEvent('turnEnd', [toForm({ untilLeave: true })])]),
  trait('toggler', [onEvent('turnEnd', [toForm({ toggle: true })])]),
  trait('stance', [
    {
      type: 'formOnSkill',
      params: { forms: { weakling: 'weaklingForm' }, revertSkillIds: ['shield'] }
    }
  ]),
  trait('hero', [{ type: 'formOnLeave', params: { forms: { weakling: 'weaklingForm' } } }]),
  trait('mask', [
    {
      type: 'disguise',
      params: {
        forms: { weakling: 'weaklingForm' },
        categories: ['physical', 'special'],
        hpCostPercent: 12.5
      }
    }
  ]),
  trait('breaker', [{ type: 'abilityFlag', params: { flag: 'ignoresTargetAbility' } }])
)
const data = createGameData(withFixtureText(raw))

const fighter = (id: string, skillIds: string[], fields: Partial<Monster> = {}): Monster =>
  makeMonster({
    id,
    skillIds,
    genes: toBigStats({ ...uniformStats(20), hp: '1e6' }),
    ...fields
  })
const withTraits = (...ids: string[]): Partial<Monster> => ({
  traits: ids.map((id) => ({ id, level: 1 }))
})

function submit(state: GameState, skillId: string): { state: GameState; log: BattleEvent[] } {
  const next = gameReducer(data, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
  })
  return { state: next, log: defined(next.battle).log.slice(defined(state.battle).log.length) }
}
const player = (state: GameState, id = 'a'): Monster =>
  defined(state.party.find((m) => m.id === id))
const enemy = (state: GameState): Monster => defined(defined(state.battle).enemies[0])
const damageTo = (log: BattleEvent[], id: string): number =>
  log.reduce(
    (sum, e) => (e.type === 'damage' && e.targetId === id ? sum + Number(e.amount) : sum),
    0
  )
/** Qua một lượt đứng yên (trait cuối lượt đã chạy); quái dự bị (nếu có) ở ngoài sân. */
const opened = (party: Monster[], enemies: Monster[]): GameState =>
  submit(makeBattleState(party, enemies, { playerSlots: [party[0]?.id ?? null, null] }), 'idle')
    .state

describe('changeForm', () => {
  it('đổi dạng: chỉ số gốc và hệ theo loài dạng, ability / loài giữ nguyên', () => {
    const state = opened(
      [fighter('a', ['idle'], withTraits('entryForm'))],
      [fighter('e', ['idle'])]
    )
    const monster = player(state)
    expect(monster.battleForm).toEqual({ speciesId: 'weaklingForm', originalElementIds: ['grass'] })
    expect(monster.elementIds).toEqual(['fire'])
    expect(monster.speciesId).toBe('weakling')
    const base = computeStats(data, { ...monster, battleForm: undefined }).base.attack
    expect(computeStats(data, monster).base.attack.gt(base)).toBe(true)
    expect(defined(state.battle).log.some((e) => e.type === 'formChanged')).toBe(true)
  })

  it('máu đã mất giữ nguyên khi max HP đổi (không chết vì đổi dạng)', () => {
    const monster = fighter('a', ['idle'], {
      ...withTraits('entryForm'),
      genes: toBigStats(uniformStats(20)),
      damageTaken: toBig(10)
    })
    const after = player(opened([monster], [fighter('e', ['idle'])]))
    expect(after.damageTaken.toNumber()).toBe(10)
    expect(getMaxHp(data, after).gt(getMaxHp(data, monster))).toBe(true)
  })

  it('untilLeave: rời sân thì về dạng thường; không có thì giữ', () => {
    const reserve = fighter('b', ['idle'])
    for (const [traitId, keeps] of [
      ['entryFormUntilLeave', false],
      ['entryForm', true]
    ] as const) {
      const state = opened(
        [fighter('a', ['idle'], withTraits(traitId)), reserve],
        [fighter('e', ['idle'])]
      )
      const out = gameReducer(data, state, {
        type: 'submitTurn',
        commands: [{ slot: 0, kind: 'switch', monsterId: 'b' }]
      })
      expect(player(out).battleForm !== undefined).toBe(keeps)
      expect(player(out).elementIds).toEqual(keeps ? ['fire'] : ['grass'])
    }
  })

  it('toggle: mỗi cuối lượt đổi qua lại', () => {
    const first = opened([fighter('a', ['idle'], withTraits('toggler'))], [fighter('e', ['idle'])])
    expect(player(first).battleForm?.speciesId).toBe('weaklingForm')
    const second = submit(first, 'idle').state
    expect(player(second).battleForm).toBeUndefined()
  })

  it('hết trận: về dạng thường, hệ gốc', () => {
    const state = opened(
      [fighter('a', ['hit', 'idle'], withTraits('entryForm'))],
      [makeMonster({ id: 'e', skillIds: ['idle'] })]
    )
    let current = state
    for (let i = 0; i < 20 && current.battle?.phase === 'chooseActions'; i++) {
      current = submit(current, 'hit').state
    }
    const monster = player(current)
    expect(monster.battleForm).toBeUndefined()
    expect(monster.elementIds).toEqual(['grass'])
  })
})

describe('hook dạng', () => {
  it('Stance Change: skill gây sát thương → dạng tấn công, skill về dạng → dạng thường', () => {
    const start = makeBattleState(
      [fighter('a', ['hit', 'shield'], withTraits('stance'))],
      [fighter('e', ['idle'])]
    )
    const attacked = submit(start, 'hit').state
    expect(player(attacked).battleForm?.speciesId).toBe('weaklingForm')
    const shielded = submit(attacked, 'shield').state
    expect(player(shielded).battleForm).toBeUndefined()
  })

  it('Zero to Hero: rút về (còn sống) thì nhận dạng tới hết trận', () => {
    const state = makeBattleState(
      [fighter('a', ['idle'], withTraits('hero')), fighter('b', ['idle'])],
      [fighter('e', ['idle'])],
      { playerSlots: ['a', null] }
    )
    expect(player(state).battleForm).toBeUndefined()
    const out = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'switch', monsterId: 'b' }]
    })
    expect(player(out).battleForm?.speciesId).toBe('weaklingForm')
  })

  it('Disguise: chặn hẳn đòn đầu, đổi dạng, mất 12,5% max HP; đòn sau trúng như thường', () => {
    const target = fighter('e', ['idle'], withTraits('mask'))
    const first = submit(makeBattleState([fighter('a', ['hit'])], [target]), 'hit')
    expect(first.log.some((e) => e.type === 'disguiseBroken')).toBe(true)
    expect(damageTo(first.log, 'e')).toBe(0)
    const busted = enemy(first.state)
    expect(busted.battleForm?.speciesId).toBe('weaklingForm')
    expect(busted.damageTaken.eq(percentOfMaxHp(getMaxHp(data, busted), 12.5))).toBe(true)
    const second = submit(first.state, 'hit')
    expect(damageTo(second.log, 'e')).toBeGreaterThan(0)
  })

  it('Disguise không chặn đòn bỏ qua ability (Mold Breaker)', () => {
    const { log } = submit(
      makeBattleState(
        [fighter('a', ['hit'], withTraits('breaker'))],
        [fighter('e', ['idle'], withTraits('mask'))]
      ),
      'hit'
    )
    expect(log.some((e) => e.type === 'disguiseBroken')).toBe(false)
    expect(damageTo(log, 'e')).toBeGreaterThan(0)
  })
})

describe('formOverrides', () => {
  it('skill đổi theo dạng hiện tại của quái dùng', () => {
    const plain = submit(
      makeBattleState([fighter('a', ['formBeam'])], [fighter('e', ['idle'])]),
      'formBeam'
    ).log
    const formed = submit(
      opened(
        [fighter('a', ['formBeam', 'idle'], withTraits('entryForm'))],
        [fighter('e', ['idle'])]
      ),
      'formBeam'
    ).log
    // Dạng có công cao hơn và power 200 thay 40: sát thương lớn hơn nhiều.
    expect(damageTo(formed, 'e')).toBeGreaterThan(damageTo(plain, 'e') * 4)
  })
})

describe('kiểm tra dữ liệu / save', () => {
  it('bảng dạng phải trỏ dạng battleOnly của chính loài gốc', () => {
    const issues = dataIssuesAfter((r) => {
      r.traits.push(
        trait('badForm', [
          onEvent('entry', [{ do: 'changeForm', to: 'self', forms: { weakling: 'strongling' } }])
        ])
      )
    }).join('\n')
    expect(issues).toContain('không phải dạng trong trận "strongling"')
  })

  it('changeForm cần đúng một trong forms / revert', () => {
    const issues = dataIssuesAfter((r) => {
      r.traits.push(trait('noForm', [onEvent('entry', [{ do: 'changeForm', to: 'self' }])]))
    }).join('\n')
    expect(issues).toContain('cần đúng một trong forms / revert')
  })

  it('save: battleForm phải là dạng trong trận', () => {
    const monster = {
      ...makeMonster(),
      battleForm: { speciesId: 'strongling', originalElementIds: ['grass'] }
    }
    expect(validateMonster(data, monster, 'm').join('\n')).toContain('không phải dạng trong trận')
    const ok = {
      ...makeMonster(),
      battleForm: { speciesId: 'weaklingForm', originalElementIds: ['grass'] }
    }
    expect(validateMonster(data, ok, 'm')).toEqual([])
  })
})
