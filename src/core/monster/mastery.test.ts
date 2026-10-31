// Thuần thục skill trên từng quái (docs/rules/skill-mastery.md): tổng exp theo cấp và tính ngược,
// cộng exp (lên nhiều cấp, số cực lớn), hiệu lực theo cấp và mốc, accuracy kẹp 100, kiểm tra trường skillMastery.

import { describe, expect, it } from 'vitest'
import { DataError, Decimal, toBig } from '../shared'
import { makeData, makeMonster } from '../testing'
import {
  addMasteryExp,
  masteredAccuracy,
  masteryBonusAt,
  masteryExpForLevel,
  masteryLevelFromExp,
  masteryOf,
  nextMasteryMilestone,
  skillMasteryBonus,
  validateSkillMastery
} from './mastery'

const data = makeData()

describe('masteryOf / masteryExpForLevel / masteryLevelFromExp', () => {
  it('skill chưa có mục là cấp 1, exp 0', () => {
    const mastery = masteryOf(makeMonster(), 'strike')
    expect(mastery.level).toBe(1)
    expect(mastery.exp.eq(0)).toBe(true)
  })

  it('tổng exp để đạt cấp L = ⌈4 × (L − 1)^2,5⌉', () => {
    expect(masteryExpForLevel(data, 1).toString()).toBe('0')
    expect(masteryExpForLevel(data, 2).toString()).toBe('4')
    // 4 × 2^2,5 = 22,6... làm tròn lên.
    expect(masteryExpForLevel(data, 3).toString()).toBe('23')
    expect(masteryExpForLevel(data, 101).toString()).toBe('400000')
  })

  it('tính ngược: cấp cao nhất có tổng exp ≤ exp, đúng ở sát mốc', () => {
    expect(masteryLevelFromExp(data, toBig(0))).toBe(1)
    expect(masteryLevelFromExp(data, toBig(3))).toBe(1)
    expect(masteryLevelFromExp(data, toBig(4))).toBe(2)
    expect(masteryLevelFromExp(data, toBig(22))).toBe(2)
    expect(masteryLevelFromExp(data, toBig(23))).toBe(3)
    for (const level of [10, 1000, 10 ** 6, 10 ** 12]) {
      const exp = masteryExpForLevel(data, level)
      expect(masteryLevelFromExp(data, exp)).toBe(level)
      expect(masteryLevelFromExp(data, exp.minus(1))).toBe(level - 1)
    }
  })

  it('số cực lớn: cấp vượt số nguyên an toàn là dữ liệu hỏng (DataError)', () => {
    expect(masteryExpForLevel(data, Number.MAX_SAFE_INTEGER).isFinite()).toBe(true)
    expect(() => masteryLevelFromExp(data, new Decimal('1e300'))).toThrow(DataError)
  })
})

describe('addMasteryExp', () => {
  it('chưa đủ exp thì giữ cấp, tạo mục mới, không sửa quái cũ', () => {
    const monster = makeMonster()
    const gained = addMasteryExp(data, monster, { skillId: 'strike', amount: 3 })
    expect(gained).toMatchObject({ levelBefore: 1, level: 1 })
    expect(gained.skillMastery.strike.exp.toString()).toBe('3')
    expect(monster.skillMastery).toEqual({})
  })

  it('exp là tổng tích lũy; lên nhiều cấp một lần', () => {
    const once = addMasteryExp(data, makeMonster(), { skillId: 'strike', amount: 5 })
    expect(once).toMatchObject({ levelBefore: 1, level: 2 })
    expect(once.skillMastery.strike.exp.toString()).toBe('5')
    // Tổng exp cấp 4 = ⌈4 × 3^2,5⌉ = 63.
    const many = addMasteryExp(data, makeMonster(), { skillId: 'strike', amount: 63 })
    expect(many.level).toBe(4)
  })

  it('lượng exp rất lớn tính một lần (không lặp từng cấp)', () => {
    const amount = masteryExpForLevel(data, 10 ** 12)
    const gained = addMasteryExp(data, makeMonster(), { skillId: 'strike', amount })
    expect(gained.level).toBe(10 ** 12)
  })

  it('cấp không bao giờ hạ (cấp lưu cao hơn cấp tính từ exp)', () => {
    const monster = makeMonster({ skillMastery: { strike: { level: 7, exp: toBig(0) } } })
    expect(addMasteryExp(data, monster, { skillId: 'strike', amount: 1 }).level).toBe(7)
  })

  it('giữ mục của skill khác (kể cả skill đã quên)', () => {
    const monster = makeMonster({
      skillMastery: { forgotten: { level: 7, exp: toBig(3) } }
    })
    const { skillMastery } = addMasteryExp(data, monster, { skillId: 'strike', amount: 1 })
    expect(skillMastery.forgotten.level).toBe(7)
  })
})

