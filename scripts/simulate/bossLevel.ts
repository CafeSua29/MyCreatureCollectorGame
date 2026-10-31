// Tìm level cần để thắng boss tầng (mục "Tìm level cần để thắng boss" ở simulation.md): với một
// đội ở một tầng, mọi quái dùng chung levelOffset thử nghiệm, đánh trận boss qua sweepFloor và tìm
// nhị phân offset nhỏ nhất đạt từng mục tiêu tỉ lệ thắng.

import { floorBossLevel, type GameData } from '@core'
import type { BattleTotals } from './battleRunner'
import { sweepFloor, type FloorResult, type FloorSweepOptions } from './floorSweep'
import { findMinOffset, memoizeByOffset } from './levelSearch'
import type { BossLevelSearchSpec, TeamSpec } from './scenarios'

export interface BossLevelRow {
  teamId: string
  floor: number
  /** Mục tiêu tỉ lệ thắng (%). */
  target: number
  /** Offset nhỏ nhất đạt mục tiêu; null = không đạt trong [0, maxOffset]. */
  offset: number | null
  maxOffset: number
  /** Level của đội ở offset đó (level boss tầng + offset, tối thiểu 1); null khi không đạt. */
  level: number | null
  /** Kết quả đo ở offset tìm được (không đạt thì ở maxOffset). */
  measured: FloorResult
}

export interface BossLevelOptions extends Omit<
  FloorSweepOptions,
  'team' | 'kind' | 'battles' | 'floor'
> {
  team: TeamSpec
  floor: number
  spec: BossLevelSearchSpec
}

export interface BossLevelSearchResult {
  /** Một dòng cho mỗi mục tiêu của spec, theo thứ tự khai báo. */
  rows: BossLevelRow[]
  /** Tổng mọi trận boss đã đánh ở mọi offset đã đo. */
  totals: BattleTotals
}

export function searchBossLevel(data: GameData, options: BossLevelOptions): BossLevelSearchResult {
  const { team, floor, spec } = options
  const totals: BattleTotals = { battles: 0, turns: 0, timeouts: 0 }
  const measure = memoizeByOffset((offset) => {
    const members = team.members.map((member) => ({ ...member, levelOffset: offset }))
    const result = sweepFloor(data, {
      ...options,
      team: { ...team, members },
      kind: 'boss',
      battles: spec.battles
    })
    totals.battles += result.played
    totals.turns += result.totalTurns
    totals.timeouts += result.timeout
    return { offset, won: result.won, played: result.played, result }
  })
  const rows = spec.targets.map((target): BossLevelRow => {
    const found = findMinOffset(target / 100, spec.maxOffset, measure)
    const base = { teamId: team.id, floor, target, maxOffset: spec.maxOffset }
    if (!found)
      return { ...base, offset: null, level: null, measured: measure(spec.maxOffset).result }
    const level = Math.max(1, floorBossLevel(data, floor) + found.offset)
    return { ...base, offset: found.offset, level, measured: found.result }
  })
  return { rows, totals }
}
