// Cây thiên phú ngự thú sư (docs/rules/tamer-talents.md): nâng nút, tẩy cả cây, dữ liệu hiển thị.
// Điểm, điều kiện nâng ở registries/tamerTalents.ts; hiệu ứng là kênh thưởng (registries/tamerBonuses.ts).

import { removeItems } from '../inventory'
import {
  rankedNodeError,
  talentRankCost,
  tamerTalentBlocker,
  tamerTalentPointsEarned,
  tamerTalentPointsSpent,
  type RankedNodeBlocker
} from '../registries'
import { ActionError, malformedAction } from '../shared'
import type { GameData, GameState } from '../model'

/** Nâng nút thiên phú ngự thú sư `nodeId` thêm một cấp (ngoài trận, ở đâu cũng được). */
export function allocateTamerTalent(data: GameData, state: GameState, nodeId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (typeof nodeId !== 'string') throw malformedAction('nodeId phải là id nút thiên phú')
  if (!Object.hasOwn(data.tamerTalents, nodeId)) throw new ActionError('unknownTalent', { nodeId })
  const blocker = tamerTalentBlocker(data, state, nodeId)
  if (blocker) throw rankedNodeError(nodeId, blocker)
  const { talentRanks } = state.tamer
  const rank = (talentRanks[nodeId] ?? 0) + 1
  return { ...state, tamer: { ...state.tamer, talentRanks: { ...talentRanks, [nodeId]: rank } } }
}

/**
 * Tẩy cả cây thiên phú ngự thú sư (ngoài trận, ở đâu cũng được): tiêu 1 vật phẩm resetItemId, xóa
 * mọi cấp nên hoàn đủ điểm (điểm suy từ nguồn, không lưu). Chưa nâng nút nào thì báo lỗi, không mất
 * vật phẩm.
 */
export function resetTamerTalents(data: GameData, state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (Object.keys(state.tamer.talentRanks).length === 0) {
    throw new ActionError('tamerTalentsEmpty')
  }
  const inventory = removeItems(state.inventory, data.config.tamerTalents.resetItemId, 1)
  return { ...state, inventory, tamer: { ...state.tamer, talentRanks: {} } }
}

/** Một nút trong TamerTalentView: cấp, giá cấp tiếp theo, lý do chưa nâng được (null = nâng được). */
export interface TamerTalentNodeView {
  nodeId: string
  branchId: string
  rank: number
  nextCost: number
  blocker: RankedNodeBlocker | null
}

/** Cây thiên phú ngự thú sư cho UI / mô phỏng: điểm và mọi nút theo thứ tự dữ liệu. */
export interface TamerTalentView {
  earned: number
  spent: number
  available: number
  nodes: TamerTalentNodeView[]
}

export function tamerTalentView(data: GameData, state: GameState): TamerTalentView {
  const earned = tamerTalentPointsEarned(data, state)
  const spent = tamerTalentPointsSpent(data, state)
  const nodes = Object.values(data.tamerTalents).map((node) => {
    const rank = state.tamer.talentRanks[node.id] ?? 0
    return {
      nodeId: node.id,
      branchId: node.branchId,
      rank,
      nextCost: talentRankCost(node, rank),
      blocker: tamerTalentBlocker(data, state, node.id)
    }
  })
  return { earned, spent, available: earned - spent, nodes }
}