describe('masteryBonusAt', () => {
  it('cấp 1 không có hiệu lực', () => {
    expect(masteryBonusAt(data, 1)).toEqual({
      powerMultiplier: 1,
      accuracyBonus: 0,
      secondaryChanceMultiplier: 1,
      minHitsBonus: 0
    })
  })

  it('power +5% và accuracy +1 mỗi cấp; mốc cộng dồn (10: +10%, 25: +20%, 50: +1 đòn)', () => {
    const at9 = masteryBonusAt(data, 9)
    expect(at9.powerMultiplier).toBeCloseTo(1.4)
    expect(at9.accuracyBonus).toBe(8)
    expect(at9.secondaryChanceMultiplier).toBe(1)
    expect(masteryBonusAt(data, 10).secondaryChanceMultiplier).toBeCloseTo(1.1)
    expect(masteryBonusAt(data, 25).secondaryChanceMultiplier).toBeCloseTo(1.2)
    expect(masteryBonusAt(data, 49).minHitsBonus).toBe(0)
    const at50 = masteryBonusAt(data, 50)
    expect(at50.minHitsBonus).toBe(1)
    expect(at50.powerMultiplier).toBeCloseTo(3.45)
  })

  it('cấp cực lớn: hệ số hữu hạn', () => {
    const bonus = masteryBonusAt(data, Number.MAX_SAFE_INTEGER)
    expect(Number.isFinite(bonus.powerMultiplier)).toBe(true)
    expect(bonus.minHitsBonus).toBe(1)
  })
})

describe('skillMasteryBonus / masteredAccuracy / nextMasteryMilestone', () => {
  const master = makeMonster({
    skillMastery: {
      strike: { level: 11, exp: toBig(0) },
      maxStrike: { level: 11, exp: toBig(0) }
    }
  })

  it('theo cấp thuần thục của skill; chiêu Max không áp', () => {
    expect(skillMasteryBonus(data, master, data.skills.strike).accuracyBonus).toBe(10)
    expect(skillMasteryBonus(data, master, data.skills.maxStrike).powerMultiplier).toBe(1)
  })

  it('accuracy gốc cộng thuần thục kẹp 100', () => {
    const bonus = masteryBonusAt(data, 11)
    expect(masteredAccuracy(50, bonus)).toBe(60)
    expect(masteredAccuracy(95, bonus)).toBe(100)
    expect(masteredAccuracy(100, bonus)).toBe(100)
    expect(masteredAccuracy(0, masteryBonusAt(data, 1))).toBe(0)
  })

  it('mốc kế tiếp chưa đạt; qua hết thì null', () => {
    expect(nextMasteryMilestone(data, 1)?.level).toBe(10)
    expect(nextMasteryMilestone(data, 10)?.level).toBe(25)
    expect(nextMasteryMilestone(data, 50)).toBeNull()
  })
})

describe('validateSkillMastery', () => {
  it('hợp lệ: rỗng, cấp nguyên ≥ 1, exp ≥ 0 (kể cả số cực lớn)', () => {
    expect(validateSkillMastery(data, {}, 'm')).toEqual([])
    const huge = new Decimal('1e500')
    expect(validateSkillMastery(data, { strike: { level: 3, exp: huge } }, 'm')).toEqual([])
  })

  it('báo lỗi: không phải object, skill lạ, cấp sai, exp âm, trường lạ', () => {
    expect(validateSkillMastery(data, [], 'm')).toEqual(['m phải là object'])
    expect(
      validateSkillMastery(
        data,
        {
          nope: { level: 1, exp: toBig(0) },
          strike: { level: 0, exp: toBig(-1), extra: 1 },
          quick: 5
        },
        'm'
      )
    ).toEqual([
      'm.nope: skill không tồn tại',
      'm.strike: trường lạ "extra"',
      'm.strike.level phải là số nguyên ≥ 1, nhận 0',
      'm.strike.exp phải là số hữu hạn ≥ 0, nhận -1',
      'm.quick phải là object'
    ])
  })
})
