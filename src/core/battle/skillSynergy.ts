// Synergy của skill (mục "Synergy" ở battle.md): skill mạnh hơn khi có đồng đội còn sống trên sân
// mang một hệ trong partnerElementIds (hệ hiện tại, kể cả Tera). Dùng chung cho đánh thật, công
// thức sát thương (rawDamage) và AI.

import type { Monster, Skill } from '../model'

/** Đồng đội đầu tiên làm synergy của skill có tác dụng; null = không có (hoặc skill không có). */
export function synergyPartner(skill: Skill, allies: readonly Monster[]): Monster | null {
  const synergy = skill.synergy
  if (!synergy) return null
  return (
    allies.find((ally) =>
      ally.elementIds.some((elementId) => synergy.partnerElementIds.includes(elementId))
    ) ?? null
  )
}

/** Hệ số power của synergy (1 khi không có tác dụng). */
export function synergyPowerMultiplier(skill: Skill, allies: readonly Monster[]): number {
  const bonus = skill.synergy?.powerBonusPercent
  if (bonus === undefined || synergyPartner(skill, allies) === null) return 1
  return 1 + bonus / 100
}

/**
 * Skill khi dùng: synergy có tác dụng thì `effects` cộng thêm hiệu ứng synergy (power cộng ở công
 * thức sát thương); không thì giữ nguyên.
 */
export function withSynergyEffects(skill: Skill, allies: readonly Monster[]): Skill {
  const extra = skill.synergy?.effects
  if (!extra || synergyPartner(skill, allies) === null) return skill
  return { ...skill, effects: [...skill.effects, ...extra] }
}
