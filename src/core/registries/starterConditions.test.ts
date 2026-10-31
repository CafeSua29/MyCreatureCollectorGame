import { describe, expect, it } from 'vitest'
import type { StarterCondition } from '../model'
import { makeData } from '../testing'
import { STARTER_CONDITIONS, isStarterEligible, starterSlotPool } from './starterConditions'

// Fixture: dạng đầu có tiến hóa weakling (→ strongling, có Mega), twig (→ oak / pine / cinder),
// pebble (→ boulder), nymph (→ husk).
const data = makeData()
const poolOf = (...conditions: StarterCondition[]): string[] =>
  starterSlotPool(data, { conditions })

describe('isStarterEligible', () => {
  it('chỉ loài dạng đầu có tiến hóa, không phải dạng biến hình', () => {
    expect(isStarterEligible(data, 'weakling')).toBe(true)
    expect(isStarterEligible(data, 'twig')).toBe(true)
    // Có dạng trước / không tiến hóa / dạng Mega / không tồn tại.
    expect(isStarterEligible(data, 'strongling')).toBe(false)
    expect(isStarterEligible(data, 'brawler')).toBe(false)
    expect(isStarterEligible(data, 'megaWeakling')).toBe(false)
    expect(isStarterEligible(data, 'ghost')).toBe(false)
  })
})

describe('starterSlotPool', () => {
  it('không điều kiện: mọi loài hợp lệ, theo thứ tự dữ liệu', () => {
    const all = poolOf()
    expect(all.slice(0, 2)).toEqual(['weakling', 'twig'])
    expect(all).toEqual(expect.arrayContaining(['pebble', 'nymph']))
    expect(all.every((id) => isStarterEligible(data, id))).toBe(true)
  })

  it('lineHasForm: chuỗi tiến hóa có dạng Mega', () => {
    expect(poolOf({ kind: 'lineHasForm', formKinds: ['mega'] })).toEqual(['weakling'])
    expect(poolOf({ kind: 'lineHasForm', formKinds: ['gmax'] })).toEqual([])
  })

  it('evolvesToRank: chính nó hoặc dạng sau đạt phẩm cấp (strongling 360 = E, oak 240 = F)', () => {
    const atLeastE = poolOf({ kind: 'evolvesToRank', rankId: 'E' })
    expect(atLeastE).toContain('weakling')
    expect(atLeastE).not.toContain('twig')
    expect(poolOf({ kind: 'evolvesToRank', rankId: 'G' })).toEqual(poolOf())
    expect(poolOf({ kind: 'evolvesToRank', rankId: 'X' })).toEqual([])
  })

  it('nhiều điều kiện: phải thỏa tất cả', () => {
    expect(
      poolOf(
        { kind: 'species', speciesIds: ['weakling', 'twig'] },
        { kind: 'evolvesToRank', rankId: 'E' }
      )
    ).toEqual(['weakling'])
  })
})

describe('STARTER_CONDITIONS.validate', () => {
  it('báo lỗi params sai', () => {
    expect(
      STARTER_CONDITIONS.lineHasForm.validate(
        { kind: 'lineHasForm', formKinds: ['ultra' as never] },
        data
      )
    ).toEqual(['formKinds: loại dạng không tồn tại "ultra"'])
    expect(
      STARTER_CONDITIONS.lineHasForm.validate({ kind: 'lineHasForm', formKinds: [] }, data)
    ).toEqual(['formKinds phải là danh sách không rỗng'])
    expect(
      STARTER_CONDITIONS.evolvesToRank.validate({ kind: 'evolvesToRank', rankId: 'Z' }, data)
    ).toEqual(['rankId: phẩm cấp loài không tồn tại "Z"'])
    expect(
      STARTER_CONDITIONS.species.validate(
        { kind: 'species', speciesIds: ['weakling', 'strongling', 'megaWeakling'] },
        data
      )
    ).toEqual([
      'speciesIds: "strongling" không phải loài dạng đầu có tiến hóa',
      'speciesIds: "megaWeakling" không phải loài dạng đầu có tiến hóa'
    ])
    expect(
      STARTER_CONDITIONS.species.validate({ kind: 'species', speciesIds: ['ghost'] }, data)
    ).toEqual(['speciesIds: loài không tồn tại "ghost"'])
  })

  it('params đúng thì không lỗi', () => {
    expect(
      STARTER_CONDITIONS.lineHasForm.validate({ kind: 'lineHasForm', formKinds: ['mega'] }, data)
    ).toEqual([])
    expect(
      STARTER_CONDITIONS.evolvesToRank.validate({ kind: 'evolvesToRank', rankId: 'S' }, data)
    ).toEqual([])
  })
})
