// Cây thần: gacha trứng quái (docs/rules/gacha.md).

import type { TraitKind } from './content'

/** Một cách quay: số trứng nhận và giá tính bằng bao nhiêu lần giá một lần quay. */
export interface GachaPullOption {
  count: number
  costMultiplier: number
}

export interface GachaConfig {
  /** Giá một lần quay = costBase × costMultiplier × highestFloor. */
  costBase: number
  pullOptions: GachaPullOption[]
  /** Trọng số loài theo thứ hạng phẩm cấp loài (vượt danh sách lấy số cuối; 0 = không ra). */
  rankWeights: number[]
  /** Trọng số loại trait ở tầng 1 (như config.wild.traitKindWeights). */
  traitKindWeights: Partial<Record<TraitKind, number>>
  /** Trọng số loại trait nhân (1 + số × (highestFloor − 1)): loại càng lên tầng càng dễ ra. */
  traitKindFloorGrowth: Partial<Record<TraitKind, number>>
  /** Trọng số loại trait chia (1 + số × (highestFloor − 1)): loại càng lên tầng càng khó ra. */
  traitKindFloorFalloff: Partial<Record<TraitKind, number>>
}
