// Nhóm tăng trưởng EXP (docs/rules/growth-rates.md): số gốc của 6 nhóm tại các mốc, tăng dần, nối
// sau level 100 theo tỉ lệ n³, levelFromExp khớp expForLevel, quái lấy nhóm theo loài gốc, kiểm tra
// dữ liệu.

import { describe, expect, it } from 'vitest'
import { GROWTH_RATES, type GrowthRate } from '../model'
import { toBig } from '../shared'
import { dataIssuesAfter, makeData, makeMonster } from '../testing'
import { expForLevel, levelFromExp, monsterExpForLevel, monsterGrowthRate } from './growthRates'
import { gainExp } from './exp'

describe('số gốc (bảng EXP của Pokémon)', () => {
  // Bảng EXP tổng của Bulbapedia ("Experience") ở level 2, 50, 100 và các mốc đổi công thức.
  const TABLE: Record<GrowthRate, [number, number][]> = {
    erratic: [
      [2, 15],
      [50, 125000],
      [67, 249633],
      [68, 257834],
      [98, 583539],
      [100, 600000]
    ],
    fast: [
      [2, 6],
      [50, 100000],
      [100, 800000]
    ],
    mediumFast: [
      [2, 8],
      [50, 125000],
      [100, 1000000]
    ],
    mediumSlow: [
      [2, 9],
      [50, 117360],
      [100, 1059860]
    ],
    slow: [
      [2, 10],
      [50, 156250],
      [100, 1250000]
    ],
    fluctuating: [
      [2, 4],
      [15, 1957],
      [36, 46656],
      [50, 142500],
      [100, 1640000]
    ]
  }

  it('khớp bảng ở các mốc', () => {
    for (const rate of GROWTH_RATES) {
      for (const [level, exp] of TABLE[rate]) {
        expect([rate, level, expForLevel(level, rate).toNumber()]).toEqual([rate, level, exp])
      }
    }
  })

  it('tăng ngặt theo level ở mọi nhóm (1 → 300), level 1 không âm', () => {
    for (const rate of GROWTH_RATES) {
      expect(expForLevel(1, rate).gte(0)).toBe(true)
      for (let level = 1; level < 300; level++) {
        expect(expForLevel(level + 1, rate).gt(expForLevel(level, rate))).toBe(true)
      }
    }
  })
})

describe('sau level 100: giữ tỉ lệ so với n³ tại level 100', () => {
  it('EXP(n) = EXP(100) × n³ / 100³; nhóm chậm luôn chậm hơn', () => {
    expect(expForLevel(200, 'slow').toNumber()).toBe(1250000 * 8)
    expect(expForLevel(200, 'erratic').toNumber()).toBe(600000 * 8)
    expect(expForLevel(1000, 'fluctuating').gt(expForLevel(1000, 'slow'))).toBe(true)
    expect(expForLevel(1e6, 'erratic').lt(expForLevel(1e6, 'fast'))).toBe(true)
  })

  it('số cực lớn: không tràn, levelFromExp ngược lại đúng', () => {
    const exp = expForLevel(1e9, 'mediumSlow')
    expect(exp.isFinite()).toBe(true)
    expect(levelFromExp(exp, 'mediumSlow')).toBe(1e9)
    expect(levelFromExp(exp.minus(1), 'mediumSlow')).toBe(1e9 - 1)
  })
})

describe('levelFromExp', () => {
  it('khớp expForLevel ở mọi nhóm, kể cả quanh level 100 / 101', () => {
    for (const rate of GROWTH_RATES) {
      for (const level of [1, 2, 49, 50, 99, 100, 101, 102, 5000]) {
        const exp = expForLevel(level, rate)
        expect([rate, level, levelFromExp(exp, rate)]).toEqual([rate, level, level])
        if (level > 1 && exp.gt(expForLevel(level - 1, rate))) {
          expect(levelFromExp(exp.minus(1), rate)).toBe(level - 1)
        }
      }
    }
  })

  it('EXP 0 / âm hơn level 2: level 1', () => {
    expect(levelFromExp(toBig(0), 'mediumSlow')).toBe(1)
    expect(levelFromExp(toBig(0), 'erratic')).toBe(1)
  })
})

describe('nhóm của quái', () => {
  const data = makeData()

  it('theo loài gốc; loài không ghi thì Medium Fast', () => {
    const plain = makeMonster({ id: 'a' })
    expect(monsterGrowthRate(data, plain)).toBe('mediumFast')
    const slowData = { ...data, species: { ...data.species } }
    const baseId = plain.baseSpeciesId
    const base = slowData.species[baseId]
    if (base.kind !== 'normal') throw new Error('fixture')
    slowData.species[baseId] = { ...base, growthRate: 'slow' }
    expect(monsterGrowthRate(slowData, plain)).toBe('slow')
    expect(monsterExpForLevel(slowData, plain, 10).toNumber()).toBe(1250)
    // Lên level theo nhóm của loài: 1250 EXP là level 10 của Slow (Medium Fast thì level 10 ở 1000).
    const leveled = gainExp(slowData, { ...plain, level: 1, exp: toBig(0) }, toBig(1249)).monster
    expect(leveled.level).toBe(9)
  })

  it('kiểm tra dữ liệu: growthRate phải là một trong 6 nhóm', () => {
    const issues = dataIssuesAfter((raw) => {
      const species = raw.species.find((entry) => entry.kind === 'normal')
      if (species?.kind === 'normal') species.growthRate = 'turbo' as GrowthRate
    })
    expect(issues.join('\n')).toMatch(/growthRate/)
  })
})
