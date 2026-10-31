import { describe, expect, it } from 'vitest'
import type { MonsterOverrides } from '../testing'
import { DataError, toBig } from '../shared'
import { computeStats, stageRatio } from './stats'
import { makeData, makeMonster, makeRaceTraitData, uniformStats } from '../testing'

const data = makeData()

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

describe('computeStats — bước gốc: (gốc + gen × geneWeight) × race × boss', () => {
  it('cộng gen × geneWeight vào chỉ số gốc (ví dụ trong CLAUDE.md)', () => {
    const weak = makeMonster({ genes: uniformStats(25) })
    const strong = makeMonster({
      speciesId: 'strongling',
      baseSpeciesId: 'strongling',
      elementIds: ['fire']
    })
    // 30 + 25 × 2 = 80 và 60 + 10 × 2 = 80
    expect(computeStats(data, weak).base.attack).toEqual(80)
    expect(computeStats(data, strong).base.attack).toEqual(80)
  })

  it('nhân độ lệch race', () => {
    const stats = computeStats(data, makeMonster({ raceId: 'brute' })).base
    expect(stats.attack).toEqual(50 * 1.5)
    expect(stats.speed).toEqual(50 * 0.5)
    expect(stats.hp).toEqual(50)
  })

  it('shiny KHÔNG nhân vào chỉ số gốc, chỉ tăng qua trait shiny ở bước trait', () => {
    const at = (shinyStacks: number): number =>
      computeStats(data, makeMonster({ shinyStacks })).base.hp.toNumber()
    expect([0, 1, 2, 3].map(at)).toEqual([50, 50, 50, 50])
    // Trait shiny của fixture: +10% công (cấp 1). HP không đổi.
    const shiny = computeStats(data, makeMonster({ shinyStacks: 1 }))
    expect(shiny.withTraits.attack).toBeCloseTo(55)
    expect(shiny.withTraits.hp).toEqual(50)
  })

  it('nhân bossMultiplier', () => {
    expect(computeStats(data, makeMonster({ bossMultiplier: 3 })).base.hp).toEqual(150)
  })

  it('race và boss nhân cả phần gen, không chỉ phần gốc loài', () => {
    const monster = makeMonster({ raceId: 'brute', bossMultiplier: 2 })
    // (30 + 10 × 2) × 1,5 × 2 = 150
    expect(computeStats(data, monster).base.attack).toBeCloseTo(150)
  })
})

describe('computeStats — bước level', () => {
  it('nhân (1 + (level − 1) × growth của race)', () => {
    expect(computeStats(data, makeMonster({ level: 1 })).leveled.hp).toEqual(50)
    // growth 0,1: level 11 → × 2
    expect(computeStats(data, makeMonster({ level: 11 })).leveled.hp).toBeCloseTo(100)
  })

  it('growth khác nhau theo từng chỉ số của race', () => {
    const stats = computeStats(data, makeMonster({ raceId: 'brute', level: 11 })).leveled
    expect(stats.attack).toBeCloseTo(75 * 3) // growth 0,2
    expect(stats.hp).toBeCloseTo(50 * 2) // growth 0,1
  })

  it('level nhân lên cả kết quả của bước gốc (boss)', () => {
    const monster = makeMonster({ level: 11, bossMultiplier: 2 })
    expect(computeStats(data, monster).leveled.hp).toBeCloseTo(50 * 2 * 2)
  })
})

describe('computeStats — bước fusingBonusStats', () => {
  it('cộng sau bước level, không bị level nhân lên', () => {
    const monster = makeMonster({
      level: 11,
      fusingBonusStats: { ...uniformStats(0), defense: 40 }
    })
    const stats = computeStats(data, monster)
    expect(stats.withFusingBonus.defense).toBeCloseTo(100 + 40)
    expect(stats.withFusingBonus.hp).toBeCloseTo(100)
  })
})

