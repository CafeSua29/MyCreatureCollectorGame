// Thiên phú quái trên quái (docs/rules/monster-talents.md): kiểm tra trong save và dữ liệu hiển thị.
// Điểm, giá, điều kiện nâng ở registries/talents.ts.

import {
  isTalentBranchOpen,
  talentBlocker,
  talentPointsEarned,
  talentPointsSpent,
  talentRankCost,
  type TalentBlocker
} from '../registries'
import { asObject, checkInteger } from '../shared'
import type { GameData, Monster } from '../model'

/** Cấp nút trong save: nút tồn tại, nguyên ≥ 1, không quá maxRank (không xét điểm: dữ liệu đổi giá được). */
export function validateTalentRanks(data: GameData, value: unknown, path: string): string[] {
  const ranks = asObject(value)
  if (!ranks) return [`${path} phải là object id nút → cấp`]
  const issues: string[] = []
  for (const [nodeId, rank] of Object.entries(ranks)) {
    const where = `${path}.${nodeId}`
    if (!Object.hasOwn(data.talents, nodeId)) {
      issues.push(`${where}: thiên phú không tồn tại`)
      continue
    }
    issues.push(...checkInteger(rank, where, 1))
    const { maxRank } = data.talents[nodeId]
    if (maxRank !== undefined && typeof rank === 'number' && rank > maxRank) {
      issues.push(`${where} tối đa ${maxRank}, nhận ${rank}`)
    }
  }
  return issues
}

/** Một nút trong MonsterView: cấp, giá cấp tiếp theo, lý do chưa nâng được (null = nâng được). */
export interface TalentNodeView {
  nodeId: string
  rank: number
  nextCost: number
  blocker: TalentBlocker | null
}

/** Thiên phú của quái (MonsterView): điểm và mọi nút của các nhánh đang mở. */
export interface TalentView {
  earned: number
  spent: number
  available: number
  nodes: TalentNodeView[]
}

/** Thiên phú của quái theo thứ tự nút trong dữ liệu; nút ở nhánh race không khớp thì bỏ qua. */
export function talentView(data: GameData, monster: Monster): TalentView {
  const earned = talentPointsEarned(data, monster)
  const spent = talentPointsSpent(data, monster)
  const nodes: TalentNodeView[] = []
  for (const node of Object.values(data.talents)) {
    if (!isTalentBranchOpen(data, monster, node.branchId)) continue
    const rank = monster.talentRanks[node.id] ?? 0
    nodes.push({
      nodeId: node.id,
      rank,
      nextCost: talentRankCost(node, rank),
      blocker: talentBlocker(data, monster, node.id)
    })
  }
  return { earned, spent, available: earned - spent, nodes }
}
