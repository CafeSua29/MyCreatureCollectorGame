// Luyện thể (docs/rules/body-refinement.md, theo Transform body của Portals of Phereon): mỗi bộ phận
// của quái (hit-locations.md) lắp một kiểu luyện thể; kiểu cho hook trait và nhãn, đủ số bộ phận cùng
// nhãn thì có thưởng bộ. Dữ liệu src/data/bodyRefinements.json (tên ở i18n `bodyRefinements`), số ở
// balance.json khóa `bodyRefinement`.

import type { TraitHookDef } from './content'

/** Một kiểu luyện thể của một bộ phận. */
export interface BodyRefinementDef {
  id: string
  /** Bộ phận lắp được (id trong bodyParts.json). */
  partId: string
  /** Nhãn của gốc (thủy sinh, dung nham, bóng tối, bay, thực vật...): đếm cho thưởng bộ. */
  tags: string[]
  /** Hook như trait cấp 1 khi đang lắp. */
  hooks: TraitHookDef[]
  /** Hệ số giá so với giá gốc (config.bodyRefinement.costPerLevel), > 0. */
  costMultiplier: number
}

/** Thưởng khi có đủ `count` bộ phận đang lắp mang cùng nhãn `tag` (bậc cao nhất đạt được, như cộng hưởng). */
export interface RefinementTagBonus {
  tag: string
  count: number
  hooks: TraitHookDef[]
}

export interface BodyRefinementConfig {
  /** Giá luyện một bộ phận = costPerLevel × level × costMultiplier của kiểu. */
  costPerLevel: number
  /** Gỡ kiểu đang lắp: % giá luyện của kiểu đó. */
  removeCostPercent: number
  tagBonuses: RefinementTagBonus[]
}
