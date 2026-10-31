import { describe, expect, it } from 'vitest'
import { equipped, makeEquipment, makeEquipmentData, makeMonster } from '../testing'
import { STAT_PERCENT_SOURCE_IDS } from '../model'
import { STAT_PERCENT_SOURCES } from '../registries'
import { computeStats } from './stats'

// Fixture: weakling level 1 gen 10 có mọi chỉ số 50; kiếm common +10% công.
const data = makeEquipmentData()

describe('trang bị trong computeStats (mục "Trang bị và đồ cầm")', () => {
  it('dòng trang bị cộng % ở bước áp trait, chung tổng với trait', () => {
    const plain = computeStats(data, makeMonster()).withTraits
    expect(plain.attack.toNumber()).toBe(50)
    const sword = makeMonster({ equipment: [equipped(makeEquipment())] })
    expect(computeStats(data, sword).withTraits.attack.toNumber()).toBeCloseTo(55)
    // Trait +10% công (Huyết thống boss) và kiếm +10%: cộng thành +20%, không nhân chồng.
    const both = makeMonster({
      traits: [{ id: 'bossBlood', level: 1 }],
      equipment: [equipped(makeEquipment())]
    })
    expect(computeStats(data, both).withTraits.attack.toNumber()).toBeCloseTo(50 * 1.2)
  })

  it('cấp món theo cùng công thức trait: × (1 + 0,2 × (cấp − 1)); dòng phụ cũng tính', () => {
    const levelled = makeEquipment({
      level: 6,
      rolls: [
        { lineId: 'main', value: 10 },
        { lineId: 'affixDefense', value: 20 }
      ]
    })
    const stats = computeStats(data, makeMonster({ equipment: [equipped(levelled)] })).withTraits
    expect(stats.attack.toNumber()).toBeCloseTo(50 * 1.2)
    expect(stats.defense.toNumber()).toBeCloseTo(50 * 1.4)
  })

  it('percentBySource tách % theo nguồn; tổng các nguồn = % đã áp', () => {
    const monster = makeMonster({
      traits: [{ id: 'bossBlood', level: 1 }],
      equipment: [equipped(makeEquipment())]
    })
    const { percentBySource } = computeStats(data, monster)
    expect(Object.keys(percentBySource).sort()).toEqual([...STAT_PERCENT_SOURCE_IDS].sort())
    expect(percentBySource.equipment.attack).toBeCloseTo(10)
    expect(percentBySource.traits.attack).toBeCloseTo(10)
    expect(percentBySource.statuses.attack).toBe(0)
  })

  it('mọi nguồn % có mục registry; dòng không tồn tại thì computeStats báo lỗi dữ liệu', () => {
    for (const id of STAT_PERCENT_SOURCE_IDS) expect(STAT_PERCENT_SOURCES[id]).toBeDefined()
    const ghost = makeEquipment({ rolls: [{ lineId: 'ghost', value: 99 }] })
    expect(() => computeStats(data, makeMonster({ equipment: [equipped(ghost)] }))).toThrow(
      /dòng không tồn tại "ghost"/
    )
  })

  it('giá trị cực lớn vẫn hữu hạn', () => {
    const huge = makeEquipment({ level: 1_000_000, rolls: [{ lineId: 'main', value: 1_000_000 }] })
    const stats = computeStats(data, makeMonster({ equipment: [equipped(huge)] })).final
    expect(stats.attack.isFinite()).toBe(true)
    expect(stats.attack.gt(1e10)).toBe(true)
  })
})
