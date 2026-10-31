// Tra cứu trên hiệu ứng toàn sân đặc biệt đang có (lớp room, mục "Môi trường" ở battle-environment.md): thứ
// tự tốc độ, đổi thủ, ép đứng trên mặt đất, gỡ miễn nhiễm, chặn đổi quái / chạy trốn, cách đặt lại,
// điểm lợi cho AI. Handler ở roomHooks.ts; đổi hệ skill (Ion Deluge) tra ở skillInField
// (fieldQueries.ts).

import type { BattleField, GameData, Monster, RoomReuse } from '../model'
import { FIELD_HOOKS } from './fieldHooks'
import { fieldMonsterContext } from './fieldQueries'
import type { FieldHookHandler } from './fieldHookUtils'

/** Có hook nào của các room đang có thỏa điều kiện không. */
function anyRoomHook(
  data: GameData,
  field: BattleField,
  test: (handler: FieldHookHandler, params: unknown) => boolean
): boolean {
  return field.rooms.some(({ id }) =>
    data.fieldEffects[id].hooks.some((hook) => test(FIELD_HOOKS[hook.type], hook.params))
  )
}

/** Quái chậm đi trước trong cùng mức priority (kiểu Trick Room). */
export function isSpeedOrderReversed(data: GameData, field: BattleField): boolean {
  return anyRoomHook(
    data,
    field,
    (handler, params) => handler.reversesSpeedOrder?.(params) ?? false
  )
}

/** Thủ ↔ thủ đặc biệt đổi giá trị cho nhau (kiểu Wonder Room). */
export function areDefensesSwapped(data: GameData, field: BattleField): boolean {
  return anyRoomHook(data, field, (handler, params) => handler.swapsDefenses?.(params) ?? false)
}

/** Món trong ô của quái trên sân không tác dụng (kiểu Magic Room). */
export function areItemsDisabled(data: GameData, field: BattleField): boolean {
  return anyRoomHook(data, field, (handler, params) => handler.disablesItems?.(params) ?? false)
}

/** Room chặn đổi quái / chạy trốn (kiểu Fairy Lock): id room đầu tiên, hoặc null. */
export function escapeBlockingRoom(data: GameData, field: BattleField): string | null {
  const room = field.rooms.find(({ id }) =>
    data.fieldEffects[id].hooks.some(
      (hook) => FIELD_HOOKS[hook.type].preventsEscape?.(hook.params) ?? false
    )
  )
  return room?.id ?? null
}

/** Room đang cấm skill `skillId` (kiểu Gravity cấm Fly). */
export function isSkillBannedByRoom(data: GameData, field: BattleField, skillId: string): boolean {
  return anyRoomHook(
    data,
    field,
    (handler, params) => handler.bansSkill?.(params, skillId) ?? false
  )
}

/** Mọi quái đứng trên mặt đất (kiểu Gravity). */
export function isGroundingForced(data: GameData, field: BattleField): boolean {
  return anyRoomHook(data, field, (handler, params) => handler.forcesGrounded?.(params) ?? false)
}

/** Skill hệ `elementId` không bị miễn nhiễm vì quái nhận đang bay (Gravity: hệ Đất). */
export function isAirborneImmunityRemoved(
  data: GameData,
  field: BattleField,
  elementId: string
): boolean {
  return anyRoomHook(
    data,
    field,
    (handler, params) => handler.removesImmunityFrom?.(params, elementId) ?? false
  )
}

/** Cách đặt lại room đang có (onReuse, mặc định tắt). */
export const roomReuse = (data: GameData, fieldId: string): RoomReuse =>
  data.fieldEffects[fieldId].onReuse ?? 'toggle'

/** Room `fieldId` đang có. */
export function isRoomActive(field: BattleField, fieldId: string): boolean {
  return field.rooms.some((room) => room.id === fieldId)
}

/**
 * Điểm lợi của phe `allies` khi room `fieldId` có mặt (aiValue của setRoom): mỗi hook chấm bằng
 * teamBenefit (so hai phe) nếu có, không thì tổng aiBenefit quái ta trừ tổng của quái địch.
 */
export function roomBenefit(
  data: GameData,
  fieldId: string,
  { allies, foes }: { allies: readonly Monster[]; foes: readonly Monster[] }
): number {
  const sum = (monsters: readonly Monster[], handler: FieldHookHandler, params: unknown): number =>
    monsters.reduce(
      (total, monster) => total + handler.aiBenefit(params, fieldMonsterContext(data, monster)),
      0
    )
  let benefit = 0
  for (const hook of data.fieldEffects[fieldId].hooks) {
    const handler = FIELD_HOOKS[hook.type]
    benefit += handler.teamBenefit
      ? handler.teamBenefit(hook.params, { data, allies, foes })
      : sum(allies, handler, hook.params) - sum(foes, handler, hook.params)
  }
  return benefit
}
