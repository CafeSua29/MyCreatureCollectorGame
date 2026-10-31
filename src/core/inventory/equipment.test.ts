import { describe, expect, it } from 'vitest'
import { createRng, toBig } from '../shared'
import {
  defined,
  equipped,
  makeEquipment,
  makeEquipmentData,
  makeInventory,
  makeMonster,
  soulRelicItemId
} from '../testing'
import type { EquipmentItem } from '../model'
import {
  canWearEquipment,
  equipmentBasePrice,
  equipmentSlotCount,
  findEquipmentItem,
  findEquipmentLine,
  lineParams,
  requiredRaceId,
  returnEquipment,
  rollEquipment,
  rollRarity,
  uniquePoolOf
} from './equipment'

const data = makeEquipmentData()
const item = (id: string): EquipmentItem => defined(findEquipmentItem(data, id), id)

describe('equipmentSlotCount', () => {
  it('3 ô cơ bản, +1 ở mỗi mốc tầng 20, 50 rồi gấp đôi (100, 200, 400...)', () => {
    const slots = (highestFloor: number): number =>
      equipmentSlotCount(data, { highestFloor, tamer: { realm: 0 } })
    expect(slots(1)).toBe(3)
    expect(slots(19)).toBe(3)
    expect(slots(20)).toBe(4)
    expect(slots(49)).toBe(4)
    expect(slots(50)).toBe(5)
    expect(slots(99)).toBe(5)
    expect(slots(100)).toBe(6)
    expect(slots(200)).toBe(7)
    expect(slots(399)).toBe(7)
    expect(slots(400)).toBe(8)
  })

  it('tầng cực lớn: số ô hữu hạn, tăng kiểu log', () => {
    const slots = equipmentSlotCount(data, {
      highestFloor: Number.MAX_SAFE_INTEGER,
      tamer: { realm: 0 }
    })
    // 2^53 / 100 ≈ 2^46: mốc 100 · 2^k ≤ 2^53 với k ≤ 46 → 3 + 2 + 47.
    expect(slots).toBe(52)
  })

  it('không có mốc nào thì luôn bằng số ô cơ bản', () => {
    const none = makeEquipmentData((raw) => {
      raw.config.equipment = { ...raw.config.equipment, floorMilestones: [] }
    })
    expect(equipmentSlotCount(none, { highestFloor: 1_000_000, tamer: { realm: 0 } })).toBe(3)
  })

  it('mốc cảnh giới ngự thú sư 2, 5, 10 rồi gấp đôi cộng thêm ô (docs/rules/tamer.md)', () => {
    const slots = (realm: number): number =>
      equipmentSlotCount(data, { highestFloor: 1, tamer: { realm } })
    expect(slots(0)).toBe(3)
    expect(slots(1)).toBe(3)
    expect(slots(2)).toBe(4)
    expect(slots(5)).toBe(5)
    expect(slots(10)).toBe(6)
    expect(slots(19)).toBe(6)
    expect(slots(20)).toBe(7)
    expect(slots(40)).toBe(8)
    // Cộng dồn với mốc tầng.
    expect(equipmentSlotCount(data, { highestFloor: 50, tamer: { realm: 10 } })).toBe(8)
  })
})

