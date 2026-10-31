// Thức tỉnh trên một quái (docs/rules/awakening.md): hệ số chỉ số / thọ nguyên, tầng mốc, trần ô
// trait, thần thông, điều kiện tầng sau, trọng thương, kiểm tra quái.

import { describe, expect, it } from 'vitest'
import { lifespanYears } from '../registries'
import { makeData, makeMonster } from '../testing'
import { toBig } from '../shared'
import {
  awakeningRequirements,
  awakeningRewardAt,
  awakeningStatMultiplier,
  countAwakeningRewards,
  divineSkillId,
  nextAwakeningMilestone,
  traitSlotCap
} from './awakening'
import { computeStats } from './stats'
import { validateMonster } from './validateMonster'

const data = makeData()
const config = data.config.awakening

describe('hệ số chỉ số', () => {
  it('(1 + 10%) ^ tầng; tầng 0 = 1', () => {
    expect(awakeningStatMultiplier(config, 0).toString()).toBe('1')
    expect(awakeningStatMultiplier(config, 2).toString()).toBe('1.21')
  })

  it('tầng rất cao vẫn hữu hạn (Decimal)', () => {
    const huge = awakeningStatMultiplier(config, 100000)
    expect(huge.isFinite()).toBe(true)
    expect(huge.gt('1e4000')).toBe(true)
  })

  it('nhân ở bước gốc của computeStats (cùng bossMultiplier), mọi bước sau nhân theo', () => {
    const plain = computeStats(data, makeMonster({ level: 10 })).final
    const awakened = computeStats(data, makeMonster({ level: 10, awakening: 1 })).final
    // Gốc 30 + gen 10 × geneWeight, level 10: tỉ lệ ×1,1 trước khi làm tròn xuống.
    expect(awakened.attack.div(plain.attack).toNumber()).toBeCloseTo(1.1, 1)
    expect(awakened.attack.gt(plain.attack)).toBe(true)
  })
})

describe('thọ nguyên và trọng thương', () => {
  it('thọ nguyên × 1,5 ^ tầng, tầng rất cao không ra Infinity', () => {
    const base = lifespanYears(data, makeMonster())
    expect(lifespanYears(data, makeMonster({ awakening: 2 })).toString()).toBe(
      base.times(2.25).toString()
    )
    expect(lifespanYears(data, makeMonster({ awakening: 5000 })).isFinite()).toBe(true)
  })

  it('trọng thương: mọi chỉ số −20% (nguồn injury), hết trọng thương thì thôi', () => {
    const injured = computeStats(data, makeMonster({ level: 10, injuryBattlesLeft: 3 }))
    expect(injured.percentBySource.injury).toEqual({
      hp: -20,
      attack: -20,
      defense: -20,
      spAttack: -20,
      spDefense: -20,
      speed: -20
    })
    expect(computeStats(data, makeMonster({ level: 10 })).percentBySource.injury.attack).toBe(0)
  })
})

