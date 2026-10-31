// Hàng chờ hành động còn lại của lượt đang xử lý (Timeline của Siralim, mục "Lượt và Timeline" ở
// battle.md). Trait thêm lượt (hành động thêm ngay sau hành động hiện tại) và đổi chỗ trên
// Timeline (lên đầu / xuống cuối các hành động còn lại) sửa hàng chờ này. Gắn với bản nháp
// (WeakMap) như hàng đợi sự kiện: không vào state, mất cùng bản nháp.

import type { Decimal } from '../shared'
import type { BattleCommand, BattleSide } from '../model'

export interface TurnAction {
  side: BattleSide
  slot: number
  monsterId: string
  /** null = hành động thêm do trait: lệnh do AI chọn lúc tới lượt. */
  command: BattleCommand | null
  priority: number
  /** Đi sau quái không mang trait kiểu Stall / không bị Snared trong cùng mức priority. */
  actsLast: boolean
  speed: Decimal
  tiebreak: number
}

const queues = new WeakMap<object, TurnAction[]>()
/** Quái đã tung hành động thêm của cuồng bạo trong lượt này (docs/rules/frenzy.md). */
const frenzyRolls = new WeakMap<object, Set<string>>()

/** Đặt hàng chờ hành động của lượt (sau khi đã sắp thứ tự). */
export function setPendingActions(draft: object, actions: TurnAction[]): void {
  queues.set(draft, actions)
}

/** Lấy hành động kế tiếp của lượt; hết thì undefined. */
export function nextPendingAction(draft: object): TurnAction | undefined {
  return queues.get(draft)?.shift()
}

/** Dọn hàng chờ khi hết lượt. */
export function clearPendingActions(draft: object): void {
  queues.delete(draft)
  lastSkills.delete(draft)
  frenzyRolls.delete(draft)
}

/**
 * Đánh dấu quái đã tung hành động thêm của cuồng bạo trong lượt; false nếu đã tung rồi (tối đa một
 * lần mỗi lượt cho mỗi quái, kể cả khi lượt có nhiều hành động).
 */
export function claimFrenzyRoll(draft: object, monsterId: string): boolean {
  let rolled = frenzyRolls.get(draft)
  if (!rolled) frenzyRolls.set(draft, (rolled = new Set()))
  if (rolled.has(monsterId)) return false
  rolled.add(monsterId)
  return true
}

/**
 * Skill quái đã chọn còn chờ dùng trong lượt đang xử lý (lệnh skill đầu tiên của quái trong hàng
 * chờ) kèm priority thật; không có thì undefined (điều kiện kiểu Sucker Punch).
 */
export function pendingSkillOf(
  draft: object,
  monsterId: string
): { skillId: string; priority: number } | undefined {
  const action = queues
    .get(draft)
    ?.find((entry) => entry.monsterId === monsterId && entry.command?.kind === 'skill')
  if (action?.command?.kind !== 'skill') return undefined
  return { skillId: action.command.skillId, priority: action.priority }
}

/** Skill vừa dùng gần nhất (bằng lệnh của quái) trong lượt đang xử lý, theo bản nháp. */
const lastSkills = new WeakMap<object, { skillId: string; side: BattleSide }>()

/** Ghi skill vừa dùng trong lượt (Round, Fusion Flare / Bolt xét skill dùng ngay trước). */
export function recordSkillThisTurn(draft: object, skillId: string, side: BattleSide): void {
  if (queues.has(draft)) lastSkills.set(draft, { skillId, side })
}

/** Skill dùng gần nhất trong lượt đang xử lý (undefined = chưa có / ngoài lượt). */
export function previousSkillThisTurn(
  draft: object
): { skillId: string; side: BattleSide } | undefined {
  return queues.has(draft) ? lastSkills.get(draft) : undefined
}

/** Lượt đang xử lý (có hàng chờ) không. */
export const hasTurnInProgress = (draft: object): boolean => queues.has(draft)

/** Thêm một hành động (lệnh do AI chọn) ngay sau hành động hiện tại. */
export function insertExtraAction(draft: object, action: Omit<TurnAction, 'command'>): void {
  queues.get(draft)?.unshift({ ...action, command: null })
}

/**
 * Đưa hành động còn chờ của quái lên đầu / xuống cuối hàng chờ. Trả về false nếu quái không còn
 * hành động chờ trong lượt này (trận đấu áp cho lượt sau).
 */
export function movePendingAction(
  draft: object,
  monsterId: string,
  position: 'top' | 'bottom'
): boolean {
  const queue = queues.get(draft)
  if (!queue) return false
  const index = queue.findIndex((action) => action.monsterId === monsterId)
  if (index < 0) return false
  const [action] = queue.splice(index, 1)
  if (position === 'top') queue.unshift(action)
  else queue.push(action)
  return true
}
