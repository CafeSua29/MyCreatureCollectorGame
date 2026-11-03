// Độ khó (docs/rules/challenge-modes.md, simulation-features.md mục "Độ khó"): so các lần chơi liên
// tục cùng đội, cùng seed ở từng mức độ khó. Bảng difficulty.csv.

import { toBig } from '@core'
import type { ProgressionResult } from './progression'
import { formatDecimal, runLabel, stuckNote, type Table } from './report'

const HEADERS = [
  'team',
  'difficulty',
  'floorsCleared',
  'stuckAtFloor',
  'battles',
  'battlesPerFloor',
  'bossAttempts',
  'bossLosses',
  'losses',
  'endLevel',
  'battleMoney',
  'moneyPerBattle',
  'note'
]

const sum = (
  result: ProgressionResult,
  pick: (unlock: ProgressionResult['unlocks'][number]) => number
): number => result.unlocks.reduce((total, unlock) => total + pick(unlock), 0)

/** Một dòng mỗi lần chơi; lần Thường cùng chế độ đứng trước để so. */
export function difficultyTable(results: readonly ProgressionResult[]): Table {
  // Chỉ đội có lần chơi khác Thường, cùng chế độ đan / fuse với lần đó.
  const challenged = results.filter((result) => result.difficulty !== 'normal')
  const compared = results.filter((result) =>
    challenged.some(
      (other) =>
        other.teamId === result.teamId &&
        other.usePills === result.usePills &&
        other.growth === result.growth
    )
  )
  const rows = compared.map((result) => {
    const cleared = result.unlocks.length
    const money = toBig(result.battleMoney)
    return [
      runLabel({ ...result, difficulty: 'normal' }),
      result.difficulty,
      String(cleared),
      result.stuckAtFloor === null ? '' : String(result.stuckAtFloor),
      String(result.totalBattles),
      cleared > 0 ? (result.totalBattles / cleared).toFixed(1) : '-',
      String(sum(result, (unlock) => unlock.bossAttempts)),
      String(sum(result, (unlock) => unlock.bossLosses)),
      String(sum(result, (unlock) => unlock.losses)),
      cleared > 0 ? String(result.unlocks[cleared - 1].averageLevel) : '',
      formatDecimal(money),
      result.totalBattles > 0 ? formatDecimal(money.div(result.totalBattles)) : '-',
      result.stuckAtFloor === null ? '' : stuckNote(result)
    ]
  })
  return { headers: HEADERS, rows }
}