describe('tầng mốc', () => {
  it('mốc liệt kê, rồi mỗi 5 tầng xen kẽ bắt đầu bằng loại khác mốc cuối', () => {
    const rewards = [1, 2, 3, 5, 10, 11, 15, 20, 25, 30].map((tier) =>
      awakeningRewardAt(config, tier)
    )
    expect(rewards).toEqual([
      'skill',
      null,
      'traitSlot',
      'skill',
      'traitSlot',
      null,
      'skill',
      'traitSlot',
      'skill',
      'traitSlot'
    ])
  })

  it('đếm mốc theo công thức, khớp đếm từng tầng; tầng rất cao không lặp', () => {
    const countByLoop = (tier: number, reward: string): number =>
      Array.from({ length: tier }, (_, i) => awakeningRewardAt(config, i + 1)).filter(
        (r) => r === reward
      ).length
    for (const tier of [0, 1, 3, 9, 10, 14, 15, 20, 37]) {
      expect(countAwakeningRewards(config, tier, 'skill'), `skill ${tier}`).toBe(
        countByLoop(tier, 'skill')
      )
      expect(countAwakeningRewards(config, tier, 'traitSlot'), `slot ${tier}`).toBe(
        countByLoop(tier, 'traitSlot')
      )
    }
    // Tầng 1e9: 2 mốc liệt kê mỗi loại + ⌊(1e9 − 10) / 5⌋ = 199.999.998 bước chia đôi.
    expect(countAwakeningRewards(config, 1e9, 'skill')).toBe(2 + 99999999)
    expect(countAwakeningRewards(config, 1e9, 'traitSlot')).toBe(2 + 99999999)
  })

  it('mốc kế tiếp', () => {
    expect(nextAwakeningMilestone(config, 0)).toEqual({ tier: 1, reward: 'skill' })
    expect(nextAwakeningMilestone(config, 1)).toEqual({ tier: 3, reward: 'traitSlot' })
    expect(nextAwakeningMilestone(config, 10)).toEqual({ tier: 15, reward: 'skill' })
    expect(nextAwakeningMilestone(config, 12)).toEqual({ tier: 15, reward: 'skill' })
    expect(nextAwakeningMilestone(config, 15)).toEqual({ tier: 20, reward: 'traitSlot' })
    expect(nextAwakeningMilestone({ ...config, milestones: [] }, 0)).toBeNull()
  })

  it('trần ô trait = config.traitSlots.max + mốc ô trait đã đạt', () => {
    const max = data.config.traitSlots.max
    expect(traitSlotCap(data, makeMonster())).toBe(max)
    expect(traitSlotCap(data, makeMonster({ awakening: 3 }))).toBe(max + 1)
    expect(traitSlotCap(data, makeMonster({ awakening: 10 }))).toBe(max + 2)
  })
})

describe('thần thông', () => {
  const withSkills = { ...data, config: { ...data.config, awakening: { ...config } } }
  withSkills.config.awakening.divineSkills = { fire: ['blast'], grass: ['sap', 'strike'] }

  it('quái hai hệ: mốc lẻ theo hệ đầu, mốc chẵn theo hệ thứ hai', () => {
    const dual = makeMonster({ elementIds: ['grass', 'fire'] })
    expect([1, 2, 3].map((i) => divineSkillId(withSkills, dual, i))).toEqual([
      'sap',
      'blast',
      'sap'
    ])
  })

  it('quái một hệ: mốc chẵn lấy skill thứ hai của hệ; hệ không đủ skill / không có thì null', () => {
    const grass = makeMonster({ elementIds: ['grass'] })
    expect([1, 2].map((i) => divineSkillId(withSkills, grass, i))).toEqual(['sap', 'strike'])
    const fire = makeMonster({ elementIds: ['fire'] })
    expect(divineSkillId(withSkills, fire, 2)).toBeNull()
    expect(divineSkillId(withSkills, makeMonster({ elementIds: ['water'] }), 1)).toBeNull()
  })
})

describe('điều kiện tầng kế tiếp', () => {
  it('level 50 × n, tiền 1000 × n², đan 1 × n', () => {
    expect(awakeningRequirements(config, 0)).toEqual({
      tier: 1,
      level: 50,
      money: toBig(1000),
      pills: 1
    })
    const third = awakeningRequirements(config, 2)
    expect([third.tier, third.level, third.money.toString(), third.pills]).toEqual([
      3,
      150,
      '9000',
      3
    ])
  })

  it('tầng rất cao: tiền Decimal chính xác', () => {
    expect(awakeningRequirements(config, 1e9 - 1).money.toString()).toBe('1e+21')
  })
})

describe('kiểm tra quái', () => {
  it('trường thức tỉnh sai', () => {
    const issues = validateMonster(
      data,
      makeMonster({ awakening: -1, tribulationFailures: 6, injuryBattlesLeft: 1.5 })
    )
    expect(issues.join('\n')).toContain('awakening')
    expect(issues.join('\n')).toContain('tribulationFailures')
    expect(issues.join('\n')).toContain('injuryBattlesLeft')
  })

  it('ô trait theo trần riêng: thức tỉnh tầng 3 được thêm 1 ô', () => {
    const max = data.config.traitSlots.max
    expect(validateMonster(data, makeMonster({ traitSlots: max + 1 })).join()).toContain(
      'traitSlots'
    )
    expect(validateMonster(data, makeMonster({ traitSlots: max + 1, awakening: 3 }))).toEqual([])
  })
})
