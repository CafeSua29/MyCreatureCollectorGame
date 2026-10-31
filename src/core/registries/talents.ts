// Thiên phú quái (docs/rules/monster-talents.md): điểm, giá nâng, điều kiện nâng và hook đang có
// tác dụng. Điểm không lưu trong save: suy từ maxLevelReached, tầng thức tỉnh và số lần luân hồi
// (quy tắc 3), trừ phần đã dùng cho các nút. Tách khỏi roster/ để traitHooks.ts (nguồn hook "talent") import được.

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

/** Giá nâng nút từ cấp `rank` lên `rank + 1`: costPerRank × (rank + 1). */
export function talentRankCost(node: TalentNodeDef, rank: number): number {
  return node.costPerRank * (rank + 1)
}

/** Tổng điểm đã dùng để nâng nút tới cấp `rank`: costPerRank × (1 + 2 + … + rank). */
function talentPointsForRank(node: TalentNodeDef, rank: number): number {
  return (node.costPerRank * rank * (rank + 1)) / 2
}

/** Tổng điểm đã dùng trên mọi nút. */
export function talentPointsSpent(data: GameData, monster: TalentMonster): number {
  return Object.entries(monster.talentRanks).reduce(
    (sum, [nodeId, rank]) => sum + talentPointsForRank(data.talents[nodeId], rank),
    0
  )
}

/**
 * Điểm còn dùng được (có thể âm nếu dữ liệu tăng giá nút sau khi đã nâng: khi đó chỉ không nâng thêm
 * được, không mất cấp đã có).
 */
export function talentPointsAvailable(data: GameData, monster: TalentMonster): number {
  return talentPointsEarned(data, monster) - talentPointsSpent(data, monster)
}

/** Lý do không nâng được một nút (null = nâng được). */
export type TalentBlocker =
  | { kind: 'branchClosed' }
  | { kind: 'maxRank'; maxRank: number }
  | { kind: 'requires'; nodeId: string; rank: number }
  | { kind: 'points'; need: number; have: number }

/** Kiểm tra nâng nút `nodeId` thêm một cấp (nút phải tồn tại). */
export function talentBlocker(
  data: GameData,
  monster: TalentMonster,
  nodeId: string
): TalentBlocker | null {
  const node = data.talents[nodeId]
  if (!isTalentBranchOpen(data, monster, node.branchId)) return { kind: 'branchClosed' }
  const rank = monster.talentRanks[nodeId] ?? 0
  if (node.maxRank !== undefined && rank >= node.maxRank) {
    return { kind: 'maxRank', maxRank: node.maxRank }
  }
  for (const [requiredId, requiredRank] of Object.entries(node.requires ?? {})) {
    if ((monster.talentRanks[requiredId] ?? 0) < requiredRank) {
      return { kind: 'requires', nodeId: requiredId, rank: requiredRank }
    }
  }
  const need = talentRankCost(node, rank)
  const have = talentPointsAvailable(data, monster)
  return have < need ? { kind: 'points', need, have } : null
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
