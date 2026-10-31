// Tâm linh tương thông (docs/rules/tamer.md mục "Khế ước"): mức theo số ngày đã khế ước và thân mật.
// Điểm duy nhất tra mức (chỉ số ở statPercentSources, linh lực ở battle/tamerSkills).

import type { GameData, Monster, SoulLinkTier } from '../model'

/**
 * Mức tâm linh tương thông cao nhất quái đạt (đã khế ước, đủ số ngày và thân mật của mức); null nếu
 * chưa đạt mức nào. Tính chỉ từ quái (dùng được trong công thức chỉ số).
 */
export function soulLinkTier(
  data: GameData,
  monster: Pick<Monster, 'contractRealm' | 'contractDays' | 'affinity'>
): SoulLinkTier | null {
  if (monster.contractRealm === null) return null
  let best: SoulLinkTier | null = null
  for (const tier of data.config.tamer.contract.soulLinkTiers) {
    if (monster.contractDays >= tier.days && monster.affinity >= tier.minAffinity) best = tier
  }
  return best
}
