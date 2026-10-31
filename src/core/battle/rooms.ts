// Hiệu ứng toàn sân đặc biệt trong trận (lớp room, mục "Môi trường" ở battle-environment.md): đặt / tắt
// (setRoom), giảm thời hạn cuối lượt, thứ tự tốc độ (Trick Room). Đổi thủ, ép đứng trên mặt đất,
// gỡ miễn nhiễm tra qua registries/roomQueries.ts.

import { isSpeedOrderReversed, roomReuse } from '../registries'
import type { BattleField, GameData, Monster, RoomPlacement } from '../model'
import type { Decimal } from '../shared'
import { Draft, aliveOnField, log } from './draft'
import { emitTraitEvent } from './eventQueue'

/**
 * Đặt room (setRoom) do quái `user` dùng: chưa có thì thêm với thời hạn `turns` (bỏ trống =
 * `duration`); đang có thì theo onReuse: tắt room đó (mặc định, như Trick Room) hoặc làm mới
 * thời hạn (như Mud Sport).
 */
export function placeRoom(
  data: GameData,
  d: Draft,
  { fieldId, turns }: RoomPlacement,
  user: Monster
): void {
  const rooms = d.battle.field.rooms
  const active = rooms.find((room) => room.id === fieldId)
  if (active && roomReuse(data, fieldId) === 'toggle') {
    d.battle.field.rooms = rooms.filter((room) => room.id !== fieldId)
    log(d, { type: 'roomRemoved', fieldId, monsterId: user.id })
    return
  }
  // Kiểm tra dữ liệu đảm bảo có turns hoặc duration (checkSetRoomParams).
  const turnsLeft = turns ?? (data.fieldEffects[fieldId].duration as number)
  if (active) active.turnsLeft = turnsLeft
  else rooms.push({ id: fieldId, turnsLeft })
  log(d, { type: 'roomSet', fieldId, turnsLeft, monsterId: user.id })
  // Room Service phản ứng khi room được đặt (kể cả làm mới).
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      emitTraitEvent(d, { type: 'roomSet', subjectId: monster.id })
    }
  }
}

/** Giảm thời hạn room; về 0 thì mất, log roomEnded. */
export function tickRooms(d: Draft): void {
  d.battle.field.rooms = d.battle.field.rooms.flatMap((room) => {
    if (room.turnsLeft > 1) return [{ ...room, turnsLeft: room.turnsLeft - 1 }]
    log(d, { type: 'roomEnded', fieldId: room.id })
    return []
  })
}

/**
 * So tốc độ để sắp thứ tự (âm = a đi trước): tốc độ cao trước, room đảo thứ tự (Trick Room) thì
 * tốc độ thấp trước. Dùng chung cho thứ tự hành động và trait vào sân.
 */
export function compareSpeed(
  data: GameData,
  field: BattleField
): (a: Decimal, b: Decimal) => number {
  const reversed = isSpeedOrderReversed(data, field)
  return (a, b) => (reversed ? a.cmp(b) : b.cmp(a))
}
