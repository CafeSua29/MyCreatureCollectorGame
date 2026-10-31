import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { computeStats } from '../monster'
import { makeBloodlineData, makeBloodlineRawData, makeData, makeMonster } from '../testing'
import type { BloodlinePurity, Monster } from '../model'
import {
  addPurity,
  ancestorGroupsOf,
  bloodlineBaseStats,
  bloodlineGroupsOf,
  bloodlineLifespanMultiplier,
  bloodlineTraitLevel,
  bloodlineTraitOf,
  clampPurity,
  hasBloodline,
  isStoredPurity,
  keepValidBloodlines,
  mainBloodline,
  withPurity
} from './bloodlines'
import { lifespanYears } from './lifespan'

// Fixture: wyrm (nymph → husk, tổ elderWyrm 100 mọi chỉ số), stone (hệ normal + nymph, tổ titanStone 200).
const data = makeBloodlineData()

const nymph = (bloodlines: BloodlinePurity[], overrides: Partial<Monster> = {}): Monster =>
  makeMonster({
    speciesId: 'nymph',
    baseSpeciesId: 'nymph',
    elementIds: ['grass'],
    bloodlines,
    ...overrides
  })

describe('thành viên nhóm huyết mạch', () => {
  it('theo danh sách loài, hệ và cả chuỗi tiến hóa; loài tổ không thuộc nhóm của mình', () => {
    expect(bloodlineGroupsOf(data, 'nymph')).toEqual(['wyrm', 'stone'])
    // husk không có trong speciesIds nhưng cùng chuỗi với nymph.
    expect(bloodlineGroupsOf(data, 'husk')).toEqual(['wyrm', 'stone'])
    expect(bloodlineGroupsOf(data, 'pebble')).toEqual(['stone'])
    expect(bloodlineGroupsOf(data, 'titanStone')).toEqual([])
    expect(bloodlineGroupsOf(data, 'weakling')).toEqual([])
    expect(bloodlineGroupsOf(data, 'megaWeakling')).toEqual([])
    expect(bloodlineGroupsOf(data, 'ghost')).toEqual([])
    expect(hasBloodline(data, 'pebble')).toBe(true)
    expect(hasBloodline(data, 'twig')).toBe(false)
    expect(ancestorGroupsOf(data, 'elderWyrm')).toEqual(['wyrm'])
    expect(ancestorGroupsOf(data, 'nymph')).toEqual([])
  })

  it('excludeSpeciesIds loại đúng loài đó; race khớp cả nhóm race', () => {
    const raw = makeBloodlineRawData()
    raw.bloodlines[1].excludeSpeciesIds = ['boulder']
    raw.bloodlines[0] = { ...raw.bloodlines[0], speciesIds: undefined, raceIds: ['neutral'] }
    const custom = createGameData(raw)
    expect(bloodlineGroupsOf(custom, 'boulder')).toEqual(['wyrm'])
    expect(bloodlineGroupsOf(custom, 'pebble')).toEqual(['wyrm', 'stone'])
    expect(bloodlineGroupsOf(custom, 'elderWyrm')).toEqual([])
  })

  it('dữ liệu không có nhóm nào', () => {
    expect(bloodlineGroupsOf(makeData(), 'nymph')).toEqual([])
  })
})

describe('độ thuần', () => {
  it('làm tròn 1 chữ số, kẹp [0, 100]; chỉ lưu (0, 100]', () => {
    expect(clampPurity(12.345)).toBe(12.3)
    expect(clampPurity(-5)).toBe(0)
    expect(clampPurity(1e300)).toBe(100)
    expect(isStoredPurity(0.1)).toBe(true)
    expect(isStoredPurity(100)).toBe(true)
    expect(isStoredPurity(0)).toBe(false)
    expect(isStoredPurity(100.1)).toBe(false)
    expect(isStoredPurity(1.25)).toBe(false)
    expect(isStoredPurity('5')).toBe(false)
  })

  it('withPurity giữ thứ tự bloodlines.json, 0 thì bỏ nhóm', () => {
    const list = withPurity(data, [{ groupId: 'stone', purity: 5 }], 'wyrm', 7.25)
    expect(list).toEqual([
      { groupId: 'wyrm', purity: 7.3 },
      { groupId: 'stone', purity: 5 }
    ])
    expect(withPurity(data, list, 'wyrm', 0)).toEqual([{ groupId: 'stone', purity: 5 }])
  })

  it('addPurity chỉ cộng vào nhóm loài thuộc, kẹp 100', () => {
    const monster = nymph([{ groupId: 'wyrm', purity: 98 }])
    expect(addPurity(data, monster, 'wyrm', 5).bloodlines).toEqual([
      { groupId: 'wyrm', purity: 100 }
    ])
    const pebble = makeMonster({ speciesId: 'pebble', baseSpeciesId: 'pebble', gender: 'none' })
    expect(addPurity(data, pebble, 'wyrm', 5)).toBe(pebble)
  })

  it('keepValidBloodlines bỏ nhóm loài mới không thuộc', () => {
    const list = [
      { groupId: 'wyrm', purity: 10 },
      { groupId: 'stone', purity: 5 }
    ]
    expect(keepValidBloodlines(data, list, 'pebble')).toEqual([{ groupId: 'stone', purity: 5 }])
  })
})

