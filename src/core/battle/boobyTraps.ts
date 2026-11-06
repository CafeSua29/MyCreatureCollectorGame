// Sticker Trick / Booby Trap (Cassette Beasts, docs/rules/element-reactions.md): skill vừa dùng gần
// nhất của mục tiêu bị thay bằng Booby Trap trong vài lượt; quái dùng skill đó bằng lệnh của mình thì
// Booby Trap tự đánh chính nó (đòn vật lý không hệ, công / thủ của chính quái). Mỗi skill một bẫy,
// thời hạn riêng; mất khi rời sân.

import { maxBig } from '../shared'
import type { GameData, Monster } from '../model'
import { Draft, battleStats, findMonster, log } from './draft'
import { statDamage } from './damage'
import { loseHp } from './hpChanges'

/** Skill này của quái đang bị thay bằng Booby Trap không. */
export const isBoobyTrapped = (d: Draft, monsterId: string, skillId: string): boolean =>
  d.battle.volatiles[monsterId]?.boobyTraps?.some((trap) => trap.skillId === skillId) ?? false

/**
 * Đặt bẫy lên skill vừa dùng gần nhất của quái. Thất bại (trả về false) khi quái chưa dùng skill
 * nào hoặc skill đó đã bị bẫy (như gốc: thất bại khi skill vừa dùng là Booby Trap).
 */
export function setBoobyTrap(
  d: Draft,
  { monsterId, turns, power }: { monsterId: string; turns: number; power: number }
): boolean {
  const volatile = d.battle.volatiles[monsterId]
  const skillId = volatile?.skillStreak?.skillId
  if (!volatile || !skillId || isBoobyTrapped(d, monsterId, skillId)) return false
  volatile.boobyTraps = [...(volatile.boobyTraps ?? []), { skillId, turnsLeft: turns, power }]
  log(d, { type: 'boobyTrapped', monsterId, skillId })
  return true
}

/** Quái dùng skill bị bẫy: Booby Trap tự đánh nó thay cho skill. Trả về true nếu bẫy đã sập. */
export function springBoobyTrap(data: GameData, d: Draft, user: Monster, skillId: string): boolean {
  const trap = d.battle.volatiles[user.id]?.boobyTraps?.find((entry) => entry.skillId === skillId)
  if (!trap) return false
  log(d, { type: 'boobyTrapSprung', monsterId: user.id, skillId })
  const stats = battleStats(data, d, user)
  const amount = maxBig(
    1,
    statDamage(data, { attackStat: stats.attack, defense: stats.defense, power: trap.power }).ceil()
  )
  loseHp(data, d, findMonster(d, user.id), amount, (dealt) => ({
    type: 'selfDamage',
    monsterId: user.id,
    skillId,
    amount: dealt,
    reason: 'cost'
  }))
  return true
}

/** Cuối lượt: bẫy bớt một lượt, hết thì skill trở lại như cũ. */
export function boobyTrapsAtTurnEnd(d: Draft): void {
  for (const volatile of Object.values(d.battle.volatiles)) {
    if (!volatile.boobyTraps) continue
    const left = volatile.boobyTraps
      .map((trap) => ({ ...trap, turnsLeft: trap.turnsLeft - 1 }))
      .filter((trap) => trap.turnsLeft > 0)
    if (left.length > 0) volatile.boobyTraps = left
    else delete volatile.boobyTraps
  }
}
