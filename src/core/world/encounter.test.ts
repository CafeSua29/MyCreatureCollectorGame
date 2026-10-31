import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { validateMonster } from '../monster'
import { generateEncounter, generateWildMonster, skillsAtLevel } from './encounter'
import { createRng } from '../shared'
import { makeData, makeRawData, fixtureSite } from '../testing'
import type { Monster, NormalSpecies, WildConfig } from '../model'

const data = makeData()

describe('skillsAtLevel', () => {
  it('lấy các skill học gần nhất, tối đa maxSkills', () => {
    const weakling = data.species.weakling as NormalSpecies
    expect(skillsAtLevel(data, weakling, 1)).toEqual(['strike', 'growl'])
    expect(skillsAtLevel(data, weakling, 12)).toEqual(['growl', 'blast', 'pumpUp', 'sap'])
  })
})

describe('generateWildMonster', () => {
  it('cùng RNG cho cùng quái', () => {
    const floor = 1
    expect(generateWildMonster(data, createRng(5), fixtureSite(data, floor), 'm1')).toEqual(
      generateWildMonster(data, createRng(5), fixtureSite(data, floor), 'm1')
    )
  })

  it('quái sinh ra hợp lệ, đúng level, gen, skill của tầng', () => {
    // Tầng 2 của fixture: quái thường level 3.
    const [monster] = generateWildMonster(data, createRng(5), fixtureSite(data, 2), 'm7')
    expect(validateMonster(data, monster)).toEqual([])
    expect(monster).toMatchObject({
      id: 'm7',
      speciesId: 'weakling',
      level: 3,
      exp: 27,
      damageTaken: 0,
      shinyStacks: 0,
      bossMultiplier: 1,
      skillIds: ['strike', 'growl']
    })
    expect(Object.values(monster.genes).every((gene) => gene.eq(10))).toBe(true)
  })

  it('trait random theo trọng số, đúng loại, không có cặp loại trừ', () => {
    const raw = makeRawData()
    raw.config.wild.traitCountWeights = [0, 0, 1] // luôn 2 trait
    raw.config.wild.traitKindWeights = { positive: 1, negative: 1 }
    const custom = createGameData(raw)
    let rng = createRng(1)
    for (let i = 0; i < 100; i++) {
      let monster: Monster
      ;[monster, rng] = generateWildMonster(custom, rng, fixtureSite(custom, 1), 'm1')
      expect(monster.traits).toHaveLength(2)
      expect(validateMonster(custom, monster)).toEqual([])
      for (const { id } of monster.traits) {
        expect(['positive', 'negative']).toContain(custom.traits[id].kind)
      }
    }
  })
})

describe('trait quái hoang theo trọng số loại', () => {
  /** Tung 1 trait cho 400 quái, đếm theo loại trait. */
  function countKinds(weights: WildConfig['traitKindWeights']): Record<string, number> {
    const raw = makeRawData()
    raw.config.wild.traitCountWeights = [0, 1] // luôn 1 trait
    raw.config.wild.traitKindWeights = weights
    const custom = createGameData(raw)
    const counts: Record<string, number> = {}
    let rng = createRng(7)
    for (let i = 0; i < 400; i++) {
      let monster: Monster
      ;[monster, rng] = generateWildMonster(custom, rng, fixtureSite(custom, 1), 'm1')
      for (const { id } of monster.traits) {
        const kind = custom.traits[id].kind
        counts[kind] = (counts[kind] ?? 0) + 1
      }
    }
    return counts
  }

  it('trọng số theo cả loại, không theo số trait trong loại; loại 0 / thiếu thì không ra', () => {
    const counts = countKinds({ positive: 1, negative: 1, rare: 2 })
    expect(Object.keys(counts).sort()).toEqual(['negative', 'positive', 'rare'])
    // rare ≈ 50%, mỗi loại kia ≈ 25% (400 lần tung, sai số rộng).
    expect(counts.rare).toBeGreaterThan(160)
    expect(counts.rare).toBeLessThan(240)
    expect(counts.negative).toBeGreaterThan(60)
    expect(counts.negative).toBeLessThan(140)
    expect(Object.keys(countKinds({ positive: 1, rare: 0 }))).toEqual(['positive'])
  })

  it('một loại thì không tốn thêm RNG cho bước chọn loại (giữ chuỗi tung cũ)', () => {
    const base = createGameData(makeRawData())
    const raw = makeRawData()
    raw.config.wild.traitKindWeights = { positive: 1, rare: 0 }
    const zeroRare = createGameData(raw)
    const [a] = generateWildMonster(base, createRng(5), fixtureSite(base, 1), 'm1')
    const [b] = generateWildMonster(zeroRare, createRng(5), fixtureSite(zeroRare, 1), 'm1')
    expect(b).toEqual(a)
  })
})

describe('generateEncounter', () => {
  it('gặp 1 hoặc 2 quái theo doubleChance, id lấy từ nextMonsterId', () => {
    const single = generateEncounter(data, createRng(3), fixtureSite(data, 1), 10)
    expect(single.enemies.map((m) => m.id)).toEqual(['m10'])
    expect(single.nextMonsterId).toEqual(11)

    const double = generateEncounter(data, createRng(3), fixtureSite(data, 3), 10)
    expect(double.enemies.map((m) => m.id)).toEqual(['m10', 'm11'])
    expect(double.nextMonsterId).toEqual(12)
  })
})
