// Quái nguyên liệu bị tiêu ở NPC fusing (hiến tế docs/rules/sacrifice.md, bậc sao docs/rules/star-rank.md):
// cùng một luật "quái nào được đem tiêu" và "món / hồn tinh của quái mất đi về đâu".

import { assertNotBond } from '../tamer'
import { ActionError } from '../shared'
import { assertNotLocked, soulFuseRefund } from '../monster'
import { addSoulCrystalPoints } from '../inventory'
import { assertOverflowConfirmed, returnEquipmentWithinCapacity } from '../registries'
import type { GameData, GameState, Monster } from '../model'

/**
 * Các quái nguyên liệu đem tiêu được: không phải bản mệnh (tamer.md mục "Bản mệnh thú"), không khóa,
 * đội còn ít nhất 1 con sau khi mất chúng, món không vừa túi phải được xác nhận bỏ (capacity.md).
 */
export function assertFeedsLosable(
  data: GameData,
  state: GameState,
  { feeds, discardOverflow }: { feeds: readonly Monster[]; discardOverflow?: boolean }
): void {
  for (const feed of feeds) {
    assertNotBond(feed)
    assertNotLocked(feed)
  }
  const lost = new Set(feeds.map((m) => m.id))
  if (state.party.every((m) => lost.has(m.id))) throw new ActionError('partyWouldBeEmpty')
  assertOverflowConfirmed(data, state, { monsters: feeds, discardOverflow })
}

/**
 * State sau khi tiêu quái nguyên liệu (đã qua assertFeedsLosable): món trên chúng về túi, hoàn một
 * phần hồn tinh như quái phụ của fuse (soul-levels.md), bỏ chúng khỏi đội / kho và thay quái nhận.
 * `paid` là state đã trừ tiền; `state` là state trước action (sức chứa túi tính theo nó).
 */
export function consumeFeeds(
  data: GameData,
  { state, paid }: { state: GameState; paid: GameState },
  { receiver, feeds }: { receiver: Monster; feeds: readonly Monster[] }
): GameState {
  let inventory = paid.inventory
  for (const feed of feeds) {
    inventory = returnEquipmentWithinCapacity(data, state, inventory, feed)
    inventory = addSoulCrystalPoints(data, inventory, soulFuseRefund(data, feed))
  }
  const lost = new Set(feeds.map((m) => m.id))
  const update = (monsters: Monster[]): Monster[] =>
    monsters.flatMap((m) => {
      if (lost.has(m.id)) return []
      return m.id === receiver.id ? [receiver] : [m]
    })
  return { ...paid, inventory, party: update(paid.party), storage: update(paid.storage) }
}
