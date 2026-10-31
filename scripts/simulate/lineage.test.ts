import { describe, expect, it } from 'vitest'
import { DataError, createGameData } from '@core'
import { defined, makeData, makeMonster, makeRawData } from '@core/testing'
import type { BreedingSpec, FusionSpec } from './scenarios'
import { chooseInheritance, runBreeding, runFusion } from './lineage'

const data = makeData()

const breeding = (overrides: Partial<BreedingSpec> = {}): BreedingSpec => ({
  speciesId: 'weakling',
  floor: 1,
  measureLevel: 10,
  genes: 'wild',
  generations: 3,
  offspringPerGeneration: 4,
  ...overrides
})

const fusion = (overrides: Partial<FusionSpec> = {}): FusionSpec => ({
  speciesId: 'weakling',
  floor: 1,
  level: 10,
  genes: 10,
  fusions: 3,
  ...overrides
})

describe('runBreeding', () => {
  it('một dòng cho mỗi đời (kể cả đời 0), đời 0 tỉ lệ 1 và giá 0; tất định', () => {
    const rows = runBreeding(data, breeding(), 1)
    expect(rows.map((row) => row.generation)).toEqual([0, 1, 2, 3])
    expect(rows[0].statRatio).toEqual(1)
    expect(rows[0].cost).toEqual(0)
    // Giá breed = 20 × (level bố + level mẹ), cả hai ở measureLevel.
    expect(rows[1].cost).toEqual(400)
    expect(runBreeding(data, breeding(), 1)).toEqual(rows)
  })

  it('breedInfused: mỗi trứng đặt đủ linh thạch cùng hệ, gen cao hơn breed thường', () => {
    const plain = runBreeding(data, breeding(), 1)
    const infused = runBreeding(data, breeding(), 1, { infused: true })
    expect(infused.every((row) => row.kind === 'breedInfused')).toBe(true)
    expect(infused[0].geneTotal).toEqual(plain[0].geneTotal)
    const last = defined(infused.at(-1), 'đời cuối')
    expect(last.geneTotal.gt(defined(plain.at(-1), 'đời cuối').geneTotal)).toBe(true)
  })

  it('mỗi đời hiến tế các con không chọn vào mẹ mới; stack không truyền qua breeding', () => {
    const rows = runBreeding(data, breeding(), 1)
    expect(rows[0].sacrificeStacks).toBe(0)
    expect(rows.slice(1).some((row) => row.note === '')).toBe(true)
    for (const row of rows.slice(1)) {
      if (row.note !== '') continue
      // 4 con, 1 con cái được chọn: 3 con còn lại hiến tế (stack của đời trước không còn).
      expect(row.sacrificeStacks).toBe(3)
      // 20 × 3 × (10 + 1): mẹ mới ở measureLevel, con level 1.
      expect(row.sacrificeCost).toEqual(660)
    }
  })

  it('gen tăng qua các đời khi breed lấy gen cao nhất của bố mẹ và biên độ chỉ tăng', () => {
    const raw = makeRawData()
    raw.config.breeding = { ...raw.config.breeding, geneDownPercent: 0, geneUpPercent: 50 }
    const rising = createGameData(raw)
    const rows = runBreeding(rising, breeding({ generations: 5 }), 2)
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].note) continue
      expect(rows[i].geneTotal.gte(rows[i - 1].geneTotal)).toBe(true)
    }
    expect(rows[rows.length - 1].statRatio.gt(1)).toBe(true)
    // Tư chất theo tầng kịch bản: tỉ lệ = tổng gen ÷ tổng gen tối đa quái hoang (60 ở fixture).
    for (const row of rows) expect(row.aptitudeRatio.eq(row.geneTotal.div(60))).toBe(true)
    expect(rows[0].aptitudeTierId).toBe('refined')
  })

  it('gen cực lớn không ra NaN / Infinity', () => {
    const rows = runBreeding(data, breeding({ genes: Number.MAX_SAFE_INTEGER }), 3)
    for (const row of rows) {
      expect(row.statTotal.isFinite() && row.statRatio.isFinite()).toBe(true)
      expect(row.aptitudeRatio.isFinite()).toBe(true)
      expect(row.aptitudeTierId).toBe('divine')
    }
  })

  it('loài không giới tính báo DataError', () => {
    expect(() => runBreeding(data, breeding({ speciesId: 'pebble' }), 1)).toThrow(DataError)
  })
})

