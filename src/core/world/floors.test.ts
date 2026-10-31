import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { validateMonster } from '../monster'
import { createRng, nextInt } from '../shared'
import { fixtureSite, makeData, makeRawData, withFixtureText } from '../testing'
import { generateFloorBoss, generateWildMonster } from './encounter'
import {
  floorGeneMultiplier,
  biomeOfFloor,
  findBiome,
  findBiomeBoss,
  floorSite,
  rollFloorBiome,
  floorBossLevel,
  floorLevelRange,
  isValidFloor
} from './floors'
import type { GameData, Monster } from '../model'

const data = makeData()

function dataWith(edit: (raw: ReturnType<typeof makeRawData>) => void): GameData {
  const raw = makeRawData()
  edit(raw)
  return createGameData(raw)
}

/** Dữ liệu với levelPerFloor 10 và gen tăng 1,1 mỗi tầng như dữ liệu thật. */
const realistic = dataWith((raw) => {
  raw.config.floors = { levelPerFloor: 10, geneGrowthPerFloor: 1.1 }
  raw.config.wild.geneMin = 1
  raw.config.wild.geneMax = 15
})

describe('biomeOfFloor', () => {
  it('đọc map của tầng trong floorBiomeIds (phần tử N − 1), không theo thứ tự file', () => {
    const state = {
      floorBiomeIds: ['pairs', 'pairs', 'field'],
      options: { lifespanEnabled: true, permadeathEnabled: false },
      time: 30
    }
    expect([1, 2, 3].map((floor) => biomeOfFloor(data, state, floor).id)).toEqual([
      'pairs',
      'pairs',
      'field'
    ])
    expect(floorSite(data, state, 3)).toEqual({
      floor: 3,
      biome: data.biomes.field,
      aging: true,
      time: 30
    })
  })

  it('tầng chưa có map hoặc map không tồn tại: lỗi lập trình', () => {
    expect(() => biomeOfFloor(data, { floorBiomeIds: ['field'] }, 2)).toThrow()
    expect(() => biomeOfFloor(data, { floorBiomeIds: ['ghost'] }, 1)).toThrow()
  })

  it('findBiome tra theo id, không nhận key kế thừa của object', () => {
    expect(findBiome(data, 'lair')?.id).toBe('lair')
    expect(findBiome(data, 'ghost')).toBeUndefined()
    expect(findBiome(data, 'toString')).toBeUndefined()
  })

  it('findBiomeBoss tra boss theo loài; loài không phải boss trả về undefined', () => {
    const lair = data.biomes.lair
    expect(findBiomeBoss(lair, 'strongling')?.drops).toEqual([
      { itemId: 'masterBall', chance: 100 }
    ])
    expect(findBiomeBoss(lair, 'weakling')).toBeUndefined()
  })
})

describe('rollFloorBiome', () => {
  it('tung đều trên mọi biome, được trùng, cùng RNG ra cùng map', () => {
    let rng = createRng(7)
    const counts: Record<string, number> = {}
    let repeats = 0
    let previous = ''
    for (let i = 0; i < 3000; i++) {
      let biomeId: string
      ;[biomeId, rng] = rollFloorBiome(data, rng)
      counts[biomeId] = (counts[biomeId] ?? 0) + 1
      if (biomeId === previous) repeats++
      previous = biomeId
    }
    expect(Object.keys(counts).sort()).toEqual(['field', 'lair', 'pairs'])
    for (const count of Object.values(counts)) expect(count).toBeGreaterThan(900)
    expect(repeats).toBeGreaterThan(0)
    expect(rollFloorBiome(data, createRng(9))).toEqual(rollFloorBiome(data, createRng(9)))
  })

  it('chỉ có một biome: luôn ra biome đó', () => {
    const raw = makeRawData()
    raw.biomes = [raw.biomes[0]]
    const single = createGameData(withFixtureText(raw))
    expect(rollFloorBiome(single, createRng(1))[0]).toBe('field')
  })
})

