// Nhóm tăng trưởng EXP theo loài (docs/rules/growth-rates.md), như 6 nhóm của Pokémon: tổng EXP để
// đạt level n theo đúng công thức gốc tới level 100. Sau level 100 (gốc không có) mỗi nhóm giữ tỉ
// lệ so với n³ tại level 100: EXP(n) = ⌊EXP(100) × n³ / 100³⌋, nên vẫn là đa thức bậc 3 (quy tắc 7)
// và nhóm chậm vẫn chậm hơn nhóm nhanh ở mọi level.

import { DataError, toBig, type Decimal } from '../shared'
import {
  DEFAULT_GROWTH_RATE,
  GROWTH_RATES,
  type GameData,
  type GrowthRate,
  type Monster
} from '../model'
import { getBaseSpecies } from './validateMonster'

/** Level cuối của công thức gốc; sau đó nối bằng tỉ lệ n³. */
const SOURCE_MAX_LEVEL = 100

/** Công thức gốc cho level 1..100 (số thực; chỗ gọi làm tròn xuống, kẹp ≥ 0). */
const SOURCE_FORMULAS: Readonly<Record<GrowthRate, (n: number) => number>> = {
  erratic(n) {
    if (n < 50) return (n ** 3 * (100 - n)) / 50
    if (n < 68) return (n ** 3 * (150 - n)) / 100
    if (n < 98) return (n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500
    return (n ** 3 * (160 - n)) / 100
  },
  fast: (n) => (4 * n ** 3) / 5,
  mediumFast: (n) => n ** 3,
  mediumSlow: (n) => (6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140,
  slow: (n) => (5 * n ** 3) / 4,
  fluctuating(n) {
    if (n < 15) return (n ** 3 * (Math.floor((n + 1) / 3) + 24)) / 50
    if (n < 36) return (n ** 3 * (n + 14)) / 50
    return (n ** 3 * (Math.floor(n / 2) + 32)) / 50
  }
}

/** EXP theo công thức gốc ở level 1..100: làm tròn xuống, không âm (Medium Slow level 1 âm). */
const sourceExp = (rate: GrowthRate, level: number): Decimal =>
  toBig(Math.max(0, Math.floor(SOURCE_FORMULAS[rate](level))))

/** EXP tại level 100 của từng nhóm (mốc nối đường cong sau level 100). */
const EXP_AT_SOURCE_MAX: Readonly<Record<GrowthRate, Decimal>> = Object.fromEntries(
  GROWTH_RATES.map((rate) => [rate, sourceExp(rate, SOURCE_MAX_LEVEL)])
) as Record<GrowthRate, Decimal>

/** Tổng EXP để đạt `level` của nhóm tăng trưởng `rate`. */
export function expForLevel(level: number, rate: GrowthRate): Decimal {
  if (level <= SOURCE_MAX_LEVEL) return sourceExp(rate, Math.max(1, level))
  return EXP_AT_SOURCE_MAX[rate]
    .times(toBig(level).pow(3))
    .div(SOURCE_MAX_LEVEL ** 3)
    .floor()
}

/**
 * Level cao nhất có expForLevel(level, rate) ≤ exp, tối thiểu 1. Level giữ kiểu number
 * (docs/rules/big-numbers.md): vượt số nguyên an toàn thì là dữ liệu hỏng, ném DataError.
 */
export function levelFromExp(exp: Decimal, rate: GrowthRate): number {
  if (exp.lt(expForLevel(SOURCE_MAX_LEVEL + 1, rate))) {
    // Công thức gốc tăng dần theo level ở mọi nhóm (test kiểm tra): tìm tuần tự, tối đa 100 bước.
    let level = 1
    while (level < SOURCE_MAX_LEVEL + 1 && expForLevel(level + 1, rate).lte(exp)) level++
    return level
  }
  const ratio = toBig(SOURCE_MAX_LEVEL ** 3).div(EXP_AT_SOURCE_MAX[rate])
  const root = exp.times(ratio).cbrt().floor()
  if (root.gt(Number.MAX_SAFE_INTEGER)) {
    throw new DataError([`EXP ${exp.toString()} cho level vượt số nguyên an toàn`])
  }
  let level = Math.max(SOURCE_MAX_LEVEL + 1, root.toNumber())
  // Sửa sai số làm tròn của cbrt ở chữ số cuối.
  while (expForLevel(level + 1, rate).lte(exp)) level++
  while (level > SOURCE_MAX_LEVEL + 1 && expForLevel(level, rate).gt(exp)) level--
  return level
}

/** Nhóm tăng trưởng của quái: theo loài gốc (quái fuse: loài gốc của nó), bỏ trống = Medium Fast. */
export function monsterGrowthRate(data: GameData, monster: Monster): GrowthRate {
  return getBaseSpecies(data, monster)?.growthRate ?? DEFAULT_GROWTH_RATE
}

/** Tổng EXP để quái đạt `level` theo nhóm tăng trưởng của nó. */
export const monsterExpForLevel = (data: GameData, monster: Monster, level: number): Decimal =>
  expForLevel(level, monsterGrowthRate(data, monster))
