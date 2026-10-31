// Hook trait của công thức sát thương, chí mạng và trúng đòn (registries/combatTraitHooks.ts).

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { computeDamage, expectedDamage, type DamageFormulaInput } from './damage'
import { skillAccuracy } from './environment'
import { traitCritChance, traitCritMultiplier } from '../registries'
import { createRng, toBig, type Decimal } from '../shared'
import { gameReducer } from '../game'
import {
  dataIssuesAfter,
  defined,
  makeBattleState,
  makeField,
  makeMonster,
  makeRawData,
  uniformStats,
  withFixtureText,
  type MonsterOverrides
} from '../testing'
import type { GameData, Monster, RawGameData, TraitDef } from '../model'

const TRAITS: TraitDef[] = [
  trait('fireAdept', 'elementDamageDealt', { elementIds: ['fire'], percent: 20 }),
  trait('blaze', 'elementDamageDealt', { elementIds: ['fire'], percent: 50, hpBelowPercent: 33 }),
  trait('finisher', 'damageVsLowHp', { hpBelowPercent: 50, percent: 50 }),
  trait('multiscale', 'damageTakenAtFullHp', { percent: -50 }),
  trait('solidRock', 'effectivenessModifier', {
    side: 'taken',
    when: 'superEffective',
    percent: -25
  }),
  trait('tintedLens', 'effectivenessModifier', {
    side: 'dealt',
    when: 'notVeryEffective',
    percent: 100
  }),
  trait('technician', 'lowPowerSkillBoost', { maxPower: 60, percent: 50 }),
  trait('pierce', 'ignoreDefensePercent', { percent: 50 }),
  trait('adaptability', 'stabMultiplier', { multiplier: 2 }),
  trait('superLuck', 'critChanceModifier', { percent: 100 }),
  trait('sniper', 'critDamageModifier', { percent: 50 }),
  trait('battleArmor', 'critImmunity', {}),
  trait('compoundEyes', 'accuracyModifier', { percent: 30 }),
  trait('dodge', 'evasion', { percent: 20 })
]

function trait(id: string, type: string, params: unknown): TraitDef {
  return { id, kind: 'rare', hooks: [{ type, params }] }
}

function combatRaw(): RawGameData {
  const raw = makeRawData()
  raw.traits.push(...TRAITS)
  return raw
}

function makeCombatData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = combatRaw()
  edit(raw)
  return createGameData(withFixtureText(raw))
}

const data = makeCombatData()

/** Quái mẫu mọi chỉ số 50, hệ cỏ; trait cho trước ở cấp `level`. */
const withTraits = (
  id: string,
  traitIds: string[] = [],
  level = 1,
  extra: MonsterOverrides = {}
): Monster =>
  makeMonster({ id, traits: traitIds.map((traitId) => ({ id: traitId, level })), ...extra })

// Fixture không chí mạng, dao động = 1 nên expectedDamage là sát thương chưa làm tròn.
// strike (thường, vật lý, 50) công = thủ = 50: 0,3 × 50 × 50 × 50 / (100 × 50) = 7,5.
function expected(overrides: Partial<DamageFormulaInput>, gameData = data): number {
  return expectedDamage({
    data: gameData,
    attacker: withTraits('atk'),
    defender: withTraits('def'),
    skill: gameData.skills.strike,
    spread: false,
    ...overrides
  }).toNumber()
}

describe('sát thương theo hệ và máu', () => {
  it('elementDamageDealt: chỉ skill đúng hệ, nhân theo cấp trait', () => {
    // blast (lửa, đặc biệt, 50) vào hệ cỏ: 7,5 × 2 = 15.
    expect(expected({ skill: data.skills.blast })).toBeCloseTo(15)
    expect(
      expected({ attacker: withTraits('atk', ['fireAdept']), skill: data.skills.blast })
    ).toBeCloseTo(18)
    expect(expected({ attacker: withTraits('atk', ['fireAdept']) })).toBeCloseTo(7.5)
    // Cấp 6: 20% × 2 = 40%.
    expect(
      expected({ attacker: withTraits('atk', ['fireAdept'], 6), skill: data.skills.blast })
    ).toBeCloseTo(21)
  })

  it('elementDamageDealt có hpBelowPercent: chỉ khi máu người đánh ≤ ngưỡng (ngưỡng không nhân cấp)', () => {
    const attacker = (damageTaken: number, level = 1): Monster =>
      withTraits('atk', ['blaze'], level, { damageTaken: toBig(damageTaken) })
    // Max HP 50: còn 17 (34%) chưa bật, còn 16 (32%) bật.
    expect(expected({ attacker: attacker(33), skill: data.skills.blast })).toBeCloseTo(15)
    expect(expected({ attacker: attacker(34), skill: data.skills.blast })).toBeCloseTo(22.5)
    expect(expected({ attacker: attacker(33, 10), skill: data.skills.blast })).toBeCloseTo(15)
  })

  it('damageVsLowHp: mục tiêu máu ≤ ngưỡng', () => {
    const attacker = withTraits('atk', ['finisher'])
    expect(expected({ attacker })).toBeCloseTo(7.5)
    expect(
      expected({ attacker, defender: withTraits('def', [], 1, { damageTaken: toBig(25) }) })
    ).toBeCloseTo(11.25)
  })

  it('damageTakenAtFullHp: chỉ khi bên nhận đầy máu', () => {
    expect(expected({ defender: withTraits('def', ['multiscale']) })).toBeCloseTo(3.75)
    const hurt = withTraits('def', ['multiscale'], 1, { damageTaken: toBig(1) })
    expect(expected({ defender: hurt })).toBeCloseTo(7.5)
  })
})

