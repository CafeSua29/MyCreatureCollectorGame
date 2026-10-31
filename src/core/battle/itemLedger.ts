// Món lắp bị lấy / tráo trong trận (docs/rules/pokemon-moves.md mục "Đồ cầm"): Knock Off, Thief,
// Trick... Như Pokémon thế hệ 5+, hết trận mọi quái có món bị đổi lấy lại đúng món trước trận (ghi
// sổ ở lần đổi đầu tiên). Món ăn mất (Bug Bite) và đồ tiêu hao đã dùng thì không trả lại.

import type { EquippedItem, GameData, Monster } from '../model'
import { Draft, log } from './draft'

/** Ghi món lắp của quái trước lần đổi đầu tiên trong trận. */
function remember(d: Draft, monster: Monster): void {
  const ledger = d.battle.itemLedger ?? {}
  if (!(monster.id in ledger)) ledger[monster.id] = [...monster.equipment]
  d.battle.itemLedger = ledger
}

/** Món khớp nhãn (`tags` bỏ trống = mọi món). */
function matchesTags(data: GameData, entry: EquippedItem, tags?: readonly string[]): boolean {
  if (!tags) return true
  const itemId = entry.storage === 'stack' ? entry.itemId : entry.instance.baseItemId
  const item = data.items[itemId]
  const itemTags = item && 'tags' in item ? (item.tags ?? []) : []
  return itemTags.some((tag) => tags.includes(tag))
}

/** Món là đồ cầm có số `field` (Fling, Natural Gift). */
function hasNumber(
  data: GameData,
  entry: EquippedItem,
  field: 'flingPower' | 'naturalGift'
): boolean {
  if (entry.storage !== 'stack') return false
  const item = data.items[entry.itemId]
  return item?.category === 'held' && item[field] !== undefined
}

/**
 * Lấy món khớp nhãn khỏi quái (log `itemsTaken`); `consume`: món sẽ bị ăn nên không trả lại hết trận.
 * Trả về các món đã lấy.
 */
export function takeEquipment(
  data: GameData,
  d: Draft,
  holder: Monster,
  tags?: readonly string[],
  {
    consume = false,
    firstWith
  }: { consume?: boolean; firstWith?: 'flingPower' | 'naturalGift' } = {}
): EquippedItem[] {
  const matching = holder.equipment.filter((entry) => matchesTags(data, entry, tags))
  const taken = firstWith
    ? matching.filter((entry) => hasNumber(data, entry, firstWith)).slice(0, 1)
    : matching
  if (taken.length === 0) return []
  if (!consume) remember(d, holder)
  holder.equipment = holder.equipment.filter((entry) => !taken.includes(entry))
  log(d, { type: 'itemsTaken', monsterId: holder.id, count: taken.length })
  return taken
}

/** Lắp thêm món cho quái (`temporary`: chỉ trong trận, hết trận về như trước). */
export function giveEquipment(
  d: Draft,
  receiver: Monster,
  items: readonly EquippedItem[],
  { temporary = true }: { temporary?: boolean } = {}
): void {
  if (temporary) remember(d, receiver)
  receiver.equipment = [...receiver.equipment, ...items]
}

/** Tráo toàn bộ món lắp giữa hai quái (Trick). */
export function swapEquipment(d: Draft, a: Monster, b: Monster): void {
  if (a.equipment.length === 0 && b.equipment.length === 0) return
  remember(d, a)
  remember(d, b)
  const held = a.equipment
  a.equipment = b.equipment
  b.equipment = held
  log(d, { type: 'itemsSwapped', monsterId: a.id, otherId: b.id })
}

/** Hết trận: quái có trong sổ lấy lại món trước trận. */
export function restoreItemLedger(d: Draft): void {
  const ledger = d.battle.itemLedger
  if (!ledger) return
  for (const monster of [...d.party, ...d.battle.enemies, ...d.battle.captured]) {
    const before = ledger[monster.id]
    if (before) monster.equipment = before
  }
  delete d.battle.itemLedger
}
