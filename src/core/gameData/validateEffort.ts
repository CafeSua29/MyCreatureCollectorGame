// Kiểm tra dữ liệu điểm nỗ lực (docs/rules/effort-values.md): config.effort, effortYield của loài.

import { STAT_NAMES, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const FIELDS = ['maxPerStat', 'maxTotal', 'percentPerPoint', 'derivedYield']

/** Bậc suy điểm: không rỗng, bậc đầu mốc 0 (loài nào cũng có bậc), mốc tăng dần ngặt. */
function checkDerivedYield(value: unknown, issues: string[]): void {
  const at = 'config.effort.derivedYield'
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${at} phải là danh sách không rỗng`)
    return
  }
  let previous = -Infinity
  value.forEach((entry: unknown, i) => {
    const tier = asObject(entry)
    const where = `${at}[${i}]`
    if (!tier) {
      issues.push(`${where} phải là object`)
      return
    }
    checkKnownFields(tier, ['minBaseStatTotal', 'points'], where, 'bậc', issues)
    issues.push(...checkInteger(tier.points, `${where}.points`, 0))
    issues.push(...checkNumber(tier.minBaseStatTotal, `${where}.minBaseStatTotal`, 0))
    const min = tier.minBaseStatTotal
    if (typeof min !== 'number') return
    if (i === 0 && min !== 0) issues.push(`${where}.minBaseStatTotal của bậc đầu phải là 0`)
    if (min <= previous) issues.push(`${where}.minBaseStatTotal phải tăng dần`)
    previous = min
  })
}

function checkEffortConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.effort)
  if (!config) {
    issues.push('config.effort phải là object')
    return
  }
  checkKnownFields(config, FIELDS, 'config.effort', 'config', issues)
  issues.push(...checkInteger(config.maxPerStat, 'config.effort.maxPerStat', 0))
  issues.push(...checkInteger(config.maxTotal, 'config.effort.maxTotal', 0))
  issues.push(...checkNumber(config.percentPerPoint, 'config.effort.percentPerPoint', 0))
  checkDerivedYield(config.derivedYield, issues)
}

/** effortYield (nếu có): object chỉ số → số nguyên ≥ 1, không rỗng. */
function checkSpeciesYields(data: GameData, issues: string[]): void {
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || species.effortYield === undefined) continue
    const where = `Loài "${species.id}": effortYield`
    const yields = asObject(species.effortYield)
    if (!yields || Object.keys(yields).length === 0) {
      issues.push(`${where} phải là object chỉ số → điểm, không rỗng`)
      continue
    }
    checkKnownFields(yields, STAT_NAMES, where, 'chỉ số', issues)
    for (const stat of STAT_NAMES) {
      if (yields[stat] !== undefined) {
        issues.push(...checkInteger(yields[stat], `${where}.${stat}`, 1))
      }
    }
  }
}

/** Kiểm tra mọi dữ liệu điểm nỗ lực. */
export function checkEffortData(data: GameData, issues: string[]): void {
  checkEffortConfig(data, issues)
  checkSpeciesYields(data, issues)
}