describe('rollEquipment', () => {
  it('minRollPercent: dòng chỉ tung ở phần trên của khoảng (chợ đen, docs/rules/events.md)', () => {
    const wide = makeEquipmentData((raw) => {
      const sword = defined(
        raw.items.find((entry) => entry.id === 'sword'),
        'sword'
      )
      if (sword.category !== 'equipment') throw new Error('sword phải là trang bị')
      sword.mainLine.ranges = { ...sword.mainLine.ranges, rare: { min: 10, max: 20 } }
    })
    const values = (minRollPercent: number): number[] =>
      Array.from({ length: 40 }, (_, seed) => {
        const [instance] = rollEquipment(wide, createRng(seed + 1), {
          itemId: 'sword',
          rarity: 'rare',
          id: 'e1',
          minRollPercent
        })
        return defined(
          instance.rolls.find((roll) => roll.lineId === 'main'),
          'dòng chính'
        ).value
      })
    expect(Math.min(...values(50))).toBeGreaterThanOrEqual(15)
    expect(Math.min(...values(0))).toBeLessThan(15)
    expect(new Set(values(100))).toEqual(new Set([20]))
  })

  it('cấp 1, dòng chính theo khoảng của bậc, số dòng phụ theo bậc, không trùng dòng', () => {
    const [common] = rollEquipment(data, createRng(1), {
      itemId: 'sword',
      rarity: 'common',
      id: 'e1'
    })
    expect(common).toEqual({
      id: 'e1',
      baseItemId: 'sword',
      rarity: 'common',
      level: 1,
      rolls: [{ lineId: 'main', value: 10 }]
    })
    const [epic] = rollEquipment(data, createRng(1), { itemId: 'sword', rarity: 'epic', id: 'e2' })
    expect(epic.rolls[0]).toEqual({ lineId: 'main', value: 40 })
    expect(epic.rolls).toHaveLength(3)
    expect(new Set(epic.rolls.map((roll) => roll.lineId)).size).toBe(3)
  })

  it('legendary muốn 3 dòng phụ nhưng chỉ có 2 dòng: lấy hết', () => {
    const [legendary] = rollEquipment(data, createRng(5), {
      itemId: 'sword',
      rarity: 'legendary',
      id: 'e3'
    })
    expect(legendary.rolls.map((roll) => roll.lineId).sort()).toEqual([
      'affixDefense',
      'affixSpeed',
      'main'
    ])
  })

  it('món unique: dòng chính, dòng unique rồi dòng phụ; giá trị trong khoảng', () => {
    for (let seed = 0; seed < 30; seed++) {
      const [crown] = rollEquipment(data, createRng(seed), {
        itemId: 'stronglingCrown',
        rarity: 'unique',
        id: 'e9'
      })
      expect(crown.rolls[0].lineId).toBe('main')
      expect(crown.rolls[0].value).toBeGreaterThanOrEqual(10)
      expect(crown.rolls[0].value).toBeLessThanOrEqual(20)
      expect(crown.rolls[1]).toEqual({ lineId: 'crownSpeed', value: 25 })
      expect(crown.rolls).toHaveLength(4)
    }
  })

  it('tất định theo RNG; RNG đổi sau khi tung', () => {
    const rng = createRng(77)
    const first = rollEquipment(data, rng, {
      itemId: 'stronglingCrown',
      rarity: 'unique',
      id: 'e1'
    })
    const second = rollEquipment(data, rng, {
      itemId: 'stronglingCrown',
      rarity: 'unique',
      id: 'e1'
    })
    expect(second).toEqual(first)
    expect(first[1]).not.toBe(rng)
  })

  it('không phải trang bị hoặc bậc không có khoảng: ném lỗi', () => {
    expect(() =>
      rollEquipment(data, createRng(1), { itemId: 'potion', rarity: 'common', id: 'e1' })
    ).toThrow(/không phải trang bị/)
    expect(() =>
      rollEquipment(data, createRng(1), { itemId: 'sword', rarity: 'unique', id: 'e1' })
    ).toThrow(/không có khoảng/)
  })
})

describe('rollRarity', () => {
  it('chỉ ra bậc có trọng số > 0', () => {
    for (let seed = 0; seed < 50; seed++) {
      const [rarity] = rollRarity(data, createRng(seed), { rare: 1, common: 0 }, 1)
      expect(rarity).toBe('rare')
    }
  })

  it('tầng cao: bậc từ rare trở lên dễ ra hơn (× 1 + 0,1 × (tầng − 1))', () => {
    const count = (floor: number): number => {
      let rare = 0
      for (let seed = 0; seed < 2000; seed++) {
        if (rollRarity(data, createRng(seed), { common: 1, rare: 1 }, floor)[0] === 'rare') rare++
      }
      return rare
    }
    // Tầng 1: 50%; tầng 11: rare × 2 → 67%.
    expect(count(1)).toBeGreaterThan(900)
    expect(count(1)).toBeLessThan(1100)
    expect(count(11)).toBeGreaterThan(1250)
    expect(count(11)).toBeLessThan(1420)
  })
})

describe('dòng của món', () => {
  it('findEquipmentLine tra dòng chính, dòng unique, dòng phụ; không có thì null', () => {
    expect(findEquipmentLine(data, item('sword'), 'main')?.valueParam).toBe('percent.attack')
    expect(findEquipmentLine(data, item('stronglingCrown'), 'crownSpeed')?.valueParam).toBe(
      'percent.speed'
    )
    expect(findEquipmentLine(data, item('sword'), 'affixDefense')?.valueParam).toBe(
      'percent.defense'
    )
    expect(findEquipmentLine(data, item('sword'), 'crownSpeed')).toBeNull()
    expect(findEquipmentLine(data, item('sword'), 'ghost')).toBeNull()
  })

  it('dòng hồn chỉ có khi món mang phần hồn có trait: hook equipmentTrait, giá trị là cấp', () => {
    const base = item(soulRelicItemId('speed'))
    const soul = { speciesId: 'weakling', raceId: 'neutral', nickname: null, history: null }
    const line = findEquipmentLine(data, base, 'soul', { ...soul, traitId: 'fast' })
    expect(line?.hook).toEqual({ type: 'equipmentTrait', params: { traitId: 'fast' } })
    expect(lineParams(defined(line, 'dòng hồn'), 3)).toEqual({ traitId: 'fast', level: 3 })
    expect(findEquipmentLine(data, base, 'soul', { ...soul, traitId: null })).toBeNull()
    expect(findEquipmentLine(data, base, 'soul')).toBeNull()
  })

  it('lineParams ghi giá trị theo đường dẫn, giữ params mẫu, không sửa mẫu', () => {
    const line = {
      hook: { type: 'statModifier', params: { flat: { hp: 1 }, percent: { hp: 5 } } },
      valueParam: 'percent.attack'
    }
    expect(lineParams(line, 12)).toEqual({ flat: { hp: 1 }, percent: { hp: 5, attack: 12 } })
    expect(line.hook.params).toEqual({ flat: { hp: 1 }, percent: { hp: 5 } })
    expect(lineParams({ hook: { type: 'x', params: {} }, valueParam: 'turns' }, 2)).toEqual({
      turns: 2
    })
  })

  it('uniquePoolOf: món unique của loài boss theo thứ tự dữ liệu', () => {
    expect(uniquePoolOf(data, 'strongling').map((entry) => entry.id)).toEqual([
      'stronglingCrown',
      'stronglingRing'
    ])
    expect(uniquePoolOf(data, 'weakling')).toEqual([])
  })
})

