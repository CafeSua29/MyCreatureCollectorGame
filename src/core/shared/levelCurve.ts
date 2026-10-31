// Đường cong cấp đa thức dùng chung (quy tắc 7: không dùng hàm mũ): tổng exp để đạt cấp L là
// ⌈base × (L − 1)^power⌉; cấp tính ngược từ tổng exp. Dùng cho thuần thục skill (skill-mastery.md)
// và luyện đan (alchemy.md); thêm hệ cấp mới theo exp thì dùng lại, không viết bản thứ hai.

import { DataError } from './errors'
import { toBig, type Decimal } from './big'

export interface LevelCurve {
  base: number
  power: number
}

/** Tổng exp cần để đạt `level` (cấp 1 = 0). */
export function curveExpForLevel(curve: LevelCurve, level: number): Decimal {
  return toBig(level - 1)
    .pow(curve.power)
    .times(curve.base)
    .ceil()
}

/**
 * Cấp cao nhất có curveExpForLevel(cấp) ≤ exp, tối thiểu 1. Cấp giữ kiểu number như level quái
 * (big-numbers.md): vượt số nguyên an toàn thì là dữ liệu hỏng, ném DataError (`label` vào câu lỗi).
 */
export function curveLevelFromExp(curve: LevelCurve, exp: Decimal, label: string): number {
  if (exp.lte(0)) return 1
  const root = exp
    .div(curve.base)
    .pow(1 / curve.power)
    .floor()
    .plus(1)
  if (root.gt(Number.MAX_SAFE_INTEGER)) {
    throw new DataError([`Exp ${label} ${exp.toString()} cho cấp vượt số nguyên an toàn`])
  }
  let level = root.toNumber()
  // Sửa sai số làm tròn của pow ở chữ số cuối.
  while (curveExpForLevel(curve, level + 1).lte(exp)) level++
  while (level > 1 && curveExpForLevel(curve, level).gt(exp)) level--
  return level
}