describe('runFusion', () => {
  it('chỉ số tăng sau mỗi lần fuse, gen giữ nguyên, có giá', () => {
    const rows = runFusion(data, fusion(), 1)
    expect(rows.map((row) => row.generation)).toEqual([0, 1, 2, 3])
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].statTotal.gt(rows[i - 1].statTotal)).toBe(true)
      expect(rows[i].geneTotal).toEqual(rows[0].geneTotal)
      expect(rows[i].cost.gt(0)).toBe(true)
    }
    expect(runFusion(data, fusion(), 1)).toEqual(rows)
  })

  it('hết loài mới thì ghi chú và dừng', () => {
    const speciesCount = Object.values(data.species).filter((s) => s.kind === 'normal').length
    const rows = runFusion(data, fusion({ fusions: speciesCount + 5 }), 1)
    const last = rows[rows.length - 1]
    expect(last.note).toBe('hết loài mới')
    // Đời 0 + một lần fuse cho mỗi loài khác loài gốc + dòng "hết loài mới".
    expect(rows).toHaveLength(speciesCount + 1)
  })

  it('ghi tỉ lệ thành công mỗi lần fuse và tỉ lệ đi tới đời đó (tích, giảm dần)', () => {
    const raw = makeRawData()
    raw.config.fuseChance = {
      raceChances: { same: 90, breedable: 50, other: 30 },
      lineageFactor: 0.9
    }
    const rows = runFusion(createGameData(raw), fusion(), 1)
    expect(rows[0].successChance).toBeNull()
    expect(rows[0].reachChance).toBeNull()
    let reach = 100
    for (const row of rows.slice(1)) {
      const chance = defined(row.successChance)
      expect(chance).toBeGreaterThan(0)
      expect(chance).toBeLessThanOrEqual(90)
      reach = (reach * chance) / 100
      expect(row.reachChance).toBeCloseTo(reach)
    }
  })

  it('0 lần fuse: chỉ có đời 0', () => {
    expect(runFusion(data, fusion({ fusions: 0 }), 1)).toHaveLength(1)
  })
})

describe('chooseInheritance (kế thừa skill khi fuse)', () => {
  const sub = makeMonster({ id: 'b', skillIds: ['idle', 'strike', 'blast', 'wave'] })
  const power = (id: string): number => data.skills[id].power ?? 0

  it('còn ô: lấy skill power cao nhất của quái phụ, tối đa inheritSkills', () => {
    const base = makeMonster({ id: 'a', skillIds: ['quick'] })
    const { inheritSkillIds, forgetSkillIds } = chooseInheritance(data, base, sub)
    expect(inheritSkillIds).toHaveLength(data.config.fusion.inheritSkills)
    expect(forgetSkillIds).toEqual([])
    const best = ['idle', 'strike', 'blast', 'wave'].sort((a, b) => power(b) - power(a))
    expect(inheritSkillIds).toEqual(best.slice(0, 2))
  })

  it('đủ ô: chỉ thay skill yếu hơn; bộ skill không mạnh hơn thì không kế thừa', () => {
    const base = makeMonster({ id: 'a', skillIds: ['idle', 'quick', 'shaky', 'flurry'] })
    const { inheritSkillIds, forgetSkillIds } = chooseInheritance(data, base, sub)
    inheritSkillIds.forEach((skillId, i) =>
      expect(power(skillId)).toBeGreaterThan(power(forgetSkillIds[i]))
    )
    expect(chooseInheritance(data, sub, { ...base, skillIds: ['idle'] }).inheritSkillIds).toEqual(
      []
    )
  })

  it('runFusion ghi tổng power bộ skill và số skill kế thừa (breed / đời 0: rỗng)', () => {
    const rows = runFusion(data, fusion(), 1)
    expect(rows[0].inheritedSkills).toBeNull()
    for (const row of rows.slice(1)) expect(row.inheritedSkills).not.toBeNull()
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].skillPower).toBeGreaterThanOrEqual(rows[i - 1].skillPower)
    }
  })
})