describe('computeStats — bước trait', () => {
  it('cộng flat trước rồi mới nhân percent', () => {
    const stats = computeStats(data, makeMonster({ traits: [{ id: 'mighty', level: 1 }] }))
    expect(stats.withTraits.attack).toBeCloseTo((50 + 10) * 1.5)
  })

  it('percent của nhiều trait cộng với nhau, không nhân chồng', () => {
    const monster = makeMonster({
      shinyStacks: 1,
      traits: [
        { id: 'mighty', level: 1 },
        { id: 'shiny', level: 1 },
        { id: 'bossBlood', level: 1 }
      ]
    })
    // Gốc 50 (shiny không nhân chỉ số gốc); flat +10; percent 50 + 10 + 10 = 70 → 60 × 1,7
    expect(computeStats(data, monster).withTraits.attack.toNumber()).toBeCloseTo(60 * 1.7)
  })

  it('trait cấp n có hiệu ứng × (1 + 0,2 × (n − 1)) (tuyến tính)', () => {
    const at = (level: number): number =>
      computeStats(
        data,
        makeMonster({ traits: [{ id: 'armored', level }] })
      ).withTraits.defense.toNumber()
    expect(at(1)).toBeCloseTo(50 + 10)
    expect(at(2)).toBeCloseTo(50 + 12)
    expect(at(3)).toBeCloseTo(50 + 14)
    expect(at(20)).toBeCloseTo(50 + 48)
  })

  it('trait áp lên cả phần fusingBonusStats', () => {
    const monster = makeMonster({
      fusingBonusStats: { ...uniformStats(0), speed: 50 },
      traits: [{ id: 'fast', level: 1 }]
    })
    expect(computeStats(data, monster).withTraits.speed).toBeCloseTo((50 + 50) * 1.5)
  })

  it('trait bất lợi cấp cao không đẩy chỉ số xuống dưới 1', () => {
    const monster = makeMonster({ traits: [{ id: 'cursed', level: 5 }] })
    const stats = computeStats(data, monster)
    expect(stats.withTraits.hp).toEqual(1)
    expect(stats.final.hp).toEqual(1)
  })
})

describe('computeStats — bậc trong trận và kết quả cuối', () => {
  it('không có bậc thì final = withTraits làm tròn xuống', () => {
    const stats = computeStats(data, makeMonster({ shinyStacks: 1, level: 2 }))
    // Công: 50 × 1,1 (level 2) = 55; × 1,1 (trait shiny +10% công) = 60,5 → 60
    expect(stats.withTraits.attack).toBeCloseTo(60.5)
    expect(stats.final.attack).toEqual(60)
  })

  it('bậc +s nhân (2 + s) / 2, bậc −s nhân 2 / (2 + s)', () => {
    const stats = computeStats(data, makeMonster(), {
      stages: { attack: 2, defense: -2, speed: 1 }
    })
    expect(stats.final.attack).toEqual(100)
    expect(stats.final.defense).toEqual(25)
    expect(stats.final.speed).toEqual(75)
    expect(stats.final.spAttack).toEqual(50)
  })

  it('bậc ngoài khoảng [−6, 6] bị kẹp lại', () => {
    expect(stageRatio(data.config, 10)).toEqual([8, 2]) // × 4
    expect(stageRatio(data.config, -10)).toEqual([2, 8]) // × 0,25
    const stats = computeStats(data, makeMonster(), { stages: { attack: 99 } })
    expect(stats.final.attack).toEqual(200)
  })

  it('bậc trận chỉ đổi final, không đổi các bước trước', () => {
    const plain = computeStats(data, makeMonster())
    const staged = computeStats(data, makeMonster(), { stages: { attack: 6 } })
    expect(staged.withTraits).toEqual(plain.withTraits)
  })
})

describe('computeStats — quái fuse', () => {
  it('chỉ số gốc lấy từ baseSpeciesId, không từ loài chung "fused"', () => {
    const monster = makeMonster({
      speciesId: 'fused',
      baseSpeciesId: 'strongling',
      fused: true,
      lineage: ['weakling'],
      elementIds: ['fire']
    })
    // 60 + 10 × 2 = 80
    expect(computeStats(data, monster).base.hp).toEqual(80)
  })
})

