// "Người chơi" ghép sao ở NPC fusing (mục "Bậc sao" ở simulation-features.md, docs/rules/star-rank.md):
// quái bắt về dư (như hiến tế: hết dùng + nguyên liệu fuse ngoài số giữ lại) cùng chuỗi tiến hóa với
// quái đội mẫu thì ghép sao vào quái đó, quái ít bản trước. Chỉ làm khi giá ≤ spendFraction tiền.

import {
  canStarFeed,
  previewStarUp,
  starsOf,
  type GameData,
  type GameState,
  type Monster
} from '@core'
import { simAct } from './events'
import { offerable } from './sacrifice'

export const STAR_POLICY = {
  /** Chỉ ghép khi giá (chỉ trả khi lên sao) ≤ phần này của tiền. */
  spendFraction: 0.2
} as const

/** Quái đội mẫu (đội / kho, rảnh), ít bản ghép sao trước. */
function teamByCopies(state: GameState, teamIds: ReadonlySet<string>): Monster[] {
  return [...state.party, ...state.storage]
    .filter((m) => teamIds.has(m.id) && m.assignment === null)
    .sort((a, b) => a.starCopies - b.starCopies)
}

/** Ở thị trấn: ghép quái bắt về dư cùng chuỗi tiến hóa vào quái đội mẫu. Trả state và số quái đã ghép. */
export function starUpSpareFodder(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; fed: number } {
  let fed = 0
  if (state.location.type !== 'town' || state.battle) return { state, fed }
  for (const monster of teamByCopies(state, teamIds)) {
    const feeds = offerable(data, state, teamIds).filter((m) => canStarFeed(data, monster, m))
    if (feeds.length === 0) continue
    const { cost } = previewStarUp(data, monster, feeds)
    if (cost.gt(state.money.times(STAR_POLICY.spendFraction))) continue
    state = simAct(data, state, {
      type: 'starUp',
      monsterId: monster.id,
      feedIds: feeds.map((m) => m.id)
    })
    fed += feeds.length
  }
  return { state, fed }
}

/** Số sao trung bình của quái đội mẫu đang sở hữu. */
export function averageTeamStars(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): number {
  const team = [...state.party, ...state.storage].filter((m) => teamIds.has(m.id))
  const total = team.reduce((sum, m) => sum + starsOf(data, m), 0)
  return total / Math.max(1, team.length)
}
