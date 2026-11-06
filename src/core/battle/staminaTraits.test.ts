// Hook trait về thể lực (docs/rules/stamina.md mục "Trait"): luật quá sức `overexertion` (Tireless,
// chặn gục), sự kiện `overexert` / `rest`, điều kiện `overexerting` (Vigorous) / `skillHold` (Patient),
// giá chỉ cho skill gây sát thương (Efficient), thể lực theo sát thương (Kinetic Transfer), giảm hold.

import { describe, expect, it } from 'vitest'
import { gameReducer } from '../game'
import { createGameData } from '../gameData'
import { getMaxHp, holdTurnsLeft } from '../monster'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeMonster,
  makeRawData,
  withFixtureText
} from '../testing'
import type { GameState, Monster, Skill, TraitDef } from '../model'
import { cloneDraft, emptyRecord } from './draft'
import { currentStamina, inferredStaminaCost, staminaCostOf } from './stamina'

const raw = makeRawData()
Object.assign(raw.config.stamina, {
  costByPower: [{ upToPower: 100, cost: 40 }],
  statusCost: 5
})
const base = { elementId: 'normal', priority: 0, accuracy: 100, effects: [], target: 'enemy' }
raw.skills.push(
  { ...base, id: 'heavyHit', category: 'special', power: 90 } as Skill,
  { ...base, id: 'heldHit', category: 'special', power: 90, hold: 2 } as Skill
)
const trait = (id: string, hooks: TraitDef['hooks']): TraitDef => ({ id, kind: 'positive', hooks })
const onSelf = (on: string, effects: unknown[], extra = {}): TraitDef['hooks'][number] => ({
  type: 'trigger',
  params: { on, scope: 'self', effects, ...extra }
})
raw.traits.push(
  trait('tireless', [
    { type: 'overexertion', params: { hpPercent: -50, skipsExhaustion: true } },
    onSelf('overexert', [{ do: 'stage', to: 'self', stats: ['attack'], delta: 1 }])
  ]),
  trait('unbreakable', [{ type: 'overexertion', params: { cannotFaint: true } }]),
  trait('vigorous', [
    {
      type: 'damageDealtModifier',
      params: { percent: 50, when: [{ if: 'overexerting', who: 'self' }] }
    }
  ]),
  trait('efficient', [{ type: 'staminaCostPercent', params: { percent: -30, damaging: true } }]),
  trait('kinetic', [onSelf('cast', [{ do: 'stamina', to: 'self', eventHpPercent: 100 }])]),
  trait('patient', [
    onSelf('cast', [{ do: 'stamina', to: 'self', percent: 15 }], {
      when: [{ if: 'skillHold', min: 1 }]
    })
  ]),
  trait('brumation', [
    onSelf('rest', [
      { do: 'stage', to: 'self', stats: ['defense'], delta: 1 },
      { do: 'reduceHold', to: 'self', turns: 1 }
    ])
  ])
)
const data = createGameData(withFixtureText(raw))

const user = (traitIds: string[] = [], fields: Partial<Monster> = {}): Monster =>
  makeMonster({
    id: 'a',
    skillIds: ['heavyHit', 'heldHit'],
    level: 50,
    traits: traitIds.map((id) => ({ id, level: 1 })),
    ...fields
  })
const foe = (): Monster => makeMonster({ id: 'e', skillIds: ['idle'], level: 50 })

/** Trận với quái ta đã mất `staminaUsed` thể lực. */
function stateOf(
  traitIds: string[] = [],
  staminaUsed = 0,
  fields: Partial<Monster> = {}
): GameState {
  const state = makeBattleState([user(traitIds, fields)], [foe()])
  if (staminaUsed > 0) defined(state.battle).records.a = { ...emptyRecord(), staminaUsed }
  return state
}

const turn = (state: GameState, skillId: string): GameState =>
  gameReducer(data, state, {
    type: 'submitTurn',
    commands: [{ slot: 0, kind: 'skill', skillId, target: 0 }]
  })