describe('computeStats — tính chất chung', () => {
  it('không sửa monster đầu vào', () => {
    const monster = deepFreeze(
      makeMonster({ level: 5, shinyStacks: 1, traits: [{ id: 'mighty', level: 2 }] })
    )
    expect(() => computeStats(data, monster, { stages: { attack: 1 } })).not.toThrow()
  })

  it('cùng đầu vào cho cùng kết quả', () => {
    const monster = makeMonster({ level: 37, traits: [{ id: 'fast', level: 3 }] })
    expect(computeStats(data, monster)).toEqual(computeStats(data, monster))
  })

  it('level, gen, shiny và fusing bonus rất lớn vẫn ra số hữu hạn', () => {
    const monster = makeMonster({
      level: 1_000_000,
      genes: uniformStats(1e12),
      fusingBonusStats: uniformStats(1e15),
      shinyStacks: 50,
      bossMultiplier: 5,
      traits: [{ id: 'mighty', level: 30 }]
    })
    const { final } = computeStats(data, monster)
    for (const value of Object.values(final)) {
      expect(value.isFinite()).toBe(true)
      expect(value.gt(1e15)).toBe(true)
    }
  })

  it.each<[string, MonsterOverrides]>([
    ['loài không tồn tại', { speciesId: 'nope', baseSpeciesId: 'nope' }],
    ['gen nhỏ hơn 1', { genes: { ...uniformStats(10), attack: 0 } }],
    ['trait không tồn tại', { traits: [{ id: 'nope', level: 1 }] }]
  ])('ném DataError khi quái không hợp lệ: %s', (_, overrides) => {
    expect(() => computeStats(data, makeMonster(overrides))).toThrow(DataError)
  })
})

describe('computeStats — số cực lớn (Decimal)', () => {
  it('gen 1e1000: chỉ số hữu hạn, đúng bậc độ lớn (number sẽ tràn thành Infinity)', () => {
    const { final } = computeStats(data, makeMonster({ genes: uniformStats(1) }))
    const huge = computeStats(
      data,
      makeMonster({ genes: { ...uniformStats(10), attack: '1e1000' } })
    ).final
    expect(huge.attack.isFinite()).toBe(true)
    // (30 + 1e1000 × geneWeight 2) × 1 → 2e1000 (phần 30 nằm ngoài 40 chữ số có nghĩa).
    expect(huge.attack.eq('2e1000')).toBe(true)
    expect(huge.hp).toEqual(50)
    expect(final.attack).toEqual(32)
  })

  it('gen 1e50, fusingBonusStats 1e1000, level lớn: vẫn đúng thứ tự tính', () => {
    const monster = makeMonster({
      level: 1001,
      genes: uniformStats(1e50),
      fusingBonusStats: { ...uniformStats(0), hp: '1e1000' }
    })
    const stats = computeStats(data, monster)
    // leveled = base × (1 + 1000 × growth 0,1) = 2e50 × 101 (phần 30 của gốc bị làm tròn mất).
    expect(stats.leveled.attack.div('2.02e52').minus(1).abs().lt(1e-30)).toBe(true)
    expect(stats.withFusingBonus.hp.eq(stats.leveled.hp.plus('1e1000'))).toBe(true)
    expect(stats.final.hp.isFinite()).toBe(true)
  })
})

