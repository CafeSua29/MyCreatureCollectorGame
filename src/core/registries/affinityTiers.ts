// Mức thân mật (docs/rules/affinity.md): tra mức theo điểm. Tách riêng khỏi affinity.ts để
// traitHooks.ts (nguồn hook "affinity") import được mà không vòng.

import type { AffinityTierDef, GameData } from '../model'

/** Mức thân mật cao nhất có `from` ≤ điểm (mức theo thứ tự tăng dần); null nếu không có mức nào. */
export function affinityTierOf(data: GameData, affinity: number): AffinityTierDef | null {
  let found: AffinityTierDef | null = null
  for (const tier of Object.values(data.affinityTiers)) {
    if (tier.from > affinity) break
    found = tier
  }
  return found
}
