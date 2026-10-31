// Môi trường trong công thức (mục "Môi trường" ở battle-environment.md): hệ số sát thương (kể cả grounded,
// fieldModifiers, miễn nhiễm theo trait), bước môi trường của computeStats, trait chỉ số theo môi
// trường, accuracy, điểm AI (setField, applyStatus bị chặn).

import { describe, expect, it } from 'vitest'
import { computeStats, getMaxHp } from '../monster'
import { SKILL_EFFECTS, fieldBenefit, type SkillEffectAiContext } from '../registries'
import { BIG_ZERO, createRng, toBig } from '../shared'
import { makeArena, makeEnvironmentData, makeField, makeMonster, uniformStats } from '../testing'
import type { BattleField, Monster } from '../model'
import { computeDamage, expectedDamage, type DamageInput } from './damage'
import { skillAccuracy } from './environment'

// Quái mẫu: mọi chỉ số 50, hệ cỏ. Skill đặc biệt / vật lý 50 không STAB: 7,5 sát thương.
const data = makeEnvironmentData()

const flyer = (overrides: Parameters<typeof makeMonster>[0] = {}): Monster =>
  makeMonster({ elementIds: ['grass', 'flying'], ...overrides })

function damage(overrides: Partial<DamageInput>, field?: BattleField): number {
  return computeDamage({
    data,
    attacker: makeMonster({ id: 'atk', elementIds: ['ghost'] }),
    defender: makeMonster({ id: 'def' }),
    skill: data.skills.strike,
    spread: false,
    rng: createRng(1),
    arena: field && makeArena(field),
    ...overrides
  }).damage.toNumber()
}

describe('hệ số sát thương của môi trường', () => {
  it('mưa: nước × 1,5, lửa × 0,5; không có môi trường thì như cũ', () => {
    const rain = makeField({ weather: 'rain' })
    expect(damage({ skill: data.skills.splash })).toBe(7)
    expect(damage({ skill: data.skills.splash }, rain)).toBe(11) // 7,5 × 1,5
    // blast (lửa) vào hệ cỏ ×2: 15 → × 0,5 = 7,5
    expect(damage({ skill: data.skills.blast }, makeField())).toBe(15)
    expect(damage({ skill: data.skills.blast }, rain)).toBe(7)
  })

  it('địa hình chỉ tăng skill của quái đánh đứng trên mặt đất (hệ Bay, trait không chạm đất)', () => {
    const grassy = makeField({ terrain: 'grassy' })
    const leaf = data.skills.leaf
    // Quái hệ cỏ: STAB 1,5 → 11,25; trên địa hình cỏ × 1,5 = 16,875.
    expect(damage({ skill: leaf, attacker: makeMonster() }, grassy)).toBe(16)
    expect(damage({ skill: leaf, attacker: flyer() }, grassy)).toBe(11)
    const hovering = makeMonster({ traits: [{ id: 'hover', level: 1 }] })
    expect(damage({ skill: leaf, attacker: hovering }, grassy)).toBe(11)
  })

  it('địa hình sương: giảm sát thương lên quái nhận đứng trên mặt đất', () => {
    const misty = makeField({ terrain: 'misty' })
    expect(damage({}, misty)).toBe(3) // 7,5 × 0,5
    expect(damage({ defender: flyer() }, misty)).toBe(7)
  })

  it('fieldModifiers.powerMultiplier của skill chỉ khi môi trường đó có mặt', () => {
    expect(damage({ skill: data.skills.thunder }, makeField({ weather: 'storm' }))).toBe(15)
    expect(damage({ skill: data.skills.thunder }, makeField({ weather: 'rain' }))).toBe(7)
  })

  it('fieldModifiers.power thay sức mạnh gốc, rồi mới nhân powerMultiplier', () => {
    // power 30: 0,3 × 0,3 × 50 = 4,5; power 50: 7,5.
    expect(damage({ skill: data.skills.solar }, makeField())).toBe(4)
    expect(damage({ skill: data.skills.solar })).toBe(4)
    expect(damage({ skill: data.skills.solar }, makeField({ weather: 'rain' }))).toBe(7)
    expect(damage({ skill: data.skills.solar }, makeField({ weather: 'storm' }))).toBe(7)
  })

  it('AI dự đoán sát thương cũng tính môi trường (công thức dùng chung)', () => {
    const input = {
      data,
      attacker: makeMonster({ elementIds: ['ghost'] }),
      defender: makeMonster(),
      skill: data.skills.splash,
      spread: false
    }
    expect(expectedDamage(input).toNumber()).toBe(7.5)
    expect(
      expectedDamage({ ...input, arena: makeArena(makeField({ weather: 'rain' })) }).toNumber()
    ).toBe(11.25)
  })
})

