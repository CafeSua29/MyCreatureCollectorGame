// Dữ liệu test cho hồn phách / hồn khí (docs/rules/soul-relics.md): món gốc hồn khí cho mọi chỉ số
// (dòng chính cố định theo bậc để test tính được), config. Nằm trong fixture gốc (makeRawData) vì
// kiểm tra dữ liệu bắt buộc mỗi chỉ số có một món gốc; món gốc hồn khí không bao giờ được tung ngẫu
// nhiên nên không đổi RNG của test cũ.

import {
  STAT_NAMES,
  type EquipmentRarity,
  type Item,
  type SoulRelicConfig,
  type StatName,
  type ValueRange
} from '../model'

const fixed = (value: number): ValueRange => ({ min: value, max: value })

/** Khoảng dòng chính theo bậc: common 5 … unique 30. */
const SOUL_RELIC_RANGES: Record<EquipmentRarity, ValueRange> = {
  common: fixed(5),
  uncommon: fixed(10),
  rare: fixed(15),
  epic: fixed(20),
  legendary: fixed(25),
  unique: fixed(30)
}

/** Id món gốc hồn khí của chỉ số (ví dụ soulRelic_attack). */
export const soulRelicItemId = (stat: StatName): string => `soulRelic_${stat}`

/** Món gốc hồn khí mẫu, mỗi chỉ số một món (bản mới mỗi lần gọi: test được sửa raw). */
export const soulRelicTestItems = (): Item[] =>
  STAT_NAMES.map((stat) => ({
    id: soulRelicItemId(stat),
    category: 'equipment',
    price: 100,
    soulRelicStat: stat,
    mainLine: {
      hook: { type: 'statModifier', params: {} },
      valueParam: `percent.${stat}`,
      ranges: { ...SOUL_RELIC_RANGES },
      tags: ['stat']
    }
  }))

/** Config hồn khí mẫu: bậc theo tư chất như dữ liệu thật (bản mới mỗi lần gọi). */
export const soulRelicTestConfig = (): SoulRelicConfig => ({
  forgeCostPerLevel: 10,
  rarityByAptitude: {
    mortal: 'common',
    good: 'uncommon',
    superior: 'rare',
    refined: 'epic',
    heavenly: 'legendary',
    divine: 'unique'
  }
})
