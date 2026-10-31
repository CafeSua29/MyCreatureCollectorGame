// Hồn phách trong túi (docs/rules/soul-relics.md): thêm, lấy ra theo id. Hàm thuần.

import { ActionError } from '../shared'
import type { Inventory, SoulRemnant } from '../model'

/** Thêm hồn phách vào cuối túi (mới nhất). */
export function addSoul(inventory: Inventory, soul: SoulRemnant): Inventory {
  return { ...inventory, souls: [...inventory.souls, soul] }
}

/** Lấy một hồn phách khỏi túi theo id; không có thì ném soulNotFound. */
export function takeSoul(inventory: Inventory, soulId: string): [SoulRemnant, Inventory] {
  const soul = inventory.souls.find((entry) => entry.id === soulId)
  if (!soul) throw new ActionError('soulNotFound', { soulId })
  return [soul, { ...inventory, souls: inventory.souls.filter((entry) => entry !== soul) }]
}
