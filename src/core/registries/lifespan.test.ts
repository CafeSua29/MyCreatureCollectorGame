import { describe, expect, it } from 'vitest'
import { DataError, toBig } from '../shared'
import { computeStats } from '../monster'
import { STAT_NAMES, type GameData } from '../model'
import { agingMonster, makeLifespanData, makeMonster } from '../testing'
import {
  ageDaysAtPercent,
  ageExpMultiplier,
  ageStage,
  ageStatPercent,
  ageYears,
  hasReachedLifespanEnd,
  isTooYoungToBreed,
  lifePercent,
  lifespanYears,
  yearsLeft
} from './lifespan'

// Loài fixture thọ 100 năm, levelPercent 1, 10 ngày một năm: quái level 1 thọ 101 năm = 1010 ngày.
const data = makeLifespanData()

describe('lifespanYears: thọ nguyên của quái', () => {
  it('theo loài gốc × level cao nhất, boss, trait (nhân cấp), cộng năm thêm', () => {
    expect(lifespanYears(data, makeMonster()).toNumber()).toBe(101)
    expect(lifespanYears(data, makeMonster({ level: 99 })).toNumber()).toBe(199)
    // Level cao nhất từng đạt (luân hồi reset level không làm thọ nguyên tụt).
    expect(lifespanYears(data, makeMonster({ level: 10, maxLevelReached: 50 })).toNumber()).toBe(
      150
    )
    expect(lifespanYears(data, makeMonster({ bossMultiplier: 3 })).toNumber()).toBe(303)
    const longevity = makeMonster({ traits: [{ id: 'longevity', level: 1 }] })
    expect(lifespanYears(data, longevity).toNumber()).toBeCloseTo(121.2)
    // Cấp 3: +20% × (1 + 0,2 × 2) = +28%.
    const longevity3 = makeMonster({ traits: [{ id: 'longevity', level: 3 }] })
    expect(lifespanYears(data, longevity3).toNumber()).toBeCloseTo(129.28)
    const shortLived = makeMonster({ traits: [{ id: 'shortLived', level: 1 }] })
    expect(lifespanYears(data, shortLived).toNumber()).toBeCloseTo(80.8)
    expect(lifespanYears(data, makeMonster({ lifespanBonusYears: 5 })).toNumber()).toBe(106)
  })

  it('số cực lớn: không trần, không Infinity / NaN', () => {
    const huge = makeMonster({ lifespanBonusYears: toBig('1e500') })
    expect(lifespanYears(data, huge).eq(toBig('1e500').plus(101))).toBe(true)
    // Tuổi theo ngày bị kẹp ở số nguyên an toàn.
    expect(ageDaysAtPercent(data, huge, 50)).toBe(Number.MAX_SAFE_INTEGER)
    const old = { ...huge, aging: true, ageDays: Number.MAX_SAFE_INTEGER }
    expect(Number.isFinite(lifePercent(data, old))).toBe(true)
    expect(hasReachedLifespanEnd(data, old)).toBe(false)
  })

  it('loài thiếu thọ nguyên: DataError', () => {
    const species = data.species.weakling
    if (species.kind !== 'normal') throw new Error('fixture weakling phải là loài thường')
    const { lifespan: _lifespan, ...withoutLifespan } = species
    const broken: GameData = { ...data, species: { ...data.species, weakling: withoutLifespan } }
    expect(() => lifespanYears(broken, makeMonster())).toThrow(DataError)
  })
})

describe('tuổi và giai đoạn tuổi', () => {
  it('tuổi theo ngày, % đã sống, số năm còn lại', () => {
    const monster = { ...makeMonster({ aging: true }), ageDays: 505 }
    expect(ageYears(data, monster).toNumber()).toBe(50.5)
    expect(lifePercent(data, monster)).toBe(50)
    expect(yearsLeft(data, monster).toNumber()).toBe(50.5)
    expect(yearsLeft(data, { ...monster, ageDays: 5000 }).toNumber()).toBe(0)
  })

  it('mốc ấu niên / thành niên / lão niên (làm tròn tuổi lên để đạt đúng mốc)', () => {
    expect(ageStage(data, agingMonster(data, 0))).toBe('young')
    expect(ageStage(data, { ...agingMonster(data, 10), ageDays: 100 })).toBe('young')
    expect(ageStage(data, agingMonster(data, 10))).toBe('adult')
    expect(ageStage(data, { ...agingMonster(data, 70), ageDays: 706 })).toBe('adult')
    expect(ageStage(data, agingMonster(data, 70))).toBe('old')
    expect(ageStage(data, agingMonster(data, 150))).toBe('old')
  })

  it('không già đi (tắt thọ nguyên): không có giai đoạn, không hiệu ứng, không thọ tận', () => {
    const frozen = { ...makeMonster(), ageDays: 99999 }
    expect(ageStage(data, frozen)).toBeNull()
    expect(ageStatPercent(data, frozen)).toBe(0)
    expect(ageExpMultiplier(data, frozen)).toBe(1)
    expect(hasReachedLifespanEnd(data, frozen)).toBe(false)
    expect(isTooYoungToBreed(data, makeMonster())).toBe(false)
  })

  it('% chỉ số: ấu niên −15, thành niên 0, lão niên tuyến tính tới −30 (kẹp ở 100%)', () => {
    expect(ageStatPercent(data, agingMonster(data, 5))).toBe(-15)
    expect(ageStatPercent(data, agingMonster(data, 50))).toBe(0)
    expect(ageStatPercent(data, agingMonster(data, 70))).toBeCloseTo(0, 0)
    expect(ageStatPercent(data, agingMonster(data, 85))).toBeCloseTo(-15, 0)
    expect(ageStatPercent(data, agingMonster(data, 100))).toBe(-30)
    expect(ageStatPercent(data, agingMonster(data, 300))).toBe(-30)
  })

  it('EXP: ấu niên +50%, lão niên −30%; ấu niên chưa breed được', () => {
    expect(ageExpMultiplier(data, agingMonster(data, 5))).toBe(1.5)
    expect(ageExpMultiplier(data, agingMonster(data, 50))).toBe(1)
    expect(ageExpMultiplier(data, agingMonster(data, 80))).toBeCloseTo(0.7)
    expect(isTooYoungToBreed(data, agingMonster(data, 5))).toBe(true)
    expect(isTooYoungToBreed(data, agingMonster(data, 80))).toBe(false)
  })

  it('thọ tận khi tuổi (ngày) ≥ thọ nguyên', () => {
    const monster = makeMonster({ aging: true })
    expect(hasReachedLifespanEnd(data, { ...monster, ageDays: 1009 })).toBe(false)
    expect(hasReachedLifespanEnd(data, { ...monster, ageDays: 1010 })).toBe(true)
  })
})

describe('nguồn % chỉ số "age" trong computeStats', () => {
  it('mọi chỉ số kể cả max HP; thành niên / tắt thọ nguyên không có', () => {
    const young = computeStats(data, agingMonster(data, 5))
    const adult = computeStats(data, agingMonster(data, 50))
    for (const stat of STAT_NAMES) {
      expect(young.percentBySource.age[stat]).toBe(-15)
      expect(adult.percentBySource.age[stat]).toBe(0)
      expect(young.final[stat].lt(adult.final[stat])).toBe(true)
    }
    expect(computeStats(data, makeMonster()).final).toEqual(adult.final)
  })
})
