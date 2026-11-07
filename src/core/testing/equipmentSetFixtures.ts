// Dữ liệu test cho bộ trang bị (docs/rules/equipment-sets.md): bộ ngẫu nhiên 2 / 4 món, bộ có Seal,
// bộ vô hình, bộ đặt tên bậc thường 2 / 3 món, bộ unique gom hai món unique của boss strongling, món
// giảm số món cần. Không phụ thuộc dữ liệu thật (quy tắc 13); fixture trang bị gốc không có bộ nên test
// cũ không đổi RNG.

import type {
  EquipmentInstance,
  EquipmentSetDef,
  GameData,
  Item,
  RawGameData,
  ValueRange
} from '../model'
import { makeEquipment, makeEquipmentData } from './equipmentFixtures'

const fixed = (value: number): ValueRange => ({ min: value, max: value })

/** Món gốc của bộ đặt tên (khoảng dòng chính chỉ bậc của bộ) và món giảm số món cần. */
export const EQUIPMENT_SET_TEST_ITEMS: Item[] = [
  ...['knightHelm', 'knightPlate', 'knightBlade'].map((id): Item => ({
    id,
    category: 'equipment',
    price: 100,
    setId: 'knight',
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.defense',
      ranges: { rare: fixed(5) }
    }
  })),
  ...['twinLeft', 'twinRight'].map((id): Item => ({
    id,
    category: 'equipment',
    price: 100,
    setId: 'twins',
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.speed',
      ranges: { common: fixed(5) }
    }
  })),
  {
    // Kiểu Ring of Royal Grandeur: bộ đặt tên ≥ 3 món cần ít hơn 1 món.
    id: 'signet',
    category: 'equipment',
    price: 100,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.hp',
      ranges: {
        common: fixed(1),
        uncommon: fixed(1),
        rare: fixed(1),
        epic: fixed(1),
        legendary: fixed(1)
      }
    },
    hooks: [{ type: 'setPieceReduction', params: { value: 1 } }]
  },
  {
    // Món thường ghi cố định bộ ngẫu nhiên guard (không tung bộ).
    id: 'guardShield',
    category: 'equipment',
    price: 100,
    setId: 'guard',
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.defense',
      ranges: {
        common: fixed(1),
        uncommon: fixed(1),
        rare: fixed(1),
        epic: fixed(1),
        legendary: fixed(1)
      }
    }
  }
]

/** Bộ mẫu: guard (2 món, +15% thủ), fatal (4 món, +35% công), vampire / seal / wild. */
export const EQUIPMENT_TEST_SETS: EquipmentSetDef[] = [
  {
    id: 'guard',
    kind: 'rolled',
    size: 2,
    weight: 1,
    hooks: [{ type: 'statModifier', params: { percent: { defense: 15 } } }]
  },
  {
    id: 'fatal',
    kind: 'rolled',
    size: 4,
    weight: 1,
    hooks: [{ type: 'statModifier', params: { percent: { attack: 35 } } }]
  },
  {
    id: 'vampire',
    kind: 'rolled',
    size: 2,
    weight: 1,
    sealable: true,
    hooks: [{ type: 'lifesteal', params: { percent: 35 } }]
  },
  { id: 'seal', kind: 'rolled', size: 2, weight: 1, seal: true, sealable: true, hooks: [] },
  { id: 'wild', kind: 'rolled', size: 2, weight: 0, wildcard: true, hooks: [] },
  {
    id: 'knight',
    kind: 'named',
    rarity: 'rare',
    pieceItemIds: ['knightHelm', 'knightPlate', 'knightBlade'],
    bonuses: [
      { pieces: 2, hooks: [{ type: 'statModifier', params: { percent: { attack: 10 } } }] },
      { pieces: 3, hooks: [{ type: 'statModifier', params: { percent: { speed: 20 } } }] }
    ]
  },
  {
    id: 'twins',
    kind: 'named',
    rarity: 'common',
    pieceItemIds: ['twinLeft', 'twinRight'],
    bonuses: [{ pieces: 2, hooks: [{ type: 'statModifier', params: { percent: { hp: 10 } } }] }]
  },
  {
    id: 'crown',
    kind: 'named',
    rarity: 'unique',
    pieceItemIds: ['stronglingCrown', 'stronglingRing'],
    bonuses: [{ pieces: 2, hooks: [{ type: 'critDamageModifier', params: { percent: 50 } }] }]
  }
]

/** Thêm bộ mẫu vào raw đã có fixture trang bị (món unique strongling ghi setId crown). */
export function withEquipmentSetFixtures(raw: RawGameData): void {
  raw.items = [
    ...raw.items.map((item) =>
      item.id === 'stronglingCrown' || item.id === 'stronglingRing'
        ? { ...item, setId: 'crown' }
        : item
    ),
    ...EQUIPMENT_SET_TEST_ITEMS
  ]
  raw.equipmentSets = [...raw.equipmentSets, ...EQUIPMENT_TEST_SETS]
}

/** GameData fixture có trang bị và bộ mẫu; `edit` sửa raw sau khi thêm bộ. */
export function makeEquipmentSetData(edit: (raw: RawGameData) => void = () => {}): GameData {
  return makeEquipmentData((raw) => {
    withEquipmentSetFixtures(raw)
    edit(raw)
  })
}

/** Món mẫu thuộc bộ `setId` (mặc định kiếm common thuộc bộ ngẫu nhiên). */
export function makeSetEquipment(
  setId: string,
  overrides: Partial<EquipmentInstance> = {}
): EquipmentInstance {
  return makeEquipment({ setId, ...overrides })
}
