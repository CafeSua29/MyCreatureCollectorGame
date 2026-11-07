// "Người chơi" với dấu ấn (mục "Dấu ấn" ở simulation-features.md, docs/rules/marks.md): dấu tự đến
// trong trận / ngoài trận qua action thật; ở thị trấn người chơi chữa sẹo / ám ảnh của đội mẫu ở Thầy
// thuốc khi giá ≤ treatBudgetFraction tiền lúc đó. Đo số dấu trung bình mỗi quái đội mẫu theo loại
// và % chỉ số trung bình (nguồn `marks`, chỉ số khác HP) của đội lúc đo.

import {
  NON_HP_STATS,
  computeStats,
  getMonsterView,
  type GameData,
  type GameState,
  type MarkKind
} from '@core'
import { simAct } from './events'

export const MARK_POLICY = {
  /** Chữa một dấu khi giá ≤ phần này của tiền đang có (không cạn tiền đột phá / fuse). */
  treatBudgetFraction: 0.05,
  /** Loại dấu người chơi chữa (dấu xấu; đột biến hai mặt giữ lại). */
  treatKinds: ['scar', 'trauma'] as readonly MarkKind[]
} as const

/** Số đo dấu ấn của đội mẫu ở một lần về thị trấn. */
export interface MarkTally {
  /** Số quái đội mẫu đã đo. */
  monsters: number
  /** Tổng số dấu theo loại trên đội mẫu. */
  byKind: Record<MarkKind, number>
  /** Tổng % chỉ số (trung bình các chỉ số khác HP) từ dấu, cộng trên các quái. */
  statPercent: number
}

/** Chữa sẹo / ám ảnh của đội mẫu khi rẻ; trả về state và số lần chữa. */
export function treatTeamMarks(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; treated: number } {
  let treated = 0
  for (const monster of state.party) {
    if (!teamIds.has(monster.id)) continue
    for (const mark of getMonsterView(data, state, monster.id)?.marks ?? []) {
      if (!MARK_POLICY.treatKinds.includes(mark.kind) || mark.treatCost === null) continue
      if (mark.treatCost.gt(state.money.times(MARK_POLICY.treatBudgetFraction))) continue
      state = simAct(data, state, {
        type: 'treatMark',
        monsterId: monster.id,
        markId: mark.markId,
        ...(mark.targetId === undefined ? {} : { targetId: mark.targetId })
      })
      treated++
    }
  }
  return { state, treated }
}

/** Đo dấu ấn của đội mẫu đang ở đội. */
export function tallyTeamMarks(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): MarkTally {
  const tally: MarkTally = {
    monsters: 0,
    byKind: { scar: 0, mutation: 0, adaptation: 0, trauma: 0, trophy: 0 },
    statPercent: 0
  }
  for (const monster of state.party) {
    if (!teamIds.has(monster.id)) continue
    tally.monsters++
    for (const mark of getMonsterView(data, state, monster.id)?.marks ?? []) {
      tally.byKind[mark.kind]++
    }
    const percents = computeStats(data, monster).percentBySource.marks
    tally.statPercent +=
      NON_HP_STATS.reduce((sum, stat) => sum + percents[stat], 0) / NON_HP_STATS.length
  }
  return tally
}
