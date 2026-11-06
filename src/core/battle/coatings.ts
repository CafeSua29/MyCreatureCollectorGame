// Lớp phủ hệ (Coating của Cassette Beasts, docs/rules/element-reactions.md): biến hệ có thời hạn. Hết
// hạn thì quái trở lại hệ trước khi bị đổi; biến hệ không thời hạn (Soak) thì giữ tới khi rời sân.

import { activeTransform } from '../monster'
import { Draft, findMonster, log } from './draft'
import { changeIdentity } from './traitEffects'

/** Ghi thời hạn lớp phủ vừa đặt; không thời hạn thì bỏ thời hạn cũ (giữ tới khi rời sân). */
export function startCoating(d: Draft, monsterId: string, turns: number | undefined): void {
  const volatile = d.battle.volatiles[monsterId]
  if (!volatile?.originalIdentity) return
  if (turns === undefined) delete volatile.coatingTurnsLeft
  else volatile.coatingTurnsLeft = turns
}

/** Bỏ lớp phủ của quái (hết hạn, bị gỡ như gốc: "removable"): trả hệ gốc, race đang đổi thì giữ. */
export function endCoating(d: Draft, monsterId: string): void {
  const volatile = d.battle.volatiles[monsterId]
  if (volatile?.coatingTurnsLeft === undefined) return
  delete volatile.coatingTurnsLeft
  const original = volatile.originalIdentity
  if (!original) return
  const monster = findMonster(d, monsterId)
  monster.elementIds = [...original.elementIds]
  if (monster.raceId === original.raceId) delete volatile.originalIdentity
  log(d, {
    type: 'identityChanged',
    monsterId,
    elementIds: monster.elementIds,
    raceId: monster.raceId
  })
}

/**
 * Paint Swipe: lớp phủ của `fromId` sang `toId` (cùng hệ, cùng lượt còn lại), `fromId` trở lại hệ gốc.
 * Không có lớp phủ, mục tiêu đang Tera thì thôi.
 */
export function transferCoating(
  d: Draft,
  { fromId, toId }: { fromId: string; toId: string }
): void {
  const turns = d.battle.volatiles[fromId]?.coatingTurnsLeft
  if (turns === undefined || fromId === toId) return
  const from = findMonster(d, fromId)
  const to = findMonster(d, toId)
  const elementIds = [...from.elementIds]
  endCoating(d, fromId)
  if (activeTransform(to)?.kind === 'tera') return
  changeIdentity(d, to, { elementIds })
  startCoating(d, toId, turns)
}

/** Cuối lượt: lớp phủ bớt một lượt; hết hạn thì bỏ. */
export function coatingsAtTurnEnd(d: Draft): void {
  for (const [monsterId, volatile] of Object.entries(d.battle.volatiles)) {
    if (volatile.coatingTurnsLeft === undefined) continue
    if (volatile.coatingTurnsLeft > 1) volatile.coatingTurnsLeft--
    else endCoating(d, monsterId)
  }
}