describe('khắc chế, sức mạnh skill, thủ, STAB', () => {
  it('effectivenessModifier taken / dealt theo điều kiện khắc chế', () => {
    // blast lửa vào cỏ ×2: Solid Rock −25%.
    expect(
      expected({ defender: withTraits('def', ['solidRock']), skill: data.skills.blast })
    ).toBeCloseTo(11.25)
    // Trait đúng phía mới có tác dụng: Solid Rock của bên đánh không đổi gì.
    expect(
      expected({ attacker: withTraits('atk', ['solidRock']), skill: data.skills.blast })
    ).toBeCloseTo(15)
    // sap (cỏ) vào hệ lửa ×0,5 (STAB cỏ ×1,5): Tinted Lens +100%.
    const fireDefender = withTraits('def', [], 1, { elementIds: ['fire'] })
    const sap = data.skills.sap
    const plain = expected({ defender: fireDefender, skill: sap })
    expect(
      expected({ attacker: withTraits('atk', ['tintedLens']), defender: fireDefender, skill: sap })
    ).toBeCloseTo(plain * 2)
    // Không khắc / không kháng: không đổi.
    expect(expected({ attacker: withTraits('atk', ['tintedLens']) })).toBeCloseTo(7.5)
  })

  it('miễn nhiễm (hệ số 0) không tính là bị kháng', () => {
    const ghost = withTraits('def', [], 1, { elementIds: ['ghost'] })
    expect(expected({ attacker: withTraits('atk', ['tintedLens']), defender: ghost })).toBe(0)
  })

  it('lowPowerSkillBoost: sức mạnh ≤ maxPower', () => {
    const attacker = withTraits('atk', ['technician'])
    expect(expected({ attacker })).toBeCloseTo(11.25)
    const strong = { ...data.skills.strike, power: 80 }
    expect(expected({ attacker, skill: strong })).toBeCloseTo(12)
  })

  it('ignoreDefensePercent: thủ × (1 − %), cấp cao kẹp 100%, thủ tối thiểu 1', () => {
    expect(expected({ attacker: withTraits('atk', ['pierce']) })).toBeCloseTo(15)
    // Cấp 6: 50% × 2 = 100% → thủ = 1: 0,3 × 50 × 50 × 50 / 100 = 375.
    expect(expected({ attacker: withTraits('atk', ['pierce'], 6) })).toBeCloseTo(375)
    expect(expected({ attacker: withTraits('atk', ['pierce'], 50) })).toBeCloseTo(375)
  })

  it('stabMultiplier: thay STAB khi lớn hơn, cấp chỉ nhân phần tăng thêm, chỉ khi cùng hệ', () => {
    const sap = data.skills.sap
    const base = expected({ skill: sap }) // STAB 1,5
    expect(expected({ attacker: withTraits('atk', ['adaptability']), skill: sap })).toBeCloseTo(
      (base / 1.5) * 2
    )
    expect(expected({ attacker: withTraits('atk', ['adaptability'], 2), skill: sap })).toBeCloseTo(
      (base / 1.5) * 2.2
    )
    expect(expected({ attacker: withTraits('atk', ['adaptability']) })).toBeCloseTo(7.5)
  })

  it('số cực lớn: công 1e1000 vẫn hữu hạn khi bỏ qua thủ và tăng sát thương theo hệ', () => {
    const attacker = makeMonster({
      id: 'atk',
      genes: { ...uniformStats(10), spAttack: '1e1000' },
      traits: [
        { id: 'pierce', level: 1 },
        { id: 'fireAdept', level: 1 }
      ]
    })
    const hit = (user: Monster): Decimal =>
      expectedDamage({
        data,
        attacker: user,
        defender: withTraits('def'),
        skill: data.skills.blast,
        spread: false
      })
    const damage = hit(attacker)
    expect(damage.isFinite()).toBe(true)
    // Bỏ qua 50% thủ ×2, +20% lửa ×1,2 so với cùng quái không trait.
    const ratio = damage.div(hit({ ...attacker, traits: [] }))
    expect(ratio.minus(2.4).abs().lt(1e-20)).toBe(true)
  })
})

