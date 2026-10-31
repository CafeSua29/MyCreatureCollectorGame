// Hook trait chỉ số có điều kiện và theo đồng đội (registries/conditionalTraitHooks.ts).

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { computeStats } from '../monster'
import { expectedDamage } from './damage'
import { battleStats, cloneDraft, monsterBattleContext } from './draft'
import { skillAccuracy } from './environment'
import { toBig } from '../shared'
import {
  dataIssuesAfter,
  defined,
  makeArena,
  makeBattleState,
  makeField,
  makeMonster,
  makeRawData,
  uniformStats,
  makeBattleContext,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { BigStats, GameData, Monster, MonsterBattleContext, TraitDef } from '../model'

function trait(id: string, type: string, params: unknown): TraitDef {
  return { id, kind: 'rare', hooks: [{ type, params }] }
}

const TRAITS: TraitDef[] = [
  trait('lowHp', 'statModifierWhileLowHp', { hpBelowPercent: 50, percent: { attack: 20 } }),
  trait('highHp', 'statModifierWhileHighHp', { hpAbovePercent: 50, percent: { speed: 20 } }),
  trait('guts', 'statModifierWhileStatused', { percent: { attack: 50 } }),
  {
    id: 'gutsFull',
    kind: 'rare',
    hooks: [
      { type: 'statModifierWhileStatused', params: { percent: { attack: 50 } } },
      { type: 'ignoreStatusDamagePenalty', params: {} }
    ]
  },
  trait('slowStart', 'statModifierFirstTurns', { turns: 2, percent: { attack: -50 } }),
  trait('together', 'statModifierWithAlly', { percent: { defense: 10 } }),
  trait('leader', 'aura', {
    scope: 'allies',
    stacks: true,
    hooks: [{ type: 'statModifier', params: { percent: { attack: 10 } } }]
  }),
  trait('friendGuard', 'aura', {
    scope: 'allies',
    stacks: true,
    hooks: [{ type: 'damageTakenModifier', params: { percent: -25 } }]
  }),
  trait('flies', 'aura', {
    scope: 'foes',
    stacks: true,
    hooks: [{ type: 'accuracyModifier', params: { percent: -10 } }]
  })
]

const data: GameData = (() => {
  const raw = makeRawData()
  raw.traits.push(...TRAITS)
  return createGameData(withFixtureText(raw))
})()

/** Quái mẫu mọi chỉ số 50 (max HP 50), trait cho trước ở cấp `level`. */
const withTraits = (
  id: string,
  traitIds: string[] = [],
  level = 1,
  extra: MonsterOverrides = {}
): Monster =>
  makeMonster({ id, traits: traitIds.map((traitId) => ({ id: traitId, level })), ...extra })

const context = (turnsOnField: number, allies: Monster[] = []): MonsterBattleContext =>
  makeBattleContext({ turnsOnField, allies })

const statsOf = (monster: Monster, battle?: MonsterBattleContext): BigStats =>
  computeStats(data, monster, { battle }).withTraits

describe('chỉ số theo máu và trạng thái', () => {
  it('statModifierWhileLowHp: máu ≤ ngưỡng (cả ngoài trận), ngưỡng không nhân cấp', () => {
    const at = (damageTaken: number, level = 1): number =>
      statsOf(withTraits('m', ['lowHp'], level, { damageTaken })).attack.toNumber()
    expect(at(0)).toBeCloseTo(50)
    expect(at(24)).toBeCloseTo(50) // còn 52%
    expect(at(25)).toBeCloseTo(60) // còn 50%
    expect(at(25, 6)).toBeCloseTo(70) // cấp 6: +40%
    expect(at(24, 6)).toBeCloseTo(50)
  })

  it('statModifierWhileHighHp: máu > ngưỡng', () => {
    const at = (damageTaken: number): number =>
      statsOf(withTraits('m', ['highHp'], 1, { damageTaken })).speed.toNumber()
    expect(at(0)).toBeCloseTo(60)
    expect(at(24)).toBeCloseTo(60)
    expect(at(25)).toBeCloseTo(50)
  })

  it('max HP không đổi theo trait có điều kiện; số cực lớn vẫn đúng tỉ lệ máu', () => {
    const huge = withTraits('m', ['lowHp'], 1, {
      genes: { ...uniformStats(10), hp: '1e1000', attack: '1e1000' },
      damageTaken: '1.5e1000'
    })
    const stats = statsOf(huge)
    // Max HP 2e1000 (+30), còn 25% → +20% công.
    expect(stats.hp.div('2e1000').minus(1).abs().lt(1e-30)).toBe(true)
    expect(stats.attack.div('2.4e1000').minus(1).abs().lt(1e-30)).toBe(true)
  })

  it('statModifierWhileStatused: khi có trạng thái bất thường', () => {
    expect(statsOf(withTraits('m', ['guts'])).attack.toNumber()).toBeCloseTo(50)
    const poisoned = withTraits('m', ['guts'], 1, {
      statuses: [{ statusId: 'poison', turnsLeft: 2 }]
    })
    expect(statsOf(poisoned).attack.toNumber()).toBeCloseTo(75)
  })
})

describe('Guts như Pokémon: bỏ qua hệ số giảm sát thương của trạng thái', () => {
  const burned: MonsterOverrides = { statuses: [{ statusId: 'burn', turnsLeft: 2 }] }
  const hit = (attacker: Monster): number =>
    expectedDamage({
      data,
      attacker,
      defender: withTraits('def'),
      skill: data.skills.strike,
      spread: false
    }).toNumber()

  it('bỏng: không trait × 0,5; Guts đủ (+50% công, bỏ qua bỏng); chỉ +50% công thì vẫn × 0,5', () => {
    expect(hit(withTraits('atk', [], 1, burned))).toBeCloseTo(3.75)
    // Công 75: 0,3 × 50 × 75 × 75 / (100 × 50) = 16,875.
    expect(hit(withTraits('atk', ['gutsFull'], 1, burned))).toBeCloseTo(16.875)
    expect(hit(withTraits('atk', ['guts'], 1, burned))).toBeCloseTo(8.4375)
  })

  it('không trạng thái thì Guts không đổi gì', () => {
    expect(hit(withTraits('atk', ['gutsFull']))).toBeCloseTo(7.5)
  })

  it('params phải rỗng', () => {
    const issues = dataIssuesAfter(
      (raw) => raw.traits.push(trait('broken', 'ignoreStatusDamagePenalty', { x: 1 })),
      { regenerateText: true }
    )
    expect(issues.some((issue) => issue.includes('broken'))).toBe(true)
  })
})

describe('chỉ số theo lượt trên sân và đồng đội', () => {
  it('statModifierFirstTurns: chỉ trong trận, lượt trên sân ≤ turns (vào giữa lượt = 0)', () => {
    const monster = withTraits('m', ['slowStart'])
    expect(statsOf(monster).attack.toNumber()).toBeCloseTo(50)
    expect(statsOf(monster, context(0)).attack.toNumber()).toBeCloseTo(25)
    expect(statsOf(monster, context(2)).attack.toNumber()).toBeCloseTo(25)
    expect(statsOf(monster, context(3)).attack.toNumber()).toBeCloseTo(50)
  })

  it('statModifierWithAlly: khi có đồng đội còn sống trên sân', () => {
    const monster = withTraits('m', ['together'])
    expect(statsOf(monster, context(1)).defense.toNumber()).toBeCloseTo(50)
    expect(statsOf(monster, context(1, [withTraits('a')])).defense.toNumber()).toBeCloseTo(55)
  })

  it('hào quang đồng đội (thay allyStatModifier): buff đồng đội theo cấp trait của đồng đội, không buff chính nó', () => {
    const plain = withTraits('m')
    expect(statsOf(plain, context(1, [withTraits('a', ['leader'])])).attack.toNumber()).toBeCloseTo(
      55
    )
    expect(
      statsOf(plain, context(1, [withTraits('a', ['leader'], 6)])).attack.toNumber()
    ).toBeCloseTo(60)
    expect(statsOf(withTraits('m', ['leader']), context(1)).attack.toNumber()).toBeCloseTo(50)
  })
})

describe('trong trận', () => {
  it('monsterBattleContext: lượt trên sân theo firstTurn, đồng đội còn sống trên sân', () => {
    const state = makeBattleState(
      [withTraits('a'), withTraits('b', ['leader']), withTraits('c')],
      [withTraits('e')]
    )
    const d = cloneDraft(state)
    d.battle.turn = 3
    d.battle.volatiles.a = { firstTurn: 2 }
    const a = defined(d.party[0])
    const ctx = defined(monsterBattleContext(data, d, a))
    expect(ctx.turnsOnField).toBe(2)
    expect(ctx.allies.map((m) => m.id)).toEqual(['b'])
    expect(battleStats(data, d, a).attack.toNumber()).toBe(55)
    // Quái không ở trên sân: không có bối cảnh.
    expect(monsterBattleContext(data, d, defined(d.party[2]))).toBeUndefined()
    // Đồng đội gục thì không còn buff.
    defined(d.party[1]).damageTaken = toBig(50)
    expect(defined(monsterBattleContext(data, d, a)).allies).toEqual([])
  })

  it('hào quang đồng đội (thay allyDamageTakenModifier): giảm sát thương đồng đội nhận, không phải chính nó', () => {
    const hit = (defenderTraits: string[], allies: Monster[]): number =>
      expectedDamage({
        data,
        attacker: withTraits('atk'),
        defender: withTraits('def', defenderTraits),
        skill: data.skills.strike,
        spread: false,
        arena: makeArena(makeField(), { defenderContext: context(1, allies) })
      }).toNumber()
    expect(hit([], [])).toBeCloseTo(7.5)
    expect(hit([], [withTraits('g', ['friendGuard'])])).toBeCloseTo(5.625)
    expect(hit(['friendGuard'], [])).toBeCloseTo(7.5)
  })

  it('hào quang lên địch (thay accuracyModifierFoes): đổi accuracy của quái địch trên sân', () => {
    const user = withTraits('u')
    const shaky = data.skills.shaky // accuracy 50
    expect(skillAccuracy(data, makeField(), shaky, { user })).toBeCloseTo(50)
    const userCtx = makeBattleContext({ foes: [withTraits('f', ['flies'])] })
    expect(skillAccuracy(data, makeField(), shaky, { user, userCtx })).toBeCloseTo(45)
  })
})

describe('kiểm tra params', () => {
  const issuesWith = (type: string, params: unknown): string[] =>
    dataIssuesAfter((raw) => raw.traits.push(trait('broken', type, params)), {
      regenerateText: true
    })

  it('báo lỗi params sai, kể cả đổi HP trong hook có điều kiện', () => {
    const cases: [string, unknown, string][] = [
      ['statModifierWhileLowHp', { hpBelowPercent: 50, percent: { hp: 10 } }, 'hp'],
      [
        'statModifierWhileLowHp',
        { hpBelowPercent: 120, percent: { attack: 10 } },
        'hpBelowPercent'
      ],
      ['statModifierWhileHighHp', { percent: { attack: 10 } }, 'hpAbovePercent'],
      ['statModifierWhileStatused', {}, 'percent là bắt buộc'],
      ['statModifierFirstTurns', { turns: 0, percent: { attack: 10 } }, 'turns'],
      ['statModifierWithAlly', { percent: { luck: 10 } }, 'luck'],
      [
        'aura',
        { scope: 'allies', hooks: [{ type: 'statModifier', params: { percent: { hp: 5 } } }] },
        'hp'
      ],
      [
        'aura',
        { scope: 'allies', hooks: [{ type: 'damageTakenModifier', params: {} }] },
        'percent'
      ],
      ['aura', null, 'params phải là object']
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
