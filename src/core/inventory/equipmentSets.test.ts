import { describe, expect, it } from 'vitest'
import { createRng } from '../shared'
import { defined, EQUIPMENT_TEST_SETS, makeEquipmentData, makeEquipmentSetData } from '../testing'
import type { EquipmentRarity } from '../model'
import { findEquipmentItem, isRandomEquipment, rollEquipment, rollSetPieceDrop } from './equipment'
import { pickSetPiece, rerollRolledSet, rollEquipmentSet, setPieceRarities } from './equipmentSets'

const data = makeEquipmentSetData()
const plain = makeEquipmentData()
const item = (id: string): ReturnType<typeof findEquipmentItem> & object =>
  defined(findEquipmentItem(data, id), id)
const ROLLED_IDS = ['guard', 'fatal', 'vampire', 'seal']

describe('rollEquipment: bộ trang bị', () => {
  it('món thường mọi bậc tung một bộ ngẫu nhiên có trọng số > 0 (không ra bộ vô hình weight 0)', () => {
    const rarities: EquipmentRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']
    for (const rarity of rarities) {
      for (let seed = 1; seed <= 20; seed++) {
        const [instance] = rollEquipment(data, createRng(seed), {
          itemId: 'sword',
          rarity,
          id: 'e1'
        })
        expect(ROLLED_IDS).toContain(instance.setId)
      }
    }
  })

  it('món unique không thuộc bộ đặt tên cũng tung bộ ngẫu nhiên', () => {
    const rolledOnly = makeEquipmentData((raw) => {
      raw.equipmentSets = EQUIPMENT_TEST_SETS.filter((set) => set.kind === 'rolled')
    })
    const [instance] = rollEquipment(rolledOnly, createRng(4), {
      itemId: 'stronglingCrown',
      rarity: 'unique',
      id: 'e1'
    })
    expect(instance.rarity).toBe('unique')
    expect(ROLLED_IDS).toContain(instance.setId)
  })

  it('tung bộ sau cùng: các dòng giống hệt khi dữ liệu không có bộ (RNG phần trước không đổi)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const args = { itemId: 'sword', rarity: 'legendary' as const, id: 'e1' }
      const [withSet, rngWith] = rollEquipment(data, createRng(seed), args)
      const [withoutSet, rngWithout] = rollEquipment(plain, createRng(seed), args)
      expect(withSet.rolls).toEqual(withoutSet.rolls)
      expect(withoutSet.setId).toBeUndefined()
      // Có bộ thì tốn thêm RNG cho bộ (sau mọi dòng); không có bộ nào thì không tốn.
      expect(rngWith).not.toEqual(rngWithout)
      expect(rollEquipmentSet(plain, rngWithout, item('sword'))).toEqual([null, rngWithout])
    }
  })

  it('món bộ đặt tên luôn mang bộ đó và bậc của bộ, không tốn RNG cho bộ', () => {
    const [instance] = rollEquipment(data, createRng(3), {
      itemId: 'knightHelm',
      rarity: 'common',
      id: 'e1'
    })
    expect(instance.setId).toBe('knight')
    expect(instance.rarity).toBe('rare')
    expect(instance.rolls[0]).toEqual({ lineId: 'main', value: 5 })
  })

  it('món unique của bộ unique mang bộ đó, bậc unique', () => {
    const [instance] = rollEquipment(data, createRng(3), {
      itemId: 'stronglingCrown',
      rarity: 'unique',
      id: 'e1'
    })
    expect(instance).toMatchObject({ setId: 'crown', rarity: 'unique' })
  })

  it('món gốc ghi cố định bộ ngẫu nhiên: luôn bộ đó', () => {
    expect(rollEquipmentSet(data, createRng(1), item('guardShield'))).toEqual([
      'guard',
      createRng(1)
    ])
  })
})

describe('rerollRolledSet', () => {
  it('ra bộ khác bộ hiện tại', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const [setId] = rerollRolledSet(data, createRng(seed), 'guard')
      expect(setId).not.toBe('guard')
      expect(ROLLED_IDS).toContain(setId)
    }
  })

  it('chỉ có một bộ ngẫu nhiên: không đổi được (null), không tốn RNG', () => {
    const single = makeEquipmentSetData((raw) => {
      raw.equipmentSets = raw.equipmentSets.filter(
        (set) => set.kind === 'named' || set.id === 'guard'
      )
      raw.items = raw.items.filter((entry) => entry.id !== 'guardShield')
    })
    expect(rerollRolledSet(single, createRng(5), 'guard')).toEqual([null, createRng(5)])
  })
})

describe('món bộ đặt tên rơi thêm', () => {
  it('isRandomEquipment loại món bộ đặt tên (không bán / đúc / chợ đen), giữ món ghi bộ ngẫu nhiên', () => {
    expect(isRandomEquipment(data, item('knightHelm'))).toBe(false)
    expect(isRandomEquipment(data, item('guardShield'))).toBe(true)
    expect(isRandomEquipment(data, item('sword'))).toBe(true)
  })

  it('bảng bậc chỉ giữ bậc có bộ đặt tên thường', () => {
    expect(setPieceRarities(data, { common: 5, rare: 3, epic: 2, legendary: 0 })).toEqual({
      common: 5,
      rare: 3
    })
    expect(pickSetPiece(data, createRng(1), 'epic')).toEqual([null, createRng(1)])
  })

  it('tỉ lệ 100%: rơi món của bộ bậc vừa tung; 0%: không rơi', () => {
    const weights = { rare: 1 }
    for (let seed = 1; seed <= 10; seed++) {
      const [drop] = rollSetPieceDrop(data, createRng(seed), { chance: 100, weights, floor: 1 })
      expect(drop?.rarity).toBe('rare')
      expect(['knightHelm', 'knightPlate', 'knightBlade']).toContain(drop?.itemId)
    }
    expect(rollSetPieceDrop(data, createRng(1), { chance: 0, weights, floor: 1 })[0]).toBeNull()
  })

  it('không có bộ đặt tên thường: không rơi, không tốn RNG', () => {
    expect(
      rollSetPieceDrop(plain, createRng(1), { chance: 100, weights: { rare: 1 }, floor: 1 })
    ).toEqual([null, createRng(1)])
  })

  it('tầng cực lớn vẫn ra bậc hợp lệ', () => {
    const [drop] = rollSetPieceDrop(data, createRng(2), {
      chance: 100,
      weights: { common: 1, rare: 1 },
      floor: Number.MAX_SAFE_INTEGER
    })
    expect(['common', 'rare']).toContain(drop?.rarity)
  })
})
