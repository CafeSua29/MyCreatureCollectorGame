import { describe, expect, it } from 'vitest'
import {
  hasStatus,
  isStatusImmune,
  rollStatusDuration,
  statusStatMultipliers,
  validateStatuses,
  withStatus
} from './status'
import { computeStats } from './stats'
import { validateMonster } from './validateMonster'
import { createRng, toBig } from '../shared'
import { defined, makeData, makeMonster, type MonsterOverrides } from '../testing'
import type { Monster } from '../model'

// Fixture: hệ cỏ miễn độc, hệ lửa miễn bỏng; trait "immunity" miễn độc + ngủ.
// Độc 4 lượt, bỏng 3, tê liệt 3 (tốc độ × 0,5), ngủ 1–3.
const data = makeData()
const normal = (overrides: MonsterOverrides = {}): Monster =>
  makeMonster({ elementIds: ['normal'], ...overrides })

describe('hasStatus / withStatus', () => {
  it('thêm trạng thái mới vào cuối danh sách, không sửa danh sách cũ', () => {
    const before = [{ statusId: 'burn', turnsLeft: 2 }]
    const after = withStatus(before, 'poison', 4)
    expect(after).toEqual([
      { statusId: 'burn', turnsLeft: 2 },
      { statusId: 'poison', turnsLeft: 4 }
    ])
    expect(before).toHaveLength(1)
    expect(hasStatus(normal({ statuses: after }), 'poison')).toBe(true)
    expect(hasStatus(normal({ statuses: after }), 'sleep')).toBe(false)
  })

  it('dính lại: không cộng dồn, lấy thời hạn dài hơn', () => {
    const current = [{ statusId: 'sleep', turnsLeft: 2 }]
    expect(withStatus(current, 'sleep', 3)).toEqual([{ statusId: 'sleep', turnsLeft: 3 }])
    expect(withStatus(current, 'sleep', 1)).toEqual([{ statusId: 'sleep', turnsLeft: 2 }])
  })
})

describe('isStatusImmune', () => {
  it('miễn theo hệ: cỏ miễn độc, lửa miễn bỏng (chỉ cần một hệ)', () => {
    expect(isStatusImmune(data, makeMonster({ elementIds: ['grass'] }), 'poison')).toBe(true)
    expect(isStatusImmune(data, makeMonster({ elementIds: ['normal', 'fire'] }), 'burn')).toBe(true)
    expect(isStatusImmune(data, makeMonster({ elementIds: ['fire'] }), 'poison')).toBe(false)
    expect(isStatusImmune(data, normal(), 'poison')).toBe(false)
  })

  it('miễn theo trait (hook statusImmunity), mọi cấp trait', () => {
    const immune = normal({ traits: [{ id: 'immunity', level: 1 }] })
    expect(isStatusImmune(data, immune, 'poison')).toBe(true)
    expect(isStatusImmune(data, immune, 'sleep')).toBe(true)
    expect(isStatusImmune(data, immune, 'paralysis')).toBe(false)
    const high = normal({ traits: [{ id: 'immunity', level: 50 }] })
    expect(isStatusImmune(data, high, 'sleep')).toBe(true)
  })
})

describe('rollStatusDuration', () => {
  it('min = max: cố định, không tốn RNG', () => {
    const rng = createRng(7)
    expect(rollStatusDuration(data, rng, 'poison')).toEqual([4, rng])
  })

  it('khoảng: tung đều trong [min, max], tất định theo seed, ra đủ mọi giá trị', () => {
    const seen = new Set<number>()
    let rng = createRng(1)
    for (let i = 0; i < 200; i++) {
      let rolled: number | null
      ;[rolled, rng] = rollStatusDuration(data, rng, 'sleep')
      const turns = defined(rolled)
      expect(turns).toBeGreaterThanOrEqual(1)
      expect(turns).toBeLessThanOrEqual(3)
      seen.add(turns)
    }
    expect([...seen].sort()).toEqual([1, 2, 3])
    expect(rollStatusDuration(data, createRng(5), 'sleep')).toEqual(
      rollStatusDuration(data, createRng(5), 'sleep')
    )
  })
})

