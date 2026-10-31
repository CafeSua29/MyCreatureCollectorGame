// Dữ liệu test cho trang bị (mục "Trang bị và đồ cầm" ở equipment.md): trang bị gốc thường, món
// unique của boss fixture (strongling, race neutral), đồ cầm tiêu hao, dòng phụ, danh sách rơi. Không phụ thuộc
// dữ liệu thật (quy tắc 13). Fixture gốc (makeRawData) không có trang bị để test cũ không đổi RNG.

import { createGameData } from '../gameData'
import type {
  EquipmentAffixDef,
  EquipmentInstance,
  EquipmentRarity,
  EquippedItem,
  GameData,
  Item,
  RawGameData,
  ValueRange
} from '../model'
import { makeRawData, withFixtureText } from './fixtures'

const fixed = (value: number): ValueRange => ({ min: value, max: value })

/** Khoảng cố định theo bậc thường: common 10, uncommon 20, rare 30, epic 40, legendary 50. */
const NORMAL_RANGES: Partial<Record<EquipmentRarity, ValueRange>> = {
  common: fixed(10),
  uncommon: fixed(20),
  rare: fixed(30),
  epic: fixed(40),
  legendary: fixed(50)
}

/** Trang bị gốc mẫu. */
export const EQUIPMENT_TEST_ITEMS: Item[] = [
  {
    // Kiếm: +công % (dòng chính cố định theo bậc để test tính được), bán ở cửa hàng.
    id: 'sword',
    category: 'equipment',
    price: 100,
    shop: true,
    shopWeight: 1000,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.attack',
      ranges: NORMAL_RANGES,
      tags: ['stat']
    }
  },
  {
    // Gậy: trạng thái do quái mang gây ra +turns lượt.
    id: 'staff',
    category: 'equipment',
    price: 200,
    mainLine: {
      hook: { type: 'statusDurationBonus', params: {} },
      valueParam: 'turns',
      ranges: {
        common: fixed(1),
        uncommon: fixed(1),
        rare: fixed(2),
        epic: fixed(2),
        legendary: fixed(3)
      }
    }
  },
  {
    // Vuốt nhanh: % đi trước cùng mức priority (kiểu Quick Claw).
    id: 'quickClaw',
    category: 'equipment',
    price: 100,
    mainLine: {
      hook: { type: 'actFirstChance', params: {} },
      valueParam: 'chance',
      ranges: {
        common: fixed(100),
        uncommon: fixed(100),
        rare: fixed(100),
        epic: fixed(100),
        legendary: fixed(100)
      }
    }
  },
  {
    // Món unique của boss strongling: +hp %, dòng unique +tốc độ %, AI ưu tiên skill gây trạng thái.
    id: 'stronglingCrown',
    category: 'equipment',
    price: 1000,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.hp',
      ranges: { unique: { min: 10, max: 20 } }
    },
    unique: {
      bossSpeciesId: 'strongling',
      lines: [
        {
          id: 'crownSpeed',
          hook: { type: 'statModifier', params: {} },
          valueParam: 'percent.speed',
          ranges: { unique: fixed(25) }
        }
      ],
      aiHints: [{ effectType: 'applyStatus', multiplier: 100 }]
    }
  },
  {
    // Món unique thứ hai của strongling (pool 2 món).
    id: 'stronglingRing',
    category: 'equipment',
    price: 1000,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: 'percent.defense',
      ranges: { unique: fixed(30) }
    },
    unique: {
      bossSpeciesId: 'strongling',
      lines: [
        {
          id: 'ringAttack',
          hook: { type: 'statModifier', params: {} },
          valueParam: 'percent.attack',
          ranges: { unique: fixed(5) }
        }
      ]
    }
  }
]

