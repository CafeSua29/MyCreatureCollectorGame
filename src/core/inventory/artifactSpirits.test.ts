// Khí linh trên trang bị (docs/rules/artifact-spirits.md): số ô theo bậc / cấp / hồn khí, phẩm cấp và
// thức tỉnh, hiệu lực (dã linh một nửa, softCap, số cực lớn), hook cộng vào chỉ số, dã linh trên đồ
// rơi, kiểm tra dữ liệu.

import { describe, expect, it } from 'vitest'
import { computeStats } from '../monster'
import { createRng } from '../shared'
import {
  FIXTURE_SPIRIT_IDS,
  dataIssuesAfter,
  equipped,
  makeEquipment,
  makeEquipmentData,
  makeMonster
} from '../testing'
import type { ArtifactSpirit } from '../model'
import {
  breedSpiritPair,
  depthOf,
  hasSameSpiritTypes,
  isSpiritAwakened,
  rollSpirit,
  rollWildSpirits,
  spiritEffectValue,
  spiritGrade,
  spiritSlotCount,
  spiritsOf,
  withSpirits
} from './artifactSpirits'

const data = makeEquipmentData()
const [SWORD, GUARD] = FIXTURE_SPIRIT_IDS

const spirit = (value: number, subdued = true, typeIds: string[] = [SWORD]): ArtifactSpirit => ({
  typeIds,
  value,
  subdued
})

describe('ô khí linh', () => {
  it('theo bậc, + 1 mỗi 100 cấp món, hồn khí 6', () => {
    expect(spiritSlotCount(data, makeEquipment({ rarity: 'common' }))).toBe(1)
    expect(spiritSlotCount(data, makeEquipment({ rarity: 'legendary', level: 99 }))).toBe(5)
    expect(spiritSlotCount(data, makeEquipment({ rarity: 'rare', level: 100 }))).toBe(4)
    expect(spiritSlotCount(data, makeEquipment({ rarity: 'common', level: 1e15 }))).toBe(1 + 1e13)
  })

  it('trường tùy chọn: không có = không khí linh, tầng 0; rỗng thì bỏ trường', () => {
    const plain = makeEquipment()
    expect(spiritsOf(plain)).toEqual([])
    expect(depthOf(plain)).toBe(0)
    expect(withSpirits(withSpirits(plain, [spirit(3)]), [])).toEqual(plain)
  })
})

describe('phẩm cấp và thức tỉnh', () => {
  it('Phàm / Linh / Bảo / Tiên / Thần theo ngưỡng, Thần + n mỗi 150 value', () => {
    expect(spiritGrade(data, 1)).toBe(0)
    expect(spiritGrade(data, 10)).toBe(1)
    expect(spiritGrade(data, 24)).toBe(1)
    expect(spiritGrade(data, 25)).toBe(2)
    expect(spiritGrade(data, 150)).toBe(4)
    expect(spiritGrade(data, 299)).toBe(4)
    expect(spiritGrade(data, 300)).toBe(5)
    expect(spiritGrade(data, 150 + 150 * 1e12)).toBe(4 + 1e12)
  })

  it('thức tỉnh từ Bảo: thêm hook thức tỉnh (Kiếm Linh +chí mạng)', () => {
    expect(isSpiritAwakened(data, spirit(24))).toBe(false)
    expect(isSpiritAwakened(data, spirit(25))).toBe(true)
  })
})

