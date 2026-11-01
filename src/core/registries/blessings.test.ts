// Chúc phúc của thần linh (docs/rules/deities.md): bậc ân sủng theo đường cong đa thức, chúc phúc lặp
// lại theo bậc, % theo kênh, % chỉ số chỉ cho quái có hệ của thần, kiểm tra tham số.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { toBig } from '../shared'
import { FIXTURE_DEITY_ID, makeMonster, makeRawData, withFixtureText } from '../testing'
import {
  BLESSING_EFFECTS,
  blessingMultiplier,
  blessingPercent,
  blessingStatPercent,
  blessingUnlocks,
  favorForRank,
  favorRank
} from './blessings'

const data = createGameData(withFixtureText(makeRawData()))
const deity = data.deities[FIXTURE_DEITY_ID]
const favorAt = (rank: number): Record<string, ReturnType<typeof toBig>> => ({
  [FIXTURE_DEITY_ID]: favorForRank(data, rank)
})

describe('bậc ân sủng', () => {
  it('bậc r cần rankBase × r^rankPower (10 × r²); bậc 0 khi chưa đủ bậc 1', () => {
    expect(favorRank(data, toBig(0))).toBe(0)
    expect(favorRank(data, toBig(9))).toBe(0)
    expect(favorRank(data, toBig(10))).toBe(1)
    expect(favorRank(data, toBig(39))).toBe(1)
    expect(favorRank(data, toBig(40))).toBe(2)
    expect(favorForRank(data, 0).toNumber()).toBe(0)
    expect(favorForRank(data, 3).toNumber()).toBe(90)
  })

  it('không trần: ân sủng cực lớn vẫn ra bậc đúng', () => {
    expect(favorRank(data, toBig('1e20'))).toBe(3162277660)
    expect(favorRank(data, favorForRank(data, 1e7))).toBe(1e7)
  })
})

describe('chúc phúc lặp lại theo bậc', () => {
  it('bậc k mở chúc phúc ((k − 1) mod n), cộng dồn', () => {
    // 3 chúc phúc: bậc 1, 4, 7 mở chúc phúc 0; bậc 3, 6 mở chúc phúc 2.
    expect(blessingUnlocks(deity, 0, 0)).toBe(0)
    expect(blessingUnlocks(deity, 0, 1)).toBe(1)
    expect(blessingUnlocks(deity, 2, 2)).toBe(0)
    expect(blessingUnlocks(deity, 2, 3)).toBe(1)
    expect(blessingUnlocks(deity, 0, 7)).toBe(3)
    expect(blessingUnlocks(deity, 2, 7)).toBe(2)
    expect(blessingUnlocks(deity, 1, 3_000_000)).toBe(1_000_000)
  })

  it('% kênh = tổng hiệu ứng × số lần đã mở; chưa có bậc / không thần / thần lạ = 0', () => {
    const target = { deityId: FIXTURE_DEITY_ID, channel: 'expPercent' } as const
    expect(blessingPercent(data, {}, target)).toBe(0)
    expect(blessingPercent(data, favorAt(1), target)).toBe(10)
    expect(blessingPercent(data, favorAt(4), target)).toBe(20)
    expect(blessingPercent(data, favorAt(3), { ...target, channel: 'moneyPercent' })).toBe(100)
    expect(blessingPercent(data, favorAt(2), { ...target, channel: 'moneyPercent' })).toBe(0)
    expect(blessingPercent(data, favorAt(9), { deityId: null, channel: 'expPercent' })).toBe(0)
    expect(blessingPercent(data, { ghost: toBig(1e6) }, { ...target, deityId: 'ghost' })).toBe(0)
    expect(blessingMultiplier(data, favorAt(6), { ...target, channel: 'moneyPercent' })).toBe(3)
    expect(blessingMultiplier(data, {}, target)).toBe(1)
  })

  it('% chỉ số chỉ cho quái có hệ của thần, mọi chỉ số khi không ghi stat', () => {
    const fire = makeMonster({
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      elementIds: ['fire']
    })
    const grass = makeMonster()
    const target = (monster: typeof fire): { deityId: string; monster: typeof fire } => ({
      deityId: FIXTURE_DEITY_ID,
      monster
    })
    expect(fire.elementIds).toContain('fire')
    expect(blessingStatPercent(data, favorAt(1), target(fire))).toEqual({})
    expect(blessingStatPercent(data, favorAt(5), target(fire))).toEqual({
      hp: 20,
      attack: 20,
      defense: 20,
      spAttack: 20,
      spDefense: 20,
      speed: 20
    })
    expect(blessingStatPercent(data, favorAt(5), target(grass))).toEqual({})
    expect(blessingStatPercent(data, favorAt(5), { deityId: null, monster: fire })).toEqual({})
  })
})

describe('tham số hiệu ứng', () => {
  it('percent khác 0, ≥ −100, không trường lạ; elementStatPercent nhận stat hợp lệ', () => {
    expect(BLESSING_EFFECTS.expPercent.validateParams({ percent: 5 })).toEqual([])
    expect(BLESSING_EFFECTS.expPercent.validateParams({ percent: 0 })).toHaveLength(1)
    expect(BLESSING_EFFECTS.expPercent.validateParams({ percent: -101 })).toHaveLength(1)
    expect(BLESSING_EFFECTS.expPercent.validateParams({ percent: 5, stat: 'hp' })).toHaveLength(1)
    expect(BLESSING_EFFECTS.expPercent.validateParams(null)).toEqual(['params phải là object'])
    const stat = BLESSING_EFFECTS.elementStatPercent
    expect(stat.validateParams({ percent: 5, stat: 'speed' })).toEqual([])
    expect(stat.validateParams({ percent: 5, stat: 'luck' })).toEqual(['stat lạ "luck"'])
  })
})
