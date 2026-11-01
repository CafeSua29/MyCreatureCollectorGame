// Phẩm cấp tư chất (docs/rules/aptitude.md): nhãn cho biết gen của quái tốt cỡ nào so với gen tối đa
// của quái hoang ở tầng mốc. Không lưu, tính khi cần, không đổi chỉ số.
// Đặt ở registries (không ở world/) để điều kiện tiến hóa `aptitude` dùng được; hệ số gen theo tầng
// cũng ở đây vì world/ (sinh quái) và tư chất dùng chung một công thức.

import { BIG_ZERO, floorBig, toBig, type Decimal } from '../shared'
import {
  STAT_NAMES,
  type AptitudeTierDef,
  type GameData,
  type GameState,
  type Monster
} from '../model'
import { highestTierIndex } from './thresholdTiers'

/** Hệ số nhân khoảng gen quái hoang của tầng: geneGrowthPerFloor^(N − 1). */
export function floorGeneMultiplier(data: GameData, floor: number): Decimal {
  return toBig(data.config.floors.geneGrowthPerFloor).pow(floor - 1)
}

/**
 * Tầng cao nhất từng đạt (mở khóa vĩnh viễn: tư chất, mức bất ổn tối đa). Khi có phi thăng
 * (ascension.md) đổi thành `bestFloor` ở đây, nơi khác không phải sửa.
 */
export function bestFloorReached(state: Pick<GameState, 'highestFloor'>): number {
  return state.highestFloor
}

/** Tầng mốc để chấm tư chất: tầng cao nhất từng đạt. */
export const aptitudeFloor = bestFloorReached

/** Tổng gen tối đa của quái hoang ở tầng (mỗi chỉ số floor(geneMax × hệ số gen của tầng)). */
export function wildGeneMaxTotal(data: GameData, floor: number): Decimal {
  const perStat = floorBig(floorGeneMultiplier(data, floor).times(data.config.wild.geneMax))
  return perStat.times(STAT_NAMES.length)
}

export interface Aptitude {
  /** Tổng gen ÷ tổng gen tối đa của quái hoang ở tầng mốc. */
  ratio: Decimal
  tier: AptitudeTierDef
}

/** Bậc của một tỉ lệ: bậc cao nhất có `from` ≤ tỉ lệ (dữ liệu bảo đảm bậc đầu từ 0). */
function tierOfRatio(data: GameData, ratio: Decimal): AptitudeTierDef {
  const tiers = Object.values(data.aptitudeTiers)
  return tiers[highestTierIndex(tiers, (from) => ratio.gte(from))]
}

/** Tư chất của quái so với tầng mốc `floor` (thường là aptitudeFloor(state)). */
export function aptitudeOf(
  data: GameData,
  monster: Pick<Monster, 'genes'>,
  floor: number
): Aptitude {
  const geneTotal = STAT_NAMES.reduce((sum, stat) => sum.plus(monster.genes[stat]), BIG_ZERO)
  const ratio = geneTotal.div(wildGeneMaxTotal(data, floor))
  return { ratio, tier: tierOfRatio(data, ratio) }
}

/** Thứ hạng của bậc (0 = thấp nhất); −1 nếu id không phải bậc tư chất. */
export function aptitudeTierRank(data: GameData, tierId: string): number {
  return Object.keys(data.aptitudeTiers).indexOf(tierId)
}

/** Quái đạt ít nhất bậc `minTierId` (điều kiện tiến hóa, lọc danh sách quái). */
export function hasAptitudeAtLeast(
  data: GameData,
  monster: Pick<Monster, 'genes'>,
  { floor, minTierId }: { floor: number; minTierId: string }
): boolean {
  const rank = aptitudeTierRank(data, aptitudeOf(data, monster, floor).tier.id)
  return rank >= aptitudeTierRank(data, minTierId)
}