describe('hiệu lực', () => {
  it('dã linh một nửa, đã thu phục đủ', () => {
    expect(spiritEffectValue(data, spirit(10), SWORD)).toBe(10)
    expect(spiritEffectValue(data, spirit(10, false), SWORD)).toBe(5)
  })

  it('softCap: giảm dần, không vượt trần (Hộ Linh không thành miễn sát thương)', () => {
    expect(spiritEffectValue(data, spirit(200, true, [GUARD]), GUARD)).toBe(100)
    const huge = spiritEffectValue(data, spirit(1e300, true, [GUARD]), GUARD)
    expect(huge).toBeLessThanOrEqual(200)
    expect(Number.isFinite(huge)).toBe(true)
  })

  it('cộng vào % công của quái mang món như mọi dòng trang bị', () => {
    const base = makeMonster({ equipment: [equipped(makeEquipment())] })
    const withSpirit = makeMonster({
      equipment: [equipped(makeEquipment({ spirits: [spirit(20), spirit(10, false)] }))]
    })
    const attack = (m: typeof base): number => computeStats(data, m).withTraits.attack.toNumber()
    // Món +10% công; khí linh +20% và dã linh +5%.
    expect(attack(withSpirit) / attack(base)).toBeCloseTo(1.35 / 1.1)
  })

  it('khí linh kép có hiệu ứng cả hai loại', () => {
    const dual = breedSpiritPair(spirit(10), spirit(30, true, [GUARD]))
    expect(dual).toEqual({ typeIds: [SWORD, GUARD], value: 20, subdued: true })
    expect(hasSameSpiritTypes(dual, spirit(1, true, [GUARD, SWORD]))).toBe(true)
    expect(hasSameSpiritTypes(dual, spirit(1))).toBe(false)
  })
})

describe('tung khí linh', () => {
  it('value trong khoảng của bậc × (1 + valuePercent %), ít nhất 1', () => {
    let rng = createRng(1)
    for (let i = 0; i < 50; i++) {
      let rolled: ArtifactSpirit
      ;[rolled, rng] = rollSpirit(data, rng, { rarity: 'rare', subdued: false })
      expect(rolled.value).toBeGreaterThanOrEqual(3)
      expect(rolled.value).toBeLessThanOrEqual(8)
      expect(rolled.subdued).toBe(false)
    }
    const [boosted] = rollSpirit(data, createRng(1), {
      rarity: 'common',
      subdued: true,
      valuePercent: 100
    })
    expect(boosted.value).toBeGreaterThanOrEqual(2)
  })

  it('dã linh trên đồ rơi: fixture chỉ một số (0) thì không tốn RNG', () => {
    const rng = createRng(5)
    const instance = makeEquipment()
    expect(rollWildSpirits(data, rng, instance)).toEqual([instance, rng])
  })

  it('dã linh trên đồ rơi: không quá số ô còn trống', () => {
    const twoAlways = makeEquipmentData((raw) => {
      raw.config.artifactSpirits.dropSpiritWeights = [0, 0, 1]
    })
    const [common] = rollWildSpirits(twoAlways, createRng(5), makeEquipment())
    expect(spiritsOf(common)).toHaveLength(1)
    const [rare] = rollWildSpirits(twoAlways, createRng(5), makeEquipment({ rarity: 'rare' }))
    expect(spiritsOf(rare).map((entry) => entry.subdued)).toEqual([false, false])
  })
})

describe('kiểm tra dữ liệu', () => {
  it('báo lỗi hook sai, softCap ≤ 0, trường lạ, config sai', () => {
    const issues = dataIssuesAfter((raw) => {
      raw.artifactSpirits[0].hooks = []
      raw.artifactSpirits[1].softCap = 0
      Object.assign(raw.artifactSpirits[1], { extra: 1 })
      raw.config.artifactSpirits.gradeThresholds = [10, 5]
      raw.config.artifactSpirits.dropSpiritWeights = [0]
      raw.config.artifactSpirits.summon.orbItemId = 'nope'
      raw.config.artifactSpirits.itemWorld.bosses.push({
        id: 'general',
        every: 0,
        multiplier: 0.5,
        bonusRolls: 1,
        rewards: []
      })
    })
    for (const text of [
      'hooks phải là danh sách hook khác rỗng',
      'softCap',
      'trường "extra" không thuộc khí linh',
      'gradeThresholds[1] phải lớn hơn',
      'dropSpiritWeights cần ít nhất một trọng số > 0',
      'summon.orbItemId',
      'bị trùng "general"',
      'every',
      'multiplier'
    ]) {
      expect(
        issues.some((issue) => issue.includes(text)),
        `${text}: ${issues.join(' | ')}`
      ).toBe(true)
    }
  })

  it('dữ liệu fixture hợp lệ', () => {
    expect(dataIssuesAfter(() => {})).toEqual([])
  })
})
