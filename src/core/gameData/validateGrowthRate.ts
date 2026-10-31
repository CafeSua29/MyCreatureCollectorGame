// Kiểm tra nhóm tăng trưởng EXP của loài (docs/rules/growth-rates.md).

import { GROWTH_RATES, type GameData } from '../model'

/** growthRate (nếu có) phải là một trong 6 nhóm. */
export function checkGrowthRates(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || species.growthRate === undefined) continue
    if (!(GROWTH_RATES as readonly unknown[]).includes(species.growthRate)) {
      issues.push(
        `Loài "${species.id}": growthRate phải là ${GROWTH_RATES.join(' / ')}, nhận "${String(species.growthRate)}"`
      )
    }
  }
}
