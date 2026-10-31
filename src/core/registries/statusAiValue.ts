// Điểm AI của việc gây trạng thái (dùng chung cho hiệu ứng skill gây trạng thái một mục tiêu / cả
// phe và trait gây trạng thái khi trúng đòn). Tách riêng để các file hiệu ứng skill import không vòng.

import { conflictingStatus, hasStatus, isFainted, isStatusImmune } from '../monster'
import type { BattleField, BattleSide, GameData, Monster } from '../model'
import { statusBlockingField } from './fieldQueries'

/**
 * Điểm AI khi gây trạng thái lên quái `monster` ở phe `side` (chắc chắn trúng): trọng số của
 * trạng thái, 0 khi đã dính, miễn nhiễm, có trạng thái cùng nhóm loại trừ hoặc môi trường (cả hiệu
 * ứng theo phe) chặn. Dùng chung cho applyStatus và trait gây trạng thái khi trúng đòn.
 */
export function statusAiValue(
  data: GameData,
  field: BattleField,
  { monster, side }: { monster: Monster; side: BattleSide },
  statusId: string
): number {
  if (
    isFainted(data, monster) ||
    hasStatus(monster, statusId) ||
    isStatusImmune(data, monster, statusId) ||
    conflictingStatus(data, monster, statusId) !== null ||
    statusBlockingField(data, field, { monster, side }, statusId) !== null
  ) {
    return 0
  }
  return data.config.ai.statusWeights[statusId]
}