describe('huyết mạch chính và trait', () => {
  it('độ thuần cao nhất; hòa thì nhóm đứng trước trong bloodlines.json', () => {
    expect(mainBloodline(nymph([]))).toBeUndefined()
    const tie = nymph([
      { groupId: 'wyrm', purity: 20 },
      { groupId: 'stone', purity: 20 }
    ])
    expect(mainBloodline(tie)?.groupId).toBe('wyrm')
    const stoneWins = nymph([
      { groupId: 'wyrm', purity: 20 },
      { groupId: 'stone', purity: 20.1 }
    ])
    expect(mainBloodline(stoneWins)?.groupId).toBe('stone')
  })

  it('cấp trait = số mốc đã đạt (25 / 50 / 75 / 100)', () => {
    expect(bloodlineTraitLevel(data, 24.9)).toBe(0)
    expect(bloodlineTraitLevel(data, 25)).toBe(1)
    expect(bloodlineTraitLevel(data, 99.9)).toBe(3)
    expect(bloodlineTraitLevel(data, 100)).toBe(4)
    expect(bloodlineTraitOf(data, nymph([{ groupId: 'wyrm', purity: 10 }]))).toBeUndefined()
    expect(bloodlineTraitOf(data, nymph([{ groupId: 'wyrm', purity: 60 }]))).toEqual({
      id: 'wyrmBlood',
      level: 2
    })
  })

  it('trait huyết mạch có tác dụng lên chỉ số (+10% công ở cấp 1)', () => {
    const without = computeStats(data, nymph([{ groupId: 'stone', purity: 10 }])).final
    const withTrait = computeStats(data, nymph([{ groupId: 'stone', purity: 25 }])).final
    // Thủ tăng vì trait stoneBlood (+10%) và một phần vì pha chỉ số tổ.
    expect(withTrait.defense.gt(without.defense)).toBe(true)
  })
})

describe('pha trộn chỉ số gốc', () => {
  const base = { hp: 30, attack: 30, defense: 30, spAttack: 30, spDefense: 30, speed: 300 }

  it('max(gốc, (1 − p) × gốc + p × gốc tổ): không bao giờ giảm', () => {
    const mixed = bloodlineBaseStats(data, nymph([{ groupId: 'wyrm', purity: 50 }]), base)
    expect(mixed.attack).toBe(65)
    // Tốc độ gốc 300 cao hơn tổ (100): giữ 300.
    expect(mixed.speed).toBe(300)
    expect(bloodlineBaseStats(data, nymph([]), base)).toBe(base)
    expect(bloodlineBaseStats(data, nymph([{ groupId: 'wyrm', purity: 100 }]), base).hp).toBe(100)
  })

  it('đổi chỉ số qua computeStats; gen cực lớn không ra NaN', () => {
    const plain = computeStats(data, nymph([])).final
    const blooded = computeStats(data, nymph([{ groupId: 'wyrm', purity: 10 }])).final
    expect(blooded.hp.gt(plain.hp)).toBe(true)
    const huge = computeStats(
      data,
      nymph([{ groupId: 'wyrm', purity: 100 }], { level: 1000 }),
      {}
    ).final
    expect(huge.hp.isFinite()).toBe(true)
  })
})

describe('thọ nguyên', () => {
  it('1 + (tổ / gốc − 1) × độ thuần; không có huyết mạch = 1', () => {
    expect(bloodlineLifespanMultiplier(data, nymph([]))).toBe(1)
    // Tổ 1000 năm, nymph 100 năm, 50%: 1 + 9 × 0,5.
    expect(bloodlineLifespanMultiplier(data, nymph([{ groupId: 'wyrm', purity: 50 }]))).toBe(5.5)
    const plain = lifespanYears(data, nymph([]))
    const blooded = lifespanYears(data, nymph([{ groupId: 'wyrm', purity: 50 }]))
    expect(blooded.div(plain).toNumber()).toBeCloseTo(5.5)
  })
})
