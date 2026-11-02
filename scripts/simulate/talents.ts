// "Người chơi" nâng thiên phú (mục "Thiên phú quái" ở simulation-features.md,
// docs/rules/monster-talents.md): mỗi lần về thị trấn dùng hết điểm thiên phú của từng quái đội mẫu,
// mỗi lần nâng nút nâng được có giá cấp tiếp theo rẻ nhất (rải đều, tận dụng giá tăng dần), hòa thì
// theo thứ tự nút trong dữ liệu; không còn nút nào nâng được thì dừng. Thiên phú ngự thú sư
// (docs/rules/tamer-talents.md) dùng cùng cách chọn.

import { talentView, tamerTalentView, type GameData, type GameState, type Monster } from '@core'
import { simAct } from './events'

/** Nút rẻ nhất nâng được ngay trong danh sách; null = hết điểm hoặc mọi nút bị chặn. */
function cheapestOf(
  nodes: readonly { nodeId: string; nextCost: number; blocker: unknown }[]
): string | null {
  let best: { nodeId: string; cost: number } | null = null
  for (const node of nodes) {
    if (node.blocker !== null) continue
    if (best === null || node.nextCost < best.cost)
      best = { nodeId: node.nodeId, cost: node.nextCost }
  }
  return best?.nodeId ?? null
}

/** Nút rẻ nhất nâng được ngay của quái. */
const cheapestNode = (data: GameData, monster: Monster): string | null =>
  cheapestOf(talentView(data, monster).nodes)

/** Dùng hết điểm thiên phú của quái đội mẫu; trả state mới và số lần đã nâng. */
export function allocateTalents(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; upgrades: number } {
  let upgrades = 0
  for (const monsterId of teamIds) {
    for (;;) {
      const monster = state.party.find((m) => m.id === monsterId)
      const nodeId = monster && cheapestNode(data, monster)
      if (!nodeId) break
      state = simAct(data, state, { type: 'allocateTalent', monsterId, nodeId })
      upgrades++
    }
  }
  return { state, upgrades }
}

/** Dùng hết điểm thiên phú ngự thú sư (ngoài trận); trả state mới và số lần đã nâng. */
export function allocateTamerTalents(
  data: GameData,
  state: GameState
): { state: GameState; upgrades: number } {
  if (state.battle) return { state, upgrades: 0 }
  let upgrades = 0
  for (;;) {
    const nodeId = cheapestOf(tamerTalentView(data, state).nodes)
    if (!nodeId) break
    state = simAct(data, state, { type: 'allocateTamerTalent', nodeId })
    upgrades++
  }
  return { state, upgrades }
}
