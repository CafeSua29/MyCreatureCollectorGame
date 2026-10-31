// Bảng món theo trọng số (rương bí cảnh, rương hiểm địa): mỗi lượt tung một món, số lượng đều trong
// khoảng của món đó.

import { nextInt, pickWeighted, type RngState } from '../shared'
import type { ChestItemEntry, GameData, GameOptions, ItemReward } from '../model'
import { isItemOffered } from './itemRules'

/**
 * Tung `rolls` lượt trên bảng món (bỏ món trọng số 0 và món chỉ có theo tùy chọn đang tắt). Bảng
 * không còn món nào thì không tốn RNG. Món trùng giữ thành nhiều dòng (UI gộp nếu cần).
 */
export function rollChestItems(
  data: GameData,
  rng: RngState,
  {
    entries,
    rolls,
    options
  }: { entries: readonly ChestItemEntry[]; rolls: number; options: GameOptions }
): [ItemReward[], RngState] {
  const offered = entries.filter(
    (entry) => entry.weight > 0 && isItemOffered(data.items[entry.itemId], options)
  )
  if (offered.length === 0) return [[], rng]
  const rewards: ItemReward[] = []
  for (let i = 0; i < rolls; i++) {
    let entry: ChestItemEntry
    ;[entry, rng] = pickWeighted(rng, offered, (candidate) => candidate.weight)
    let count: number
    ;[count, rng] = nextInt(rng, entry.min, entry.max)
    rewards.push({ itemId: entry.itemId, count })
  }
  return [rewards, rng]
}
