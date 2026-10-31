import { describe, expect, it } from 'vitest'
import { addItems, equipmentSlotCount, type GameState, type Monster } from '@core'
import {
  makeBloodlineData,
  makeData,
  makeEquipment,
  makeGameState,
  makeMonster,
  makeZMoveData
} from '@core/testing'
import { shouldStopEarly } from './earlyStop'
import {
  floorMapsFor,
  sweepFloor,
  withAssumedPolarity,
  withAssumedPurity,
  withLeadZCrystal,
  type FloorSweepOptions
} from './floorSweep'

const data = makeData()

const options = (overrides: Partial<FloorSweepOptions> = {}): FloorSweepOptions => ({
  variantId: 'v',
  team: {
    id: 'solo',
    members: [{ speciesId: 'weakling', levelOffset: 4, genes: 'wild', traits: [] }],
    skipBoss: false,
    masteryExpPerFloor: null
  },
  floor: 3,
  biomeId: null,
  kind: 'wild',
  battles: 5,
  maxTurns: 100,
  assumedMastery: null,
  seed: 11,
  earlyStop: null,
  ...overrides
})

describe('sweepFloor', () => {
  it('đếm thắng / thua / hết lượt đủ số trận, trung bình hợp lệ; chạy lại ra cùng kết quả', () => {
    const result = sweepFloor(data, options())
    expect(result.won + result.lost + result.timeout).toBe(5)
    expect(result).toMatchObject({ variantId: 'v', teamId: 'solo', floor: 3, kind: 'wild' })
    expect(result.played).toBe(5)
    expect(result.totalTurns).toBeGreaterThan(0)
    expect(result.avgMoney.isFinite() && result.avgExp.isFinite()).toBe(true)
    expect(sweepFloor(data, options())).toEqual(result)
  })

  it('thuần thục giả định đổi kết quả trận (power, accuracy của đội mẫu)', () => {
    const plain = sweepFloor(data, options({ battles: 8 }))
    const mastered = sweepFloor(data, options({ battles: 8, assumedMastery: { expPerFloor: 1e6 } }))
    expect(mastered.played).toBe(8)
    expect(mastered.totalTurns).not.toBe(plain.totalTurns)
  })

  it('map cố định: mọi trận đánh ở map đó; đồ rơi tính theo giá gốc', () => {
    // Fixture: map "field" rơi Thuốc hồi máu (giá 50) 100% mỗi quái bị hạ.
    const fixed = sweepFloor(data, options({ biomeId: 'field', battles: 4 }))
    expect(fixed.biomeId).toBe('field')
    if (fixed.won > 0) expect(fixed.avgDropValue.gt(0)).toBe(true)
    // Map "pairs" không rơi gì.
    expect(sweepFloor(data, options({ biomeId: 'pairs', battles: 4 })).avgDropValue).toEqual(0)
  })

  it('map ngẫu nhiên: mỗi trận tung map theo seed của trận (đủ các map của dữ liệu)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      seen.add(floorMapsFor(data, { floor: 3, biomeId: null, seed: i })[2])
    }
    expect([...seen].sort()).toEqual(['field', 'lair', 'pairs'])
    expect(floorMapsFor(data, { floor: 2, biomeId: 'lair', seed: 1 })).toEqual(['lair', 'lair'])
  })

  it('các trận dùng seed khác nhau (không lặp đúng một trận)', () => {
    const results = [1, 2, 3].map((seed) => sweepFloor(data, options({ battles: 1, seed })))
    const keys = new Set(results.map((r) => `${r.totalTurns}:${r.avgMoney}`))
    expect(keys.size).toBeGreaterThan(1)
  })

  it('0 trận: mọi số đếm và trung bình bằng 0', () => {
    const result = sweepFloor(data, options({ battles: 0, kind: 'boss' }))
    expect(result).toMatchObject({
      battles: 0,
      played: 0,
      won: 0,
      lost: 0,
      timeout: 0,
      totalTurns: 0
    })
    expect(result.avgMoney).toEqual(0)
  })

  it('dừng sớm: đủ minBattles trận và khoảng tin cậy đủ hẹp thì không đánh tiếp', () => {
    const earlyStop = { minBattles: 5, ciWidth: 0.5 }
    const result = sweepFloor(data, options({ battles: 40, earlyStop }))
    expect(result.played).toBeGreaterThanOrEqual(5)
    expect(result.played).toBeLessThan(40)
    expect(result.won + result.lost + result.timeout).toBe(result.played)
    expect(shouldStopEarly(result.won, result.played, earlyStop)).toBe(true)
    // Trận đầu tiên giống hệt khi không dừng sớm (cùng seed từng trận).
    const full = sweepFloor(data, options({ battles: result.played }))
    expect({ ...result, battles: result.played }).toEqual(full)
  })

  it('khoảng tin cậy không bao giờ đủ hẹp thì đánh đủ số trận', () => {
    const result = sweepFloor(data, options({ earlyStop: { minBattles: 1, ciWidth: 1e-9 } }))
    expect(result.played).toBe(5)
  })

  it('trận boss đếm theo bossMultiplier (tổng khớp số trận); trận quái hoang không đếm', () => {
    const boss = sweepFloor(data, options({ kind: 'boss', battles: 8 }))
    const buckets = Object.entries(boss.byBossMultiplier)
    expect(buckets.length).toBeGreaterThan(0)
    for (const [multiplier, bucket] of buckets) {
      expect(Number(multiplier)).toBeGreaterThanOrEqual(2)
      expect(bucket.won).toBeLessThanOrEqual(bucket.played)
    }
    expect(buckets.reduce((sum, [, bucket]) => sum + bucket.played, 0)).toBe(boss.played)
    expect(buckets.reduce((sum, [, bucket]) => sum + bucket.won, 0)).toBe(boss.won)
    expect(sweepFloor(data, options()).byBossMultiplier).toEqual({})
  })

  it('đếm theo môi trường tự nhiên: mỗi lớp đếm mọi trận (biome bỏ trống = mặc định)', () => {
    const result = sweepFloor(data, options())
    expect(result.byNaturalField).toMatchObject({
      'weather:clear': { played: result.played, won: result.won },
      'terrain:none': { played: result.played, won: result.won }
    })
  })

  it('trận trải đều theo giờ (mỗi trận +13 giờ): đếm theo thời khắc và mùa, mỗi lớp đủ mọi trận', () => {
    const result = sweepFloor(data, options({ battles: 24 }))
    const layerTotal = (layer: string): number =>
      Object.entries(result.byNaturalField)
        .filter(([key]) => key.startsWith(`${layer}:`))
        .reduce((sum, [, bucket]) => sum + bucket.played, 0)
    expect(layerTotal('dayPhase')).toBe(result.played)
    expect(layerTotal('season')).toBe(result.played)
    // 24 trận × 13 giờ: đủ 24 giờ trong ngày, nên đủ cả 4 thời khắc.
    for (const phase of ['dawn', 'day', 'dusk', 'night']) {
      expect(result.byNaturalField[`dayPhase:${phase}`]?.played ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('withLeadZCrystal', () => {
  const lead = (equipment: Monster['equipment'] = []): GameState =>
    makeGameState({
      seed: 1,
      party: [makeMonster({ id: 'a', skillIds: ['strike'], equipment }), makeMonster({ id: 'b' })]
    })

  it('có Vòng Z: quái đầu đội cầm crystal hợp skill; không có thì giữ nguyên', () => {
    const data = makeZMoveData()
    const none = lead()
    expect(withLeadZCrystal(data, none)).toBe(none)
    const ringed = { ...none, inventory: addItems(none.inventory, 'zRing', 1) }
    const after = withLeadZCrystal(data, ringed)
    expect(after.party[0].equipment).toEqual([{ storage: 'stack', itemId: 'weaklingZCrystal' }])
    expect(after.party[1]).toBe(ringed.party[1])
  })

  it('hết ô: thay trang bị kém nhất', () => {
    const data = makeZMoveData()
    const gear = Array.from({ length: equipmentSlotCount(data, lead()) }, (_, i) => ({
      storage: 'instance' as const,
      instance: makeEquipment({ id: `e${i}`, rarity: i === 0 ? 'common' : 'rare' })
    }))
    const full = lead(gear)
    const ringed = { ...full, inventory: addItems(full.inventory, 'zRing', 1) }
    const equipment = withLeadZCrystal(data, ringed).party[0].equipment
    expect(equipment).toHaveLength(gear.length)
    expect(equipment.at(-1)).toEqual({ storage: 'stack', itemId: 'weaklingZCrystal' })
    expect(
      equipment.some((entry) => entry.storage === 'instance' && entry.instance.id === 'e0')
    ).toBe(false)
  })
})

describe('withAssumedPolarity (biến thể assumedPolarity)', () => {
  it('mọi quái mang cực với trait cực tính đầu pool', () => {
    const party = withAssumedPolarity(
      data,
      [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })],
      'yang'
    )
    const polarity = { pole: 'yang', traitId: data.config.polarity.traitIds.yang[0] }
    expect(party.map((monster) => monster.polarity)).toEqual([polarity, polarity])
  })
})

describe('withAssumedPurity (biến thể assumedPurity)', () => {
  it('quái thuộc nhóm mang huyết mạch chính là nhóm đầu của loài; loài không thuộc nhóm giữ nguyên', () => {
    const blood = makeBloodlineData()
    const nymph = makeMonster({ id: 'a', speciesId: 'nymph', baseSpeciesId: 'nymph' })
    const plain = makeMonster({ id: 'b' })
    const [withBlood, unchanged] = withAssumedPurity(blood, [nymph, plain], 50)
    expect(withBlood.bloodlines).toEqual([{ groupId: 'wyrm', purity: 50 }])
    expect(unchanged).toBe(plain)
  })
})
