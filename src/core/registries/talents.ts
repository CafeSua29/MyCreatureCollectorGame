// Thiên phú quái (docs/rules/monster-talents.md): điểm, giá nâng, điều kiện nâng và hook đang có
// tác dụng. Điểm không lưu trong save: suy từ maxLevelReached, tầng thức tỉnh và số lần luân hồi
// (quy tắc 3), trừ phần đã dùng cho các nút. Tách khỏi roster/ để traitHooks.ts (nguồn hook "talent") import được.

import { ActionError, assertNever } from '../shared'
import { raceMatchesAny } from './races'
import type { GameData, Monster, TalentNodeDef } from '../model'

type TalentMonster = Pick<
  Monster,
  'raceId' | 'maxLevelReached' | 'awakening' | 'rebirths' | 'talentRanks'
>

/** Nhánh có mở cho quái không: nhánh chung luôn mở, nhánh race chỉ khi race khớp. */
export function isTalentBranchOpen(
  data: GameData,
  monster: Pick<Monster, 'raceId'>,
  branchId: string
): boolean {
  const { raceIds } = data.talentBranches[branchId]
  return raceIds === undefined || raceMatchesAny(data, monster.raceId, raceIds)
}

/**
 * Tổng điểm thiên phú quái đã nhận: ⌊maxLevelReached / levelsPerPoint⌋ + awakening ×
 * pointsPerAwakening + rebirths × pointsPerRebirth.
 */
export function talentPointsEarned(data: GameData, monster: TalentMonster): number {
  const { levelsPerPoint, pointsPerAwakening, pointsPerRebirth } = data.config.talents
  return (
    Math.floor(monster.maxLevelReached / levelsPerPoint) +
    monster.awakening * pointsPerAwakening +
    monster.rebirths * pointsPerRebirth
  )
}

/** Nút nâng theo cấp (thiên phú quái, thiên phú ngự thú sư): giá, trần, nút yêu cầu. */
export interface RankedNode {
  costPerRank: number
  maxRank?: number
  requires?: Record<string, number>
}

/** Giá nâng nút từ cấp `rank` lên `rank + 1`: costPerRank × (rank + 1). */
export function talentRankCost(node: Pick<RankedNode, 'costPerRank'>, rank: number): number {
  return node.costPerRank * (rank + 1)
}

/** Tổng điểm đã dùng để nâng nút tới cấp `rank`: costPerRank × (1 + 2 + … + rank). */
function talentPointsForRank(node: Pick<RankedNode, 'costPerRank'>, rank: number): number {
  return (node.costPerRank * rank * (rank + 1)) / 2
}

/** Tổng điểm đã dùng cho mọi nút trong `ranks` (id nút → cấp; nút phải có trong `nodes`). */
export function rankedPointsSpent(
  nodes: Readonly<Record<string, RankedNode>>,
  ranks: Readonly<Record<string, number>>
): number {
  return Object.entries(ranks).reduce(
    (sum, [nodeId, rank]) => sum + talentPointsForRank(nodes[nodeId], rank),
    0
  )
}

/** Tổng điểm thiên phú quái đã dùng trên mọi nút. */
export function talentPointsSpent(data: GameData, monster: TalentMonster): number {
  return rankedPointsSpent(data.talents, monster.talentRanks)
}

/**
 * Điểm còn dùng được (có thể âm nếu dữ liệu tăng giá nút sau khi đã nâng: khi đó chỉ không nâng thêm
 * được, không mất cấp đã có).
 */
export function talentPointsAvailable(data: GameData, monster: TalentMonster): number {
  return talentPointsEarned(data, monster) - talentPointsSpent(data, monster)
}

/** Lý do chung không nâng được một nút của cây thiên phú bất kỳ (trần, nút yêu cầu, điểm). */
export type RankedNodeBlocker =
  | { kind: 'maxRank'; maxRank: number }
  | { kind: 'requires'; nodeId: string; rank: number }
  | { kind: 'points'; need: number; have: number }

/** Lý do không nâng được một nút thiên phú quái (null = nâng được). */
export type TalentBlocker = { kind: 'branchClosed' } | RankedNodeBlocker

/** Lỗi action theo lý do chung không nâng được nút `nodeId`. */
export function rankedNodeError(nodeId: string, blocker: RankedNodeBlocker): ActionError {
  switch (blocker.kind) {
    case 'maxRank':
      return new ActionError('talentMaxRank', { nodeId, maxRank: blocker.maxRank })
    case 'requires':
      return new ActionError('talentRequires', {
        nodeId,
        requiredId: blocker.nodeId,
        rank: blocker.rank
      })
    case 'points':
      return new ActionError('notEnoughTalentPoints', { need: blocker.need, have: blocker.have })
    default:
      return assertNever(blocker, 'lý do không nâng được thiên phú')
  }
}

/**
 * Kiểm tra nâng nút thêm một cấp theo trần, nút yêu cầu và điểm còn `available` (chung cho mọi cây
 * thiên phú; nhánh đóng / mở do nơi gọi xét trước).
 */
export function rankedNodeBlocker(
  node: RankedNode,
  ranks: Readonly<Record<string, number>>,
  { nodeId, available }: { nodeId: string; available: number }
): RankedNodeBlocker | null {
  const rank = ranks[nodeId] ?? 0
  if (node.maxRank !== undefined && rank >= node.maxRank) {
    return { kind: 'maxRank', maxRank: node.maxRank }
  }
  for (const [requiredId, requiredRank] of Object.entries(node.requires ?? {})) {
    if ((ranks[requiredId] ?? 0) < requiredRank) {
      return { kind: 'requires', nodeId: requiredId, rank: requiredRank }
    }
  }
  const need = talentRankCost(node, rank)
  return available < need ? { kind: 'points', need, have: available } : null
}

/** Kiểm tra nâng nút thiên phú quái `nodeId` thêm một cấp (nút phải tồn tại). */
export function talentBlocker(
  data: GameData,
  monster: TalentMonster,
  nodeId: string
): TalentBlocker | null {
  const node = data.talents[nodeId]
  if (!isTalentBranchOpen(data, monster, node.branchId)) return { kind: 'branchClosed' }
  return rankedNodeBlocker(node, monster.talentRanks, {
    nodeId,
    available: talentPointsAvailable(data, monster)
  })
}

/** Nút đã nâng ở nhánh đang mở, kèm cấp: hook của nút nhân hệ số = cấp. */
export function activeTalents(
  data: GameData,
  monster: TalentMonster
): { node: TalentNodeDef; rank: number }[] {
  const result: { node: TalentNodeDef; rank: number }[] = []
  for (const [nodeId, rank] of Object.entries(monster.talentRanks)) {
    const node = data.talents[nodeId]
    if (isTalentBranchOpen(data, monster, node.branchId)) result.push({ node, rank })
  }
  return result
}
