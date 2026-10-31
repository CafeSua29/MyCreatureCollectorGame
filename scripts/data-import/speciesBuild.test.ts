// Hàm dựng loài mới của đợt "Dữ liệu nguồn thật" (speciesBuild.mjs) và đoán race (raceGuess.mjs).

import { describe, expect, it } from 'vitest'
import {
  STAT_KEYS,
  TIERS,
  buildLearnset,
  buildLifespan,
  buildSkillPools,
  buildStats,
  catchRateFrom255,
  toCamelId
} from './speciesBuild.mjs'
import { guessRace, keywordRace, wordsOf } from './raceGuess.mjs'

const total = (stats: Record<string, number>): number =>
  STAT_KEYS.reduce((sum: number, key: string) => sum + stats[key], 0)

describe('buildStats', () => {
  it('tổng chỉ số nằm trong ±7% (cộng sai số làm tròn) của bậc, tất định theo id', () => {
    for (const tier of Object.keys(TIERS)) {
      const stats = buildStats('slime', tier, 'tank')
      const expected = TIERS[tier as keyof typeof TIERS].total
      expect(total(stats)).toBeGreaterThanOrEqual(Math.floor(expected * 0.93) - 3)
      expect(total(stats)).toBeLessThanOrEqual(Math.ceil(expected * 1.07) + 3)
      expect(buildStats('slime', tier, 'tank')).toEqual(stats)
    }
  })

  it('bậc / kiểu lạ dùng mặc định (vừa, cân bằng); mọi chỉ số ≥ 1', () => {
    const stats = buildStats('x', 'unknown', 'unknown')
    expect(total(stats)).toBeGreaterThan(380)
    expect(Object.values(stats).every((v) => v >= 1)).toBe(true)
  })
})

describe('catchRateFrom255', () => {
  it('quy đổi như Pokémon và kẹp trong [1, 100]', () => {
    expect(catchRateFrom255(255)).toBe(100)
    expect(catchRateFrom255(45)).toBe(42)
    expect(catchRateFrom255(3)).toBe(11)
    expect(catchRateFrom255(0)).toBe(6)
    expect(catchRateFrom255(1e9)).toBe(100)
  })
})

describe('buildLifespan', () => {
  const stats = { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 }

  it('công thức của lifespan.md: 20 + (tổng − 150) × 0,2, × race / nhóm, × origin, × độ hiếm', () => {
    expect(buildLifespan({ stats, raceId: 'felid', groupId: 'beast', catchRate: 60 })).toBe(50)
    expect(buildLifespan({ stats, raceId: 'felid', groupId: 'dragon', catchRate: 60 })).toBe(200)
    expect(
      buildLifespan({ stats, raceId: 'elf', groupId: 'humanoid', origin: 'fantasy', catchRate: 5 })
    ).toBe(900)
  })

  it('tối thiểu 10 năm; số rất lớn làm tròn bội 100', () => {
    const tiny = { hp: 1, attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 }
    expect(buildLifespan({ stats: tiny, raceId: 'ant', groupId: 'insect', catchRate: 60 })).toBe(10)
    const huge = { ...stats, hp: 100_000 }
    expect(
      buildLifespan({ stats: huge, raceId: 'god', groupId: 'deity', catchRate: 1 }) % 100
    ).toBe(0)
  })
})

describe('buildLearnset', () => {
  const skills = [
    {
      id: 'tackle',
      elementId: 'normal',
      category: 'physical',
      power: 40,
      target: 'enemy',
      effects: []
    },
    {
      id: 'ember',
      elementId: 'fire',
      category: 'special',
      power: 40,
      target: 'enemy',
      effects: []
    },
    {
      id: 'flame',
      elementId: 'fire',
      category: 'special',
      power: 90,
      target: 'enemy',
      effects: []
    },
    {
      id: 'focus',
      elementId: 'normal',
      category: 'status',
      power: 0,
      target: 'self',
      effects: [{ type: 'statStage', params: { who: 'self', stat: 'spAttack', delta: 2 } }]
    },
    { id: 'rare', elementId: 'fire', category: 'special', power: 60, target: 'enemy', effects: [] }
  ]
  const learners = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`,
    learnset: ['tackle', 'ember', 'flame', 'focus'].map((skillId) => ({ level: 1, skillId }))
  }))
  const pools = buildSkillPools(skills, learners)
  const stats = { hp: 50, attack: 40, defense: 50, spAttack: 90, spDefense: 50, speed: 50 }

  it('có skill level 1, chỉ dùng skill phổ biến, không lặp, có skill buff chỉ số cao nhất', () => {
    const learnset = buildLearnset(pools, { id: 'imp', elementIds: ['fire'], stats })
    const ids = learnset.map((entry: { skillId: string }) => entry.skillId)
    expect(learnset[0].level).toBe(1)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('rare')
    expect(ids).toContain('focus')
    expect(ids).toContain('flame')
  })

  it('hệ không có skill nào thì lấy skill hệ Thường', () => {
    const learnset = buildLearnset(pools, { id: 'x', elementIds: ['ice'], stats })
    expect(learnset[0].skillId).toBe('tackle')
  })
})

describe('toCamelId', () => {
  it('bỏ dấu, ký tự lạ; id bắt đầu bằng số thêm tiền tố', () => {
    expect(toCamelId('Holy Angemon (Priest Mode)')).toBe('holyAngemonPriestMode')
    expect(toCamelId('Būmon')).toBe('bumon')
    expect(toCamelId('Kaboom!')).toBe('kaboom')
    expect(toCamelId('1-4')).toBe('n14')
    expect(toCamelId('!!!')).toBe('')
  })
})

describe('raceGuess', () => {
  it('tách từ camelCase, số nhiều và từ ghép', () => {
    expect(wordsOf('Sea Lions')).toEqual(
      expect.arrayContaining(['sea', 'lions', 'lion', 'sealions'])
    )
  })

  it('khớp từ khóa theo bảng, đổi id race cũ đã tách; không khớp thì race mặc định', () => {
    expect(keywordRace(wordsOf('Little Penguin'))).toBe('penguin')
    expect(guessRace(['Zzzq'], 'demon')).toBe('fiend')
    expect(guessRace([undefined, 'Zzzq'], 'mythicBeast')).toBe('mythicBeast')
  })
})