/** Đồ cầm tiêu hao mẫu (kiểu Pokémon), mỗi món một lúc kích hoạt (`heldUse`). */
export const HELD_TEST_ITEMS: Item[] = [
  {
    // Sitrus Berry: bị đánh còn ≤ 50% máu thì hồi 25% max HP.
    id: 'sitrusBerry',
    category: 'held',
    price: 50,
    tags: ['berry'],
    hooks: [
      {
        type: 'trigger',
        params: {
          on: 'damaged',
          scope: 'self',
          when: [{ if: 'hpBelow', who: 'self', percent: 50 }],
          effects: [{ do: 'heal', to: 'self', amount: { hp: 'max', of: 'self', percent: 25 } }]
        }
      }
    ]
  },
  {
    // Focus Sash: đầy máu thì trụ lại 1 máu trước đòn đủ hạ gục.
    id: 'focusSash',
    category: 'held',
    price: 100,
    hooks: [{ type: 'surviveLethal', params: { fromFullHp: true } }]
  },
  {
    // Gem hệ thường: đòn hệ thường +30%.
    id: 'normalGem',
    category: 'held',
    price: 50,
    hooks: [{ type: 'elementDamageDealt', params: { elementIds: ['normal'], percent: 30 } }]
  },
  {
    // Berry kháng lửa: đòn lửa khắc hệ −50%.
    id: 'occaBerry',
    category: 'held',
    price: 50,
    tags: ['berry'],
    hooks: [
      {
        type: 'effectivenessModifier',
        params: { side: 'taken', when: 'superEffective', percent: -50, elementIds: ['fire'] }
      }
    ]
  },
  {
    // Custap Berry: máu ≤ 25% thì đi trước cùng mức priority.
    id: 'custapBerry',
    category: 'held',
    price: 50,
    tags: ['berry'],
    hooks: [{ type: 'actFirstChance', params: { chance: 100, hpBelowPercent: 25 } }]
  },
  {
    // Air Balloon: bay tới khi bị đánh trúng.
    id: 'airBalloon',
    category: 'held',
    price: 50,
    hooks: [{ type: 'airborne', params: {} }]
  }
]

/** Dòng phụ mẫu: mỗi bậc ra được cả hai dòng. */
export const EQUIPMENT_TEST_AFFIXES: EquipmentAffixDef[] = [
  {
    id: 'affixDefense',
    weight: 1,
    hook: { type: 'statModifier', params: {} },
    valueParam: 'percent.defense',
    ranges: { ...NORMAL_RANGES, unique: fixed(60) }
  },
  {
    id: 'affixSpeed',
    weight: 1,
    hook: { type: 'statModifier', params: {} },
    valueParam: 'percent.speed',
    ranges: { ...NORMAL_RANGES, unique: fixed(60) }
  }
]

/** Thêm trang bị mẫu, dòng phụ và danh sách rơi (kiếm) cho mọi map của fixture. */
export function withEquipmentFixtures(raw: RawGameData): RawGameData {
  return withFixtureText({
    ...raw,
    items: [...raw.items, ...EQUIPMENT_TEST_ITEMS, ...HELD_TEST_ITEMS],
    equipmentAffixes: [...raw.equipmentAffixes, ...EQUIPMENT_TEST_AFFIXES],
    biomes: raw.biomes.map((biome) => ({
      ...biome,
      equipmentDrops: [{ itemId: 'sword', weight: 1 }]
    }))
  })
}

/** GameData fixture có trang bị; `edit` sửa raw trước khi kiểm tra. */
export function makeEquipmentData(edit: (raw: RawGameData) => void = () => {}): GameData {
  const raw = withEquipmentFixtures(makeRawData())
  edit(raw)
  return createGameData(withFixtureText(raw))
}

/** Món trang bị mẫu: dòng chính "main" với giá trị cho trước, không dòng phụ. */
export function makeEquipment(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    id: 'e1',
    baseItemId: 'sword',
    rarity: 'common',
    level: 1,
    rolls: [{ lineId: 'main', value: 10 }],
    ...overrides
  }
}

/** Đồ cầm đang lắp. */
export const held = (itemId: string): EquippedItem => ({ storage: 'stack', itemId })

/** Món đang lắp từ một món trang bị. */
export const equipped = (instance: EquipmentInstance): EquippedItem => ({
  storage: 'instance',
  instance
})