describe('level theo tầng', () => {
  it('quái thường từ 10(N − 1) + 1 đến 10N − 1, boss tầng level 10N', () => {
    expect(floorLevelRange(realistic, 1)).toEqual({ min: 1, max: 9 })
    expect(floorLevelRange(realistic, 2)).toEqual({ min: 11, max: 19 })
    expect(floorBossLevel(realistic, 1)).toBe(10)
    expect(floorBossLevel(realistic, 2)).toBe(20)
    expect(floorLevelRange(realistic, 1000)).toEqual({ min: 9991, max: 9999 })
  })

  it('quái hoang và boss tầng sinh ra đúng level của tầng', () => {
    let rng = createRng(11)
    for (const floor of [1, 2, 3, 57]) {
      const { min, max } = floorLevelRange(realistic, floor)
      for (let i = 0; i < 30; i++) {
        let monster: Monster
        ;[monster, rng] = generateWildMonster(realistic, rng, fixtureSite(realistic, floor), 'm1')
        expect(monster.level).toBeGreaterThanOrEqual(min)
        expect(monster.level).toBeLessThanOrEqual(max)
      }
      const [floorBoss] = generateFloorBoss(realistic, rng, fixtureSite(realistic, floor), 'b1')
      expect(floorBoss.level).toBe(floorBossLevel(realistic, floor))
    }
  })
})

describe('gen theo tầng', () => {
  it('hệ số gen = geneGrowthPerFloor^(N − 1); tầng 1 là 1', () => {
    expect(floorGeneMultiplier(realistic, 1).eq(1)).toBe(true)
    expect(floorGeneMultiplier(realistic, 2).eq(1.1)).toBe(true)
    expect(floorGeneMultiplier(realistic, 3).eq(1.21)).toBe(true)
  })

  it('tầng cực lớn: hệ số Decimal hữu hạn, vượt xa giới hạn number', () => {
    const multiplier = floorGeneMultiplier(realistic, 1_000_000)
    expect(multiplier.isFinite()).toBe(true)
    expect(multiplier.gt('1e41000')).toBe(true)
  })

  it('tầng 1 giữ nguyên cách tung gen cũ (nextInt trong [geneMin, geneMax])', () => {
    const [monster] = generateWildMonster(realistic, createRng(5), fixtureSite(realistic, 1), 'm1')
    // Thứ tự tung: loài → level → gender → gen; tung lại tay bằng nextInt để so.
    let rng = createRng(5)
    ;[, rng] = nextInt(rng, 0, 0)
    ;[, rng] = nextInt(rng, 1, 9)
    ;[, rng] = nextInt(rng, 0, 1)
    const [gene] = nextInt(rng, 1, 15)
    expect(monster.genes.hp.eq(gene)).toBe(true)
  })

  it('gen tung đều trong [floor(geneMin × hệ số), floor(geneMax × hệ số)]', () => {
    const floor = 30
    const multiplier = floorGeneMultiplier(realistic, floor)
    const low = multiplier.times(1).floor()
    const high = multiplier.times(15).floor()
    let rng = createRng(77)
    let sawLowHalf = false
    let sawHighHalf = false
    const middle = low.plus(high).div(2)
    for (let i = 0; i < 200; i++) {
      let monster: Monster
      ;[monster, rng] = generateWildMonster(realistic, rng, fixtureSite(realistic, floor), 'm1')
      for (const gene of Object.values(monster.genes)) {
        expect(gene.isInteger()).toBe(true)
        expect(gene.gte(low) && gene.lte(high)).toBe(true)
        if (gene.lt(middle)) sawLowHalf = true
        else sawHighHalf = true
      }
    }
    expect(sawLowHalf && sawHighHalf).toBe(true)
  })

  it('tầng cực lớn: gen là số nguyên Decimal hữu hạn, quái hợp lệ', () => {
    const [monster] = generateWildMonster(
      realistic,
      createRng(3),
      fixtureSite(realistic, 1_000_000),
      'm1'
    )
    for (const gene of Object.values(monster.genes)) {
      expect(gene.isFinite() && gene.isInteger()).toBe(true)
      expect(gene.gt('1e41000')).toBe(true)
    }
    expect(validateMonster(realistic, monster)).toEqual([])
  })
})

describe('isValidFloor', () => {
  it('chỉ nhận số nguyên an toàn ≥ 1', () => {
    expect([1, 2, Number.MAX_SAFE_INTEGER].every(isValidFloor)).toBe(true)
    for (const value of [0, -1, 1.5, '1', null, undefined, NaN, Infinity, 2 ** 53]) {
      expect(isValidFloor(value)).toBe(false)
    }
  })
})
