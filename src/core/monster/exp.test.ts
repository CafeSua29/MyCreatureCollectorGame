import { describe, expect, it } from 'vitest'
import { expReward, gainExp, moneyReward } from './exp'
import { expForLevel, levelFromExp } from './growthRates'
import { getCurrentHp } from './hp'
import { DataError, toBig } from '../shared'
import { makeData, makeMonster } from '../testing'

const data = makeData()

describe('đường cong EXP level³ (Medium Fast, mặc định)', () => {
  const MF = 'mediumFast'
  it('expForLevel = level³', () => {
    expect(expForLevel(1, MF)).toEqual(1)
    expect(expForLevel(3, MF)).toEqual(27)
    expect(expForLevel(100, MF)).toEqual(1_000_000)
  })

  it('levelFromExp là level cao nhất đã đạt, tối thiểu 1', () => {
    expect(levelFromExp(toBig(0), MF)).toEqual(1)
    expect(levelFromExp(toBig(26), MF)).toEqual(2)
    expect(levelFromExp(toBig(27), MF)).toEqual(3)
    expect(levelFromExp(toBig(1000 ** 3), MF)).toEqual(1000)
    expect(levelFromExp(toBig(1000 ** 3 - 1), MF)).toEqual(999)
    expect(levelFromExp(toBig(1e18), MF)).toEqual(1_000_000)
  })
})

describe('phần thưởng', () => {
  it('EXP = expFactor × level², tiền = moneyPerLevel × level', () => {
    const enemy = makeMonster({ level: 4 })
    expect(expReward(data, enemy)).toEqual(8)
    expect(moneyReward(data, enemy)).toEqual(20)
  })

  it('EXP tối thiểu minExp: quái level 1 (⌊0,5 × 1²⌋ = 0) vẫn cho EXP', () => {
    expect(expReward(data, makeMonster({ level: 1 }))).toEqual(1)
    // Đã đủ minExp thì công thức giữ nguyên (level 2: 0,5 × 4 = 2).
    expect(expReward(data, makeMonster({ level: 2 }))).toEqual(2)
    const noMinimum = { ...data, config: { ...data.config, rewards: { ...data.config.rewards } } }
    noMinimum.config.rewards.minExp = 0
    expect(expReward(noMinimum, makeMonster({ level: 1 }))).toEqual(0)
    const larger = { ...data, config: { ...data.config, rewards: { ...data.config.rewards } } }
    larger.config.rewards.minExp = 50
    expect(expReward(larger, makeMonster({ level: 4 }))).toEqual(50)
    expect(expReward(larger, makeMonster({ level: 1000 }))).toEqual(500_000)
  })
})

describe('gainExp', () => {
  it('lên level và tự học skill mới khi còn ô', () => {
    const monster = makeMonster({ level: 1, exp: 1, skillIds: ['strike'] })
    const result = gainExp(data, monster, toBig(124)) // exp 125 → level 5
    expect(result.monster.level).toEqual(5)
    expect(result.monster.exp).toEqual(125)
    expect(result.monster.skillIds).toEqual(['strike', 'blast'])
    expect(result.events).toEqual([
      { type: 'expGain', monsterId: 'm1', amount: 124 },
      { type: 'levelUp', monsterId: 'm1', level: 5 },
      { type: 'learnSkill', monsterId: 'm1', skillId: 'blast' }
    ])
  })

  it('đủ ô skill thì chỉ ghi sự kiện canLearnSkill, không tự thay', () => {
    const monster = makeMonster({
      level: 7,
      exp: 343,
      skillIds: ['strike', 'growl', 'blast', 'quick']
    })
    const result = gainExp(data, monster, toBig(1000)) // exp 1343 → level 11
    expect(result.monster.skillIds).toEqual(['strike', 'growl', 'blast', 'quick'])
    expect(result.events).toContainEqual({
      type: 'canLearnSkill',
      monsterId: 'm1',
      skillId: 'pumpUp'
    })
  })

  it('không học lại skill đã biết', () => {
    const monster = makeMonster({ level: 4, exp: 64, skillIds: ['strike', 'blast'] })
    const result = gainExp(data, monster, toBig(100))
    expect(result.monster.skillIds).toEqual(['strike', 'blast'])
    expect(result.events.some((e) => e.type === 'learnSkill')).toBe(false)
  })

  it('không lên level thì chỉ cộng EXP', () => {
    const result = gainExp(data, makeMonster({ level: 2, exp: 8 }), toBig(5))
    expect(result.monster.level).toEqual(2)
    expect(result.monster.exp).toEqual(13)
    expect(result.events).toHaveLength(1)
  })

  it('giữ damageTaken nên HP hiện tại tăng theo max HP khi lên level', () => {
    const monster = makeMonster({ damageTaken: 20 }) // 30/50
    const leveled = gainExp(data, monster, toBig(1330)).monster // level 11, max HP 100
    expect(leveled.damageTaken).toEqual(20)
    expect(getCurrentHp(data, leveled)).toEqual(80)
  })

  it('không sửa quái đầu vào', () => {
    const monster = Object.freeze(makeMonster())
    expect(() => gainExp(data, monster, toBig(500))).not.toThrow()
    expect(monster.level).toEqual(1)
  })
})

describe('EXP / level — số cực lớn (Decimal)', () => {
  it('levelFromExp chính xác với EXP lớn hơn 2^53', () => {
    expect(levelFromExp(toBig('1e30'), 'mediumFast')).toBe(1e10)
    expect(levelFromExp(toBig('1e30').minus(1), 'mediumFast')).toBe(1e10 - 1)
    expect(levelFromExp(toBig(1e6).pow(3), 'mediumFast')).toBe(1e6)
  })

  it('gainExp với lượng EXP cực lớn: lên level đúng, EXP cộng chính xác', () => {
    const monster = makeMonster({ level: 1, exp: 1 })
    const result = gainExp(data, monster, toBig('1e27').minus(1)).monster
    expect(result.level).toBe(1e9)
    expect(result.exp.eq('1e27')).toBe(true)
  })

  it('level vượt số nguyên an toàn: DataError (level giữ kiểu number)', () => {
    expect(() => levelFromExp(toBig('1e100'), 'mediumFast')).toThrow(DataError)
  })

  it('thưởng shiny ×1,5^stacks không tràn với stacks lớn', () => {
    const shiny = makeMonster({ level: 10, shinyStacks: 2000 })
    const reward = expReward(data, shiny)
    expect(reward.isFinite()).toBe(true)
    expect(reward.gt('1e350')).toBe(true)
  })
})
