// Âm / Dương hóa (docs/rules/polarity.md): điểm duy nhất cho các câu hỏi theo cực của quái mà
// registries cần (nguồn % chỉ số, hook trait cực tính, hệ số tương khắc trong sát thương). Đổi cực,
// tung cực, kiểm tra save ở monster/polarity.ts.

import type { GameData, Monster, PartialStats, TraitInstance } from '../model'

/** % chỉ số theo cực của quái (nguồn `polarity`); không cực thì không có mục nào. */
export function polarityStatPercent(data: GameData, monster: Monster): PartialStats {
  return monster.polarity ? { ...data.config.polarity.statPercents[monster.polarity.pole] } : {}
}

/** Trait cực tính của quái (luôn cấp 1); undefined nếu không cực. */
export const polarityTraitOf = (monster: Pick<Monster, 'polarity'>): TraitInstance | undefined =>
  monster.polarity ? { id: monster.polarity.traitId, level: 1 } : undefined

/**
 * Hệ số sát thương âm dương tương khắc: quái Âm đánh quái Dương (hoặc ngược lại) × (1 +
 * opposeBonus / 100); cùng cực hoặc một bên không cực thì 1.
 */
export function polarityDamageMultiplier(
  data: GameData,
  attacker: Pick<Monster, 'polarity'>,
  defender: Pick<Monster, 'polarity'>
): number {
  const from = attacker.polarity?.pole
  const to = defender.polarity?.pole
  if (from === undefined || to === undefined || from === to) return 1
  return 1 + data.config.polarity.opposeBonus / 100
}