const rest = (state: GameState): GameState =>
  gameReducer(data, state, { type: 'submitTurn', commands: [{ slot: 0, kind: 'rest' }] })
const staminaOf = (state: GameState): number => {
  const d = cloneDraft(state)
  return currentStamina(data, d, d.party[0])
}
const foeDamage = (state: GameState): string =>
  defined(defined(state.battle).enemies[0]).damageTaken.toString()
const stageOf = (state: GameState, stat: string): number =>
  defined(state.battle).stages.a?.[stat as 'attack'] ?? 0

describe('luật quá sức theo trait', () => {
  it('Tireless: máu mất giảm một nửa, không mất lượt, sự kiện overexert tăng công', () => {
    // Có 0, giá 40: thiếu 40 → 80% max HP, giảm còn 40%.
    const state = turn(stateOf(['tireless'], 100), 'heavyHit')
    const monster = defined(state.party[0])
    expect(monster.damageTaken.eq(getMaxHp(data, monster).times(40).div(100).ceil())).toBe(true)
    expect(defined(state.battle).records.a.exhaustedTurn).toBeUndefined()
    expect(defined(state.battle).records.a.overexerting).toBeUndefined()
    expect(stageOf(state, 'attack')).toBe(1)
  })

  it('chặn gục: còn 1 HP; không có trait thì gục', () => {
    const nearDead = (traitIds: string[]): GameState => {
      const state = stateOf(traitIds, 100)
      const monster = defined(state.party[0])
      monster.damageTaken = getMaxHp(data, monster).minus(2)
      return state
    }
    const saved = defined(turn(nearDead(['unbreakable']), 'heavyHit').party[0])
    expect(getMaxHp(data, saved).minus(saved.damageTaken).eq(1)).toBe(true)
    const fainted = defined(turn(nearDead([]), 'heavyHit').party[0])
    expect(fainted.damageTaken.eq(getMaxHp(data, fainted))).toBe(true)
  })

  it('Vigorous: đòn quá sức mạnh hơn, đòn đủ thể lực như thường', () => {
    const tired = foeDamage(turn(stateOf(['vigorous'], 100), 'heavyHit'))
    const tiredPlain = foeDamage(turn(stateOf([], 100), 'heavyHit'))
    const fresh = foeDamage(turn(stateOf(['vigorous']), 'heavyHit'))
    expect(Number(tired)).toBeGreaterThan(Number(tiredPlain))
    expect(fresh).toBe(foeDamage(turn(stateOf([]), 'heavyHit')))
  })
})

describe('giá và hồi thể lực theo trait', () => {
  it('Efficient chỉ giảm giá skill gây sát thương', () => {
    const d = cloneDraft(stateOf(['efficient']))
    expect(staminaCostOf(data, d, d.party[0], data.skills.heavyHit)).toBe(28)
    expect(staminaCostOf(data, d, d.party[0], data.skills.idle)).toBe(5)
  })

  it('Kinetic Transfer: hồi theo sát thương quy về tỉ lệ max HP, kẹp ở 100%', () => {
    const plain = staminaOf(turn(stateOf([], 50), 'heavyHit'))
    const kinetic = staminaOf(turn(stateOf(['kinetic'], 50), 'heavyHit'))
    expect(kinetic).toBeGreaterThan(plain)
    // Số cực lớn: sát thương vô cùng lớn so với max HP vẫn chỉ hồi tối đa thể lực tối đa.
    const huge = staminaOf(turn(stateOf(['kinetic'], 50, { level: 1e6 }), 'heavyHit'))
    expect(huge).toBeLessThanOrEqual(100)
    expect(Number.isFinite(huge)).toBe(true)
  })

  it('Patient: chỉ hồi khi skill có hold', () => {
    const ready = (traitIds: string[]): GameState => {
      const state = stateOf(traitIds, 50)
      defined(state.battle).volatiles.a.holdReadyTurns = { heldHit: 1 }
      return state
    }
    expect(staminaOf(turn(ready(['patient']), 'heldHit'))).toBe(
      staminaOf(turn(ready([]), 'heldHit')) + 15
    )
    expect(staminaOf(turn(stateOf(['patient'], 50), 'heavyHit'))).toBe(
      staminaOf(turn(stateOf([], 50), 'heavyHit'))
    )
  })

  it('sự kiện rest (Brumation): tăng thủ, giảm lượt chờ hold', () => {
    const before = stateOf(['brumation'])
    const d = cloneDraft(before)
    const waiting = holdTurnsLeft(d.battle, d.party[0], data.skills.heldHit)
    const after = rest(before)
    const draft = cloneDraft(after)
    expect(stageOf(after, 'defense')).toBe(1)
    // Qua một lượt (−1) và giảm thêm 1 do Brumation.
    expect(holdTurnsLeft(draft.battle, draft.party[0], data.skills.heldHit)).toBe(waiting - 2)
  })
})