describe('trait elementDamageTaken (miễn nhiễm / giảm sát thương theo hệ)', () => {
  it('−100% khai báo là miễn nhiễm thật: sát thương 0, hệ số ghi 0, AI dự đoán 0', () => {
    const floater = makeMonster({ id: 'def', traits: [{ id: 'floater', level: 1 }] })
    const result = computeDamage({
      data,
      attacker: makeMonster({ elementIds: ['ghost'] }),
      defender: floater,
      skill: data.skills.strike,
      spread: false,
      rng: createRng(1)
    })
    expect(result.damage.toNumber()).toBe(0)
    expect(result.effectiveness).toBe(0)
    const predicted = expectedDamage({
      data,
      attacker: makeMonster(),
      defender: floater,
      skill: data.skills.strike,
      spread: false
    })
    expect(predicted.toNumber()).toBe(0)
    // Hệ khác vẫn trúng bình thường.
    expect(damage({ skill: data.skills.blast, defender: floater })).toBe(15)
  })

  it('giảm theo %, nhân cấp; hệ số chạm 0 do cấp vẫn tối thiểu 1 (không thành miễn nhiễm)', () => {
    expect(damage({ defender: makeMonster({ traits: [{ id: 'fatty', level: 1 }] }) })).toBe(3)
    // Cấp 6: −50% × 2 = −100% → hệ số 0, sát thương tối thiểu 1.
    expect(damage({ defender: makeMonster({ traits: [{ id: 'fatty', level: 6 }] }) })).toBe(1)
  })
})

describe('bước môi trường của computeStats', () => {
  it('bão: thủ đặc biệt hệ lửa × 1,5; hệ khác, HP và ngoài trận không đổi', () => {
    const storm = makeField({ weather: 'storm' })
    const fire = makeMonster({ elementIds: ['fire'] })
    const stats = computeStats(data, fire, { field: storm })
    expect(stats.withStatuses.spDefense.toNumber()).toBe(50)
    expect(stats.withField.spDefense.toNumber()).toBe(75)
    expect(stats.final.spDefense.toNumber()).toBe(75)
    expect(stats.final.hp.toNumber()).toBe(50)
    expect(computeStats(data, makeMonster(), { field: storm }).final.spDefense.toNumber()).toBe(50)
    const outside = computeStats(data, fire)
    expect(outside.withField).toEqual(outside.withStatuses)
    expect(outside.final.spDefense.toNumber()).toBe(50)
  })

  it('trait chỉ số theo thời tiết cộng % ở bước trait, nhân cấp; chỉ khi đúng thời tiết', () => {
    const swimmer = (level: number): Monster => makeMonster({ traits: [{ id: 'swimmer', level }] })
    const rain = makeField({ weather: 'rain' })
    expect(computeStats(data, swimmer(1), { field: rain }).withTraits.speed.toNumber()).toBe(100)
    expect(computeStats(data, swimmer(2), { field: rain }).final.speed.toNumber()).toBe(110)
    expect(computeStats(data, swimmer(1), { field: makeField() }).final.speed.toNumber()).toBe(50)
    expect(computeStats(data, swimmer(1)).final.speed.toNumber()).toBe(50)
  })

  it('trait chỉ số theo địa hình chỉ tác dụng khi quái đứng trên mặt đất', () => {
    const grassy = makeField({ terrain: 'grassy' })
    const surfer = { traits: [{ id: 'surfer', level: 1 }] }
    expect(computeStats(data, makeMonster(surfer), { field: grassy }).final.speed.toNumber()).toBe(
      100
    )
    expect(computeStats(data, flyer(surfer), { field: grassy }).final.speed.toNumber()).toBe(50)
  })

  it('số cực lớn không ra Infinity / NaN', () => {
    const huge = makeMonster({ elementIds: ['fire'], genes: uniformStats(1e300) })
    const stats = computeStats(data, huge, { field: makeField({ weather: 'storm' }) })
    expect(stats.final.spDefense.isFinite()).toBe(true)
    expect(stats.final.spDefense.eq(stats.withStatuses.spDefense.times(1.5).floor())).toBe(true)
  })
})

describe('skillAccuracy', () => {
  it('sương mù nhân accuracy mọi skill; không có môi trường liên quan thì giữ nguyên', () => {
    const fog = makeField({ weather: 'fog' })
    expect(skillAccuracy(data, makeField(), data.skills.shaky)).toBe(50)
    expect(skillAccuracy(data, fog, data.skills.strike)).toBe(50)
    expect(skillAccuracy(data, fog, data.skills.shaky)).toBe(25)
  })

  it('fieldModifiers: luôn trúng, accuracy thay thế (rồi mới nhân môi trường)', () => {
    expect(skillAccuracy(data, makeField(), data.skills.thunder)).toBe(50)
    expect(skillAccuracy(data, makeField({ weather: 'rain' }), data.skills.thunder)).toBe(100)
    expect(skillAccuracy(data, makeField({ weather: 'fog' }), data.skills.thunder)).toBe(50)
    expect(skillAccuracy(data, makeField({ weather: 'storm' }), data.skills.thunder)).toBe(50)
  })
})

