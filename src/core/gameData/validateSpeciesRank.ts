// Kiểm tra phẩm cấp loài (docs/rules/species-rank.md): speciesRanks.json, config.speciesRank,
// trường ghi đè `rank` của loài. Danh sách / id trùng đã kiểm ở indexById (createGameData).

import type { GameData } from '../model'
import { asObject, checkInteger } from '../shared'
import { checkKnownFields, checkThresholdTiers } from './checks'

function checkSpeciesRankConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.speciesRank)
  if (!config) {
    issues.push('config.speciesRank phải là object')
    return
  }
  const where = 'config.speciesRank'
  checkKnownFields(config, ['legendaryCatchRate', 'legendaryBonus'], where, 'config', issues)
  issues.push(...checkInteger(config.legendaryCatchRate, `${where}.legendaryCatchRate`, 0))
  issues.push(...checkInteger(config.legendaryBonus, `${where}.legendaryBonus`, 0))
}

/** Ghi đè `rank` của loài phải là id phẩm cấp. */
function checkSpeciesRankOverrides(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || species.rank === undefined) continue
    if (!Object.hasOwn(data.speciesRanks, species.rank)) {
      issues.push(`Loài "${species.id}": rank không phải phẩm cấp loài, nhận "${species.rank}"`)
    }
  }
}

/** Kiểm tra toàn bộ dữ liệu phẩm cấp loài. */
export function checkSpeciesRankData(data: GameData, issues: string[]): void {
  // Ít nhất một bậc, bậc đầu từ 0 (loài nào cũng có bậc), `from` tăng dần ngặt.
  checkThresholdTiers(
    Object.values(data.speciesRanks),
    { file: 'speciesRanks', label: 'phẩm cấp loài' },
    issues
  )
  checkSpeciesRankConfig(data, issues)
  checkSpeciesRankOverrides(data, issues)
}
