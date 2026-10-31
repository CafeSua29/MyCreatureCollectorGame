import { describe, expect, it } from 'vitest'
import { DataError, createGameData, createRng, toBig, type StatName } from '@core'
import { makeData, makeMonster, makeRawData, withFixtureText } from '@core/testing'
import { bestNatureId, buildMonster, buildTeam, deriveSeed, geneValue, memberLevel } from './team'

const data = makeData()

describe('deriveSeed', () => {
  it('tất định, khác nhau theo từng phần, luôn là số nguyên 32 bit không âm', () => {
    expect(deriveSeed(1, 'a', 2)).toBe(deriveSeed(1, 'a', 2))
    expect(deriveSeed(1, 'a', 2)).not.toBe(deriveSeed(1, 'a', 3))
    for (const seed of [deriveSeed(), deriveSeed(Number.MAX_SAFE_INTEGER, 'x'.repeat(1000))]) {
      expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true)
    }
  })
})

describe('memberLevel / geneValue', () => {
  it('level = level boss tầng + offset, tối thiểu 1', () => {
    // Fixture: boss tầng N level 2N.
    expect(memberLevel(data, 3, -1)).toBe(5)
    expect(memberLevel(data, 1, -100)).toBe(1)
  })

  it('gen "wild" = giữa khoảng gen của tầng, kể cả tầng rất cao (số cực lớn)', () => {
    const raw = makeRawData()
    raw.config.wild = { ...raw.config.wild, geneMin: 1, geneMax: 15 }
    raw.config.floors = { ...raw.config.floors, geneGrowthPerFloor: 2 }
    const growing = createGameData(raw)
    expect(geneValue(growing, 1, 'wild')).toEqual(toBig(8))
    expect(geneValue(growing, 3, 'wild')).toEqual(toBig(32))
    const huge = geneValue(growing, 5000, 'wild')
    expect(huge.isFinite() && huge.gt(1e300)).toBe(true)
    expect(geneValue(growing, 9, 7)).toEqual(toBig(7))
  })
})

describe('bestNatureId', () => {
  // Fixture: modest (+đặc công −công), thêm adamant (+công −đặc công) để thử cả hai chiều.
  const raw = makeRawData()
  raw.natures.push({ id: 'adamant', up: 'attack', down: 'spAttack' })
  const withAdamant = createGameData(withFixtureText(raw))
  const genes = (attack: number, spAttack: number): Record<StatName, number> => ({
    hp: 10,
    attack,
    defense: 10,
    spAttack,
    spDefense: 10,
    speed: 10
  })

  it('tăng chỉ số tấn công cao hơn, giảm chỉ số còn lại; không có tính cách khớp thì giữ', () => {
    expect(bestNatureId(withAdamant, makeMonster({ genes: genes(500, 1) }))).toBe('adamant')
    expect(bestNatureId(withAdamant, makeMonster({ genes: genes(1, 500) }))).toBe('modest')
    expect(bestNatureId(data, makeMonster({ genes: genes(500, 1), natureId: 'brave' }))).toBe(
      'brave'
    )
  })

  it('buildMonster đặt tính cách tốt nhất', () => {
    const [monster] = buildMonster(withAdamant, createRng(1), {
      id: 'm1',
      speciesId: 'weakling',
      level: 5,
      genes: toBig(1),
      traits: []
    })
    expect(monster.natureId).toBe(bestNatureId(withAdamant, monster))
  })
})

describe('buildMonster / buildTeam', () => {
  it('đặt đúng loài, level, gen, trait; skill theo level như quái hoang', () => {
    const [monster] = buildMonster(data, createRng(1), {
      id: 'm1',
      speciesId: 'weakling',
      level: 12,
      genes: toBig(25),
      traits: [{ id: 'fast', level: 2 }]
    })
    expect(monster).toMatchObject({ id: 'm1', speciesId: 'weakling', level: 12, shinyStacks: 0 })
    expect(monster.genes.attack).toEqual(25)
    expect(monster.traits).toEqual([{ id: 'fast', level: 2 }])
    expect(monster.skillIds).toEqual(['growl', 'blast', 'pumpUp', 'sap'])
  })

  it('trait không tồn tại báo DataError', () => {
    const build = (): unknown =>
      buildMonster(data, createRng(1), {
        id: 'm1',
        speciesId: 'weakling',
        level: 1,
        genes: toBig(1),
        traits: [{ id: 'nope', level: 1 }]
      })
    expect(build).toThrow(DataError)
  })

  it('đội theo thứ tự khai báo, id m1, m2...; cùng seed ra cùng đội', () => {
    const team = {
      id: 't',
      members: [
        { speciesId: 'weakling', levelOffset: 0, genes: 'wild' as const, traits: [] },
        { speciesId: 'oak', levelOffset: -1, genes: 5, traits: [] }
      ],
      skipBoss: false,
      masteryExpPerFloor: null
    }
    const party = buildTeam(data, team, 2, 99)
    expect(party.map((m) => [m.id, m.speciesId, m.level])).toEqual([
      ['m1', 'weakling', 4],
      ['m2', 'oak', 3]
    ])
    expect(buildTeam(data, team, 2, 99)).toEqual(party)
  })
})
