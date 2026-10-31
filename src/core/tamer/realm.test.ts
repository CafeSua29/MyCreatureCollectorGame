// Công thức theo cảnh giới ngự thú sư (docs/rules/tamer.md), số của fixture: expBase 100, expPower
// 2, costBase 1000, tỉ lệ 100 − 10n tối thiểu 30, bắt 100 + 100n, linh lực 50 + 10n.

import { describe, expect, it } from 'vitest'
import { makeData } from '../testing'
import { toBig } from '../shared'
import {
  breakthroughChance,
  breakthroughCost,
  breakthroughItemCount,
  contractLevelLimit,
  maxContracts,
  expToNextRealm,
  maxMana,
  newBattleTamer,
  realmToContract,
  tamerExpShare,
  tamerRealmTitle,
  unlockedTamerSkills
} from './realm'

const data = makeData()

describe('công thức cảnh giới', () => {
  it('EXP cần, tiền, số đan theo cảnh giới', () => {
    expect(expToNextRealm(data, 0).toNumber()).toBe(100)
    expect(expToNextRealm(data, 2).toNumber()).toBe(900)
    expect(breakthroughCost(data, 0).toNumber()).toBe(1000)
    expect(breakthroughCost(data, 3).toNumber()).toBe(16000)
    expect(breakthroughItemCount(0)).toBe(1)
    expect(breakthroughItemCount(4)).toBe(5)
  })

  it('cảnh giới cực lớn: số hữu hạn, Decimal không tràn', () => {
    const realm = Number.MAX_SAFE_INTEGER - 1
    expect(expToNextRealm(data, realm).isFinite()).toBe(true)
    expect(breakthroughCost(data, realm).gt(toBig(10).pow(30))).toBe(true)
  })

  it('tỉ lệ đột phá giảm theo cảnh giới, không dưới minChance', () => {
    expect(breakthroughChance(data, 0)).toBe(100)
    expect(breakthroughChance(data, 3)).toBe(70)
    expect(breakthroughChance(data, 7)).toBe(30)
    expect(breakthroughChance(data, 1000)).toBe(30)
  })

  it('giới hạn level khế ước, cảnh giới cần, số ô khế ước', () => {
    expect(contractLevelLimit(data, 0)).toBe(100)
    expect(contractLevelLimit(data, 2)).toBe(300)
    expect(realmToContract(data, 1)).toBe(0)
    expect(realmToContract(data, 100)).toBe(0)
    expect(realmToContract(data, 101)).toBe(1)
    expect(realmToContract(data, 300)).toBe(2)
    expect(realmToContract(data, 301)).toBe(3)
    expect(maxContracts(data, 0)).toBe(8)
    expect(maxContracts(data, 3)).toBe(20)
  })

  it('linh lực tối đa và ngự thú sư lúc vào trận', () => {
    expect(maxMana(data, 0)).toBe(50)
    expect(newBattleTamer(data, 3)).toEqual({
      realm: 3,
      mana: 80,
      cooldowns: {},
      uses: {},
      skillIds: null
    })
  })

  it('phần EXP của ngự thú sư làm tròn xuống', () => {
    expect(tamerExpShare(toBig(95), 10).toNumber()).toBe(9)
    expect(tamerExpShare(toBig(0), 10).toNumber()).toBe(0)
  })
})

describe('tên cảnh giới và kỹ năng đã mở', () => {
  it('quá tên cuối thì tên cuối + n', () => {
    expect(tamerRealmTitle(data, 0)).toEqual({ realmId: 'apprentice', plus: 0 })
    expect(tamerRealmTitle(data, 2)).toEqual({ realmId: 'master', plus: 0 })
    expect(tamerRealmTitle(data, 5)).toEqual({ realmId: 'master', plus: 3 })
  })

  it('kỹ năng mở theo cảnh giới', () => {
    const ids = (realm: number): string[] => unlockedTamerSkills(data, realm).map((s) => s.id)
    expect(ids(0)).toEqual(['mend', 'cleanse', 'slowFoes', 'recall'])
    expect(ids(1)).toEqual(['mend', 'cleanse', 'cheer', 'slowFoes', 'recall'])
  })
})