describe('canWearEquipment', () => {
  it('món thường ai cũng lắp; món unique cần race của boss hoặc race đó trong lineage', () => {
    const crown = makeEquipment({ baseItemId: 'stronglingCrown', rarity: 'unique' })
    const brute = makeMonster({ speciesId: 'brawler', baseSpeciesId: 'brawler', raceId: 'brute' })
    expect(canWearEquipment(data, brute, makeEquipment())).toBe(true)
    expect(canWearEquipment(data, brute, crown)).toBe(false)
    expect(canWearEquipment(data, makeMonster(), crown)).toBe(true)
    const fusedBrute = makeMonster({
      speciesId: 'fused',
      baseSpeciesId: 'brawler',
      raceId: 'brute',
      fused: true,
      lineage: ['weakling']
    })
    expect(canWearEquipment(data, fusedBrute, crown)).toBe(true)
  })

  it('race của loài trong chuỗi tiến hóa cũng được (tiến hóa đổi race không tháo món)', () => {
    // strongling (dạng sau của weakling) đổi sang race brute: món của race brute lắp được cho weakling.
    const bruteLine = makeEquipmentData((raw) => {
      const strongling = raw.species.find((s) => s.id === 'strongling')
      if (strongling?.kind !== 'normal') throw new Error('fixture sai')
      strongling.raceId = 'brute'
    })
    const relic = makeEquipment({
      baseItemId: soulRelicItemId('attack'),
      soul: { speciesId: 'brawler', raceId: 'brute', nickname: null, traitId: null, history: null }
    })
    expect(canWearEquipment(bruteLine, makeMonster(), relic)).toBe(true)
    expect(canWearEquipment(data, makeMonster(), relic)).toBe(false)
  })

  it('hồn khí: race của quái đã chết (hoặc race đó trong lineage)', () => {
    const relic = makeEquipment({
      baseItemId: soulRelicItemId('attack'),
      soul: { speciesId: 'brawler', raceId: 'brute', nickname: null, traitId: null, history: null }
    })
    expect(requiredRaceId(data, relic)).toBe('brute')
    expect(requiredRaceId(data, makeEquipment())).toBeNull()
    const brute = makeMonster({ speciesId: 'brawler', baseSpeciesId: 'brawler', raceId: 'brute' })
    expect(canWearEquipment(data, brute, relic)).toBe(true)
    expect(canWearEquipment(data, makeMonster(), relic)).toBe(false)
    const fused = makeMonster({ fused: true, speciesId: 'fused', lineage: ['brawler'] })
    expect(canWearEquipment(data, fused, relic)).toBe(true)
  })
})

describe('giá và trả đồ về túi', () => {
  it('giá = price × hệ số bậc × tầng; tầng cực lớn vẫn hữu hạn', () => {
    expect(equipmentBasePrice(data, makeEquipment(), 1).toNumber()).toBe(100)
    expect(equipmentBasePrice(data, makeEquipment({ rarity: 'epic' }), 3).toNumber()).toBe(3000)
    const unique = makeEquipment({ baseItemId: 'stronglingCrown', rarity: 'unique' })
    expect(equipmentBasePrice(data, unique, 1).toNumber()).toBe(50_000)
    const huge = equipmentBasePrice(data, makeEquipment(), Number.MAX_SAFE_INTEGER)
    expect(huge.eq(toBig(Number.MAX_SAFE_INTEGER).times(100))).toBe(true)
  })

  it('returnEquipment: trang bị về phần món riêng, đồ gộp chồng về chồng theo id', () => {
    const sword = makeEquipment({ id: 'e5' })
    const monster = makeMonster({
      equipment: [equipped(sword), { storage: 'stack', itemId: 'potion' }]
    })
    const inventory = returnEquipment(makeInventory({ potion: 1 }), monster)
    expect(inventory).toEqual(makeInventory({ potion: 2 }, [], [sword]))
  })
})