describe('kiểm tra dữ liệu hook thể lực', () => {
  it('báo lỗi params sai', () => {
    const issues = dataIssuesAfter((rawData) => {
      rawData.traits.push(
        trait('badOver', [{ type: 'overexertion', params: {} }]),
        trait('badOver2', [{ type: 'overexertion', params: { hpPercent: -150, cannotFaint: 1 } }]),
        trait('badCost', [{ type: 'staminaCostPercent', params: { percent: 10, damaging: 'x' } }]),
        trait('badHold', [onSelf('rest', [{ do: 'reduceHold', to: 'self', turns: 0 }])]),
        trait('badCond', [
          onSelf('cast', [{ do: 'stamina', to: 'self', percent: 5 }], {
            when: [{ if: 'skillHold', min: 0 }]
          })
        ])
      )
    }).join('\n')
    expect(issues).toContain('cần ít nhất một trong hpPercent')
    expect(issues).toContain('hpPercent')
    expect(issues).toContain('cannotFaint chỉ được là true')
    expect(issues).toContain('damaging chỉ được là true')
    expect(issues).toContain('turns')
    expect(issues).toContain('min')
  })
})

describe('giá suy ra của skill trạng thái', () => {
  const costs = { perStage: 1, perHealPercent: 0.5, perStatus: 5, perField: 10, perEffect: 3 }
  const config = { ...data.config.stamina, statusCost: 15, statusEffectCost: costs }
  const status = (fields: Partial<Skill>): Skill =>
    ({ ...base, id: 'x', category: 'status', power: 0, ...fields }) as Skill

  it('cộng điểm theo bậc chỉ số, % hồi, trạng thái, môi trường, hiệu ứng khác, hiệu ứng spell', () => {
    expect(inferredStaminaCost(config, status({}))).toBe(15)
    const stages = [
      { type: 'statStage', params: { who: 'self', stat: 'attack', delta: 2 } },
      { type: 'statStage', params: { who: 'self', stat: 'speed', delta: -1 } }
    ]
    expect(inferredStaminaCost(config, status({ effects: stages }))).toBe(18)
    const heal = [{ type: 'heal', params: { percent: 50 } }]
    expect(inferredStaminaCost(config, status({ effects: heal }))).toBe(40)
    const mixed = [
      { type: 'applyStatus', params: { statusId: 'x' } },
      { type: 'setField', params: {} },
      { type: 'switchOut', params: {} }
    ]
    expect(inferredStaminaCost(config, status({ effects: mixed }))).toBe(33)
    const spell = {
      onTarget: [{ do: 'stage', to: 'subject', stats: ['attack', 'defense'], delta: -1 }],
      after: [{ do: 'status', to: 'subject', random: 'debuff', count: 3 }]
    }
    expect(inferredStaminaCost(config, status({ spell }))).toBe(32)
  })

  it('skill gây sát thương theo bảng power; kẹp ở thể lực tối đa với số cực lớn', () => {
    expect(inferredStaminaCost(config, { ...status({}), power: 90 } as Skill)).toBe(40)
    const huge = [{ type: 'heal', params: { percent: 1e9 } }]
    expect(inferredStaminaCost(config, status({ effects: huge }))).toBe(config.max)
  })
})