describe('chí mạng', () => {
  const attacker = withTraits('atk', ['superLuck', 'sniper'])
  const defender = withTraits('def')

  it('critChanceModifier nhân tỉ lệ (tương đối), kẹp 100; critImmunity về 0', () => {
    const skill = data.skills.strike
    expect(traitCritChance({ data, attacker, defender, skill }, 10)).toBeCloseTo(20)
    expect(traitCritChance({ data, attacker, defender, skill }, 60)).toBe(100)
    const armored = withTraits('def', ['battleArmor'])
    expect(traitCritChance({ data, attacker, defender: armored, skill }, 10)).toBe(0)
  })

  it('critDamageModifier nhân hệ số chí mạng', () => {
    const skill = data.skills.strike
    expect(traitCritMultiplier({ data, attacker, defender, skill }, 1.5)).toBeCloseTo(2.25)
    expect(
      traitCritMultiplier({ data, attacker: withTraits('x'), defender, skill }, 1.5)
    ).toBeCloseTo(1.5)
  })

  it('đánh thật: tỉ lệ 50% + Super Luck luôn chí mạng; Battle Armor không bao giờ', () => {
    const critData = makeCombatData((raw) => (raw.config.battle.critChance = 50))
    const strike = (target: Monster): ReturnType<typeof computeDamage> =>
      computeDamage({
        data: critData,
        attacker,
        defender: target,
        skill: critData.skills.strike,
        spread: false,
        rng: createRng(7)
      })
    const crit = strike(defender)
    expect(crit.critical).toBe(true)
    // 7,5 × 2,25 = 16,875 → 16.
    expect(crit.damage.toNumber()).toBe(16)
    expect(strike(withTraits('def', ['battleArmor'])).critical).toBe(false)
  })
})

describe('accuracy và né đòn', () => {
  const field = makeField()

  it('accuracyModifier của người dùng, evasion của mục tiêu, kẹp 100', () => {
    const shaky = data.skills.shaky // accuracy 50
    const user = withTraits('u', ['compoundEyes'])
    const dodger = withTraits('t', ['dodge'])
    expect(skillAccuracy(data, field, shaky, { user })).toBeCloseTo(65)
    expect(skillAccuracy(data, field, shaky, { user, target: dodger })).toBeCloseTo(52)
    expect(skillAccuracy(data, field, data.skills.strike, { user })).toBe(100)
    expect(skillAccuracy(data, field, data.skills.strike, { target: dodger })).toBe(100)
    expect(
      skillAccuracy(data, field, data.skills.strike, { user: withTraits('u'), target: dodger })
    ).toBeCloseTo(80)
  })

  it('né cấp cao kẹp 100%: không bao giờ trúng', () => {
    const dodger = withTraits('t', ['dodge'], 50)
    expect(
      skillAccuracy(data, field, data.skills.strike, { user: withTraits('u'), target: dodger })
    ).toBe(0)
  })
})

describe('kiểm tra params', () => {
  const issuesWith = (type: string, params: unknown): string[] =>
    dataIssuesAfter(
      (raw) => {
        raw.traits.push(trait('broken', type, params))
      },
      { regenerateText: true }
    )

  it('báo lỗi params sai của từng hook', () => {
    const cases: [string, unknown, string][] = [
      ['elementDamageDealt', { elementIds: ['lava'], percent: 10 }, 'hệ không tồn tại "lava"'],
      [
        'elementDamageDealt',
        { elementIds: ['fire'], percent: 10, hpBelowPercent: 0 },
        'hpBelowPercent'
      ],
      ['damageVsLowHp', { hpBelowPercent: 150, percent: 10 }, 'hpBelowPercent'],
      ['damageTakenAtFullHp', {}, 'percent'],
      ['effectivenessModifier', { side: 'both', when: 'superEffective', percent: 1 }, 'side'],
      ['effectivenessModifier', { side: 'dealt', when: 'always', percent: 1 }, 'when'],
      ['lowPowerSkillBoost', { maxPower: -1, percent: 10 }, 'maxPower'],
      ['ignoreDefensePercent', { percent: 120 }, 'percent'],
      ['stabMultiplier', { multiplier: 0.5 }, 'multiplier'],
      ['critChanceModifier', { percent: 'x' }, 'percent'],
      ['critDamageModifier', null, 'params phải là object'],
      ['critImmunity', { percent: 1 }, 'hook này không có params'],
      ['accuracyModifier', {}, 'percent'],
      ['evasion', { percent: -5 }, 'percent']
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

describe('né đòn trong trận: tính theo từng mục tiêu', () => {
  it('skill đánh cả hai địch: địch né 100% trượt, địch còn lại vẫn trúng', () => {
    const state = makeBattleState(
      [makeMonster({ id: 'a', skillIds: ['wave'] })],
      [
        withTraits('e', ['dodge'], 50, { skillIds: ['idle'] }),
        withTraits('f', [], 1, { skillIds: ['idle'] })
      ]
    )
    const next = gameReducer(data, state, {
      type: 'submitTurn',
      commands: [{ slot: 0, kind: 'skill', skillId: 'wave', target: 0 }]
    })
    const log = defined(next.battle).log
    expect(log.filter((e) => e.type === 'miss').map((e) => 'targetId' in e && e.targetId)).toEqual([
      'e'
    ])
    expect(
      log.filter((e) => e.type === 'damage').map((e) => 'targetId' in e && e.targetId)
    ).toContain('f')
  })
})
