// Synergy của skill (mục "Synergy" ở skill-synergy-hold.md): skill mạnh hơn khi có đồng đội còn sống
// trên sân mang một hệ trong partnerElementIds (hệ hiện tại, kể cả Tera). Cờ `blocksSynergy` (Isolated,
// Loneliness của Temtem) tắt synergy của quái dùng / đồng đội; cờ `grantsSynergy` (Superconductivity) cho
// đồng đội luôn khớp hệ. Dùng chung cho đánh thật, công thức sát thương (rawDamage) và AI.

import { forEachTraitHook, hasAbilityFlag } from '../registries'
import type { GameData, Monster, MonsterBattleContext, Skill } from '../model'

/** Bối cảnh xét synergy: quái dùng, đồng đội trên sân (có thể gồm chính nó), bối cảnh trận. */
export interface SynergyScene {
  data: GameData
  user: Monster
  allies: readonly Monster[]
  ctx?: MonsterBattleContext
}

/** Đồng đội đầu tiên làm synergy của skill có tác dụng; null = không có (hoặc skill không có). */
export function synergyPartner(scene: SynergyScene, skill: Skill): Monster | null {
  const synergy = skill.synergy
  if (!synergy) return null
  const { data, user, allies, ctx } = scene
  if (hasAbilityFlag(data, user, 'blocksSynergy', ctx)) return null
  return (
    allies.find(
      (ally) =>
        ally.id !== user.id &&
        !hasAbilityFlag(data, ally, 'blocksSynergy') &&
        (ally.elementIds.some((elementId) => synergy.partnerElementIds.includes(elementId)) ||
          hasAbilityFlag(data, ally, 'grantsSynergy'))
    ) ?? null
  )
}

/**
 * Hệ số power của synergy (1 khi không có tác dụng): % của skill, cộng hook `synergyBoost` của quái dùng
 * (kể cả hào quang của đồng đội; Synergy Adept / Master của Temtem).
 */
export function synergyPowerMultiplier(scene: SynergyScene, skill: Skill): number {
  if (!skill.synergy || synergyPartner(scene, skill) === null) return 1
  let boost = 0
  forEachTraitHook(
    scene.data,
    scene.user,
    (handler, params, scale) => {
      boost += handler.synergyBoostPercent?.(params, scale) ?? 0
    },
    scene.ctx
  )
  return (1 + (skill.synergy.powerBonusPercent ?? 0) / 100) * (1 + boost / 100)
}

/**
 * Skill khi dùng: synergy có tác dụng thì `effects` cộng thêm hiệu ứng synergy (power cộng ở công
 * thức sát thương); không thì giữ nguyên.
 */
export function withSynergyEffects(scene: SynergyScene, skill: Skill): Skill {
  const extra = skill.synergy?.effects
  if (!extra || synergyPartner(scene, skill) === null) return skill
  return { ...skill, effects: [...skill.effects, ...extra] }
}