describe('computeStats — trait race', () => {
  // neutral: neutralMight +20% công, +50% tốc độ (luôn cấp 1); gốc mọi chỉ số 50.
  const raceData = makeRaceTraitData()

  it('trait race áp ở bước trait, kể cả khi quái không lưu trait nào', () => {
    const stats = computeStats(raceData, makeMonster())
    expect(stats.withFusingBonus.attack.toNumber()).toBeCloseTo(50)
    expect(stats.withTraits.attack.toNumber()).toBeCloseTo(50 * 1.2)
    expect(stats.withTraits.defense.toNumber()).toBeCloseTo(50)
  })

  it('percent của trait race cộng chung với trait thường; mâu thuẫn thì bù trừ', () => {
    const monster = makeMonster({
      traits: [
        { id: 'mighty', level: 1 },
        { id: 'slow', level: 1 }
      ]
    })
    const stats = computeStats(raceData, monster)
    // Công: (50 + 10) × (1 + 0,5 + 0,2); tốc độ: 50 × (1 − 0,5 + 0,5).
    expect(stats.withTraits.attack.toNumber()).toBeCloseTo(60 * 1.7)
    expect(stats.withTraits.speed.toNumber()).toBeCloseTo(50)
  })

  it('trait race không tăng theo cấp của trait khác; race khác thì trait race khác', () => {
    const highLevel = makeMonster({ traits: [{ id: 'mighty', level: 20 }] })
    // mighty cấp 20: +10 × 4,8 flat, +50% × 4,8; trait race vẫn +20%.
    expect(computeStats(raceData, highLevel).withTraits.attack.toNumber()).toBeCloseTo(
      (50 + 48) * (1 + 2.4 + 0.2)
    )
    const brute = makeMonster({ raceId: 'brute' })
    const bruteStats = computeStats(raceData, brute)
    expect(bruteStats.withTraits.attack.eq(bruteStats.withFusingBonus.attack)).toBe(true)
  })

  it('số cực lớn: gen 1e1000 vẫn nhân đúng % trait race', () => {
    const monster = makeMonster({ genes: { ...uniformStats(10), attack: '1e1000' } })
    const attack = computeStats(raceData, monster).withTraits.attack
    expect(attack.isFinite()).toBe(true)
    expect(attack.div('2.4e1000').minus(1).abs().lt(1e-30)).toBe(true)
  })
})

describe('computeStats — nhớ ba bước đầu (gốc, level, fuse)', () => {
  it('đổi bất kỳ đầu vào nào thì tính lại, bản chép (cùng Decimal) cho cùng kết quả', () => {
    const monster = makeMonster({ level: 10 })
    const first = computeStats(data, monster)
    // Bản chép giữ nguyên tham chiếu gen: dùng lại nhưng vẫn đúng giá trị.
    expect(computeStats(data, { ...monster, genes: { ...monster.genes } })).toEqual(first)
    const leveled = computeStats(data, { ...monster, level: 11 })
    expect(leveled.leveled.attack.gt(first.leveled.attack)).toBe(true)
    const boss = computeStats(data, { ...monster, bossMultiplier: 2 })
    expect(boss.base.attack).toEqual(first.base.attack.times(2))
    const fused = computeStats(data, {
      ...monster,
      fusingBonusStats: { ...monster.fusingBonusStats, attack: toBig(7) }
    })
    expect(fused.withFusingBonus.attack).toEqual(first.withFusingBonus.attack.plus(7))
    const awakened = computeStats(data, { ...monster, awakening: 1 })
    expect(awakened.base.attack.eq(first.base.attack)).toBe(
      data.config.awakening.statStepPercent === 0
    )
    // Gen khác (chỉ số không phải HP) dù gen HP cùng tham chiếu.
    const strong = computeStats(data, {
      ...monster,
      genes: { ...monster.genes, attack: toBig(99) }
    })
    expect(strong.base.attack.gt(first.base.attack)).toBe(true)
    // Bộ dữ liệu khác (geneWeight khác) không dùng kết quả của bộ cũ.
    const heavier = { ...data, config: { ...data.config, geneWeight: data.config.geneWeight + 1 } }
    expect(computeStats(heavier, monster).base.attack.gt(first.base.attack)).toBe(true)
  })

  it('sửa kết quả trả về không làm hỏng lần tính sau', () => {
    const monster = makeMonster({ level: 5 })
    const first = computeStats(data, monster)
    const expected = first.base.attack
    first.base.attack = toBig(-1)
    first.leveled.attack = toBig(-1)
    expect(computeStats(data, monster).base.attack).toEqual(expected)
    expect(computeStats(data, monster).leveled.attack.gt(0)).toBe(true)
  })

  it('số cực lớn: gen 1e300 vẫn hữu hạn và dùng lại đúng', () => {
    const monster = makeMonster({ genes: uniformStats(1e300) })
    const first = computeStats(data, monster).final.hp
    expect(first.isFinite()).toBe(true)
    expect(computeStats(data, { ...monster }).final.hp).toEqual(first)
  })
})