describe('chỉ số theo trạng thái (computeStats)', () => {
  it('tê liệt: tốc độ × 0,5 ở bước withStatuses, chỉ số khác giữ nguyên', () => {
    const plain = computeStats(data, normal())
    const paralyzed = computeStats(
      data,
      normal({ statuses: [{ statusId: 'paralysis', turnsLeft: 3 }] })
    )
    expect(paralyzed.withTraits.speed).toEqual(plain.withTraits.speed)
    expect(paralyzed.withStatuses.speed.toNumber()).toBeCloseTo(25)
    expect(paralyzed.final.speed.toNumber()).toBe(25)
    expect(paralyzed.final.attack).toEqual(plain.final.attack)
    expect(paralyzed.final.hp).toEqual(plain.final.hp)
  })

  it('bậc trận áp sau trạng thái; không trạng thái thì hệ số 1', () => {
    const paralyzed = normal({ statuses: [{ statusId: 'paralysis', turnsLeft: 1 }] })
    expect(computeStats(data, paralyzed, { stages: { speed: 2 } }).final.speed.toNumber()).toBe(50)
    expect(statusStatMultipliers(data, normal())).toEqual({
      hp: 1,
      attack: 1,
      defense: 1,
      spAttack: 1,
      spDefense: 1,
      speed: 1
    })
  })

  it('số cực lớn: không ra Infinity / NaN, tối thiểu 1', () => {
    const huge = normal({
      genes: { hp: 1, attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: toBig('1e500') },
      statuses: [{ statusId: 'paralysis', turnsLeft: 1 }]
    })
    const speed = computeStats(data, huge).final.speed
    expect(speed.isFinite()).toBe(true)
    expect(speed.gt('1e499')).toBe(true)
    const tiny = normal({
      genes: { hp: 1, attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 },
      traits: [{ id: 'slow', level: 1 }],
      statuses: [{ statusId: 'paralysis', turnsLeft: 1 }]
    })
    expect(computeStats(data, tiny).final.speed.gte(1)).toBe(true)
  })
})

describe('validateStatuses / validateMonster', () => {
  it('danh sách hợp lệ (kể cả rỗng)', () => {
    expect(validateStatuses(data, [], 'statuses')).toEqual([])
    expect(
      validateStatuses(
        data,
        [
          { statusId: 'poison', turnsLeft: 1 },
          { statusId: 'sleep', turnsLeft: Number.MAX_SAFE_INTEGER }
        ],
        'statuses'
      )
    ).toEqual([])
  })

  it('báo lỗi: không phải danh sách, id lạ, lặp, turnsLeft < 1 hoặc không nguyên', () => {
    expect(validateStatuses(data, undefined, 'statuses').join()).toMatch(/phải là danh sách/)
    expect(validateStatuses(data, [{ statusId: 'curse', turnsLeft: 1 }], 'x').join()).toMatch(
      /không tồn tại "curse"/
    )
    const twice = [
      { statusId: 'burn', turnsLeft: 1 },
      { statusId: 'burn', turnsLeft: 2 }
    ]
    expect(validateStatuses(data, twice, 'x').join()).toMatch(/"burn" bị lặp/)
    expect(validateStatuses(data, [{ statusId: 'burn', turnsLeft: 0 }], 'x').join()).toMatch(
      /x\[0\]\.turnsLeft/
    )
    expect(validateStatuses(data, [{ statusId: 'burn', turnsLeft: 1.5 }], 'x').join()).toMatch(
      /turnsLeft/
    )
    expect(validateStatuses(data, [null], 'x').length).toBeGreaterThan(0)
  })

  it('validateMonster ghi đường dẫn trường', () => {
    const bad = normal({ statuses: [{ statusId: 'curse', turnsLeft: 1 }] })
    expect(validateMonster(data, bad, 'party[0]').join()).toMatch(/party\[0\]\.statuses\[0\]/)
  })
})