describe('AI: điểm của setField và applyStatus theo môi trường', () => {
  const user = makeMonster({ id: 'u', skillIds: ['splash'] })
  const foe = makeMonster({ id: 'f', skillIds: ['blast'] })
  const context = (overrides: Partial<SkillEffectAiContext> = {}): SkillEffectAiContext => ({
    data,
    user,
    target: user,
    targetIsAlly: true,
    stages: {},
    expectedDamage: BIG_ZERO,
    field: makeField(),
    side: 'player',
    allies: [user],
    foes: [foe],
    allyReserves: [],
    foeReserves: [],
    ...overrides
  })
  const rain = { layer: 'weather', fieldId: 'rain' }

  it('fieldWeight × (lợi phe mình − lợi phe địch)', () => {
    // Phe mình: skill nước được tăng (+1); phe địch: skill lửa bị giảm (−1) → chênh 2 × 0,3.
    expect(SKILL_EFFECTS.setField.aiValue(rain, context())).toBeCloseTo(0.6)
    // Trait theo thời tiết có lợi cộng thêm 1.
    const swimmer = makeMonster({
      id: 'u',
      skillIds: ['splash'],
      traits: [{ id: 'swimmer', level: 1 }]
    })
    expect(SKILL_EFFECTS.setField.aiValue(rain, context({ allies: [swimmer] }))).toBeCloseTo(0.9)
    // Ngược phe thì âm.
    expect(
      SKILL_EFFECTS.setField.aiValue(rain, context({ allies: [foe], foes: [user] }))
    ).toBeCloseTo(-0.6)
  })

  it('0 khi môi trường đó đang có cả trận hoặc còn ≥ 2 lượt; còn 1 lượt thì vẫn có giá trị', () => {
    expect(
      SKILL_EFFECTS.setField.aiValue(rain, context({ field: makeField({ weather: 'rain' }) }))
    ).toBe(0)
    const twoLeft = makeField({ weather: 'rain' }, 2)
    expect(SKILL_EFFECTS.setField.aiValue(rain, context({ field: twoLeft }))).toBe(0)
    const oneLeft = makeField({ weather: 'rain' }, 1)
    expect(SKILL_EFFECTS.setField.aiValue(rain, context({ field: oneLeft }))).toBeCloseTo(0.6)
  })

  it('lợi của một quái: sát thương môi trường −1, trait miễn thì 0', () => {
    expect(fieldBenefit(data, makeMonster(), 'storm')).toBe(-1)
    expect(fieldBenefit(data, makeMonster({ traits: [{ id: 'coat', level: 1 }] }), 'storm')).toBe(0)
    // Hệ lửa: miễn sát thương bão, thủ đặc biệt × 1,5 → +1.
    expect(fieldBenefit(data, makeMonster({ elementIds: ['fire'] }), 'storm')).toBe(1)
    // Hồi máu trên địa hình cỏ (+1) chỉ khi đứng trên mặt đất.
    expect(fieldBenefit(data, makeMonster(), 'grassy')).toBe(1)
    expect(fieldBenefit(data, flyer(), 'grassy')).toBe(0)
    // fieldModifiers: sức mạnh thay thế cao hơn gốc (+1); luôn trúng (+1).
    expect(fieldBenefit(data, makeMonster({ skillIds: ['solar'] }), 'rain')).toBe(1)
    expect(fieldBenefit(data, makeMonster({ skillIds: ['thunder'] }), 'rain')).toBe(1)
  })

  it('applyStatus: 0 khi môi trường chặn trạng thái đó trên mục tiêu', () => {
    const calm = makeField({ terrain: 'calm' })
    const sleep = { statusId: 'sleep' }
    const target = makeMonster({ id: 't' })
    const scored = (field: BattleField, monster: Monster): number =>
      SKILL_EFFECTS.applyStatus.aiValue(
        sleep,
        context({ field, target: monster, targetIsAlly: false })
      )
    expect(scored(calm, target)).toBe(0)
    expect(scored(calm, flyer({ id: 't' }))).toBeCloseTo(0.35)
    expect(scored(makeField(), target)).toBeCloseTo(0.35)
  })
})

describe('max HP không đổi theo môi trường', () => {
  it('getMaxHp ngoài trận bằng HP trong mọi môi trường', () => {
    const fire = makeMonster({ elementIds: ['fire'], damageTaken: toBig(0) })
    expect(getMaxHp(data, fire).toNumber()).toBe(
      computeStats(data, fire, { field: makeField({ weather: 'storm' }) }).final.hp.toNumber()
    )
  })
})
