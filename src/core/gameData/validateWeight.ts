// Kiểm tra cân nặng (mục "Cân nặng" ở battle.md): `weightKg` của race / loài.

import type { GameData } from '../model'

/** Kiểm tra `weightKg` của race / loài (nếu có): số hữu hạn > 0. */
export function checkWeights(data: GameData, issues: string[]): void {
  const check = (value: unknown, where: string): void => {
    if (value === undefined) return
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      issues.push(`${where}: weightKg phải là số > 0, nhận ${String(value)}`)
    }
  }
  for (const race of Object.values(data.races)) check(race.weightKg, `Race "${race.id}"`)
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal') continue
    check(species.weightKg, `Loài "${species.id}"`)
    const height: unknown = species.heightM
    if (
      height !== undefined &&
      (typeof height !== 'number' || !Number.isFinite(height) || height <= 0)
    ) {
      issues.push(`Loài "${species.id}": heightM phải là số > 0, nhận ${String(height)}`)
    }
  }
}
