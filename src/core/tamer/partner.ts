// Kỹ năng đồng hành (docs/rules/partner-skills.md): quái ô 0 của đội, còn sống, cho ngự thú sư buff
// theo kỹ năng của nó (race mặc định, loài ghi đè), mạnh dần theo bậc thân mật. Điểm duy nhất để
// hỏi "đang có buff đồng hành nào, bao nhiêu": nơi dùng (bắt, thưởng, gặp quái, chạy trốn, trận)
// chỉ đọc kênh qua partnerAmount / partnerMultiplier.

import type { GameData, Monster, PartnerSkillDef, TeamBonus } from '../model'
import { getBaseSpecies, isFainted } from '../monster'
import {
  PARTNER_EFFECTS,
  affinityTierOf,
  isPartnerEffectType,
  partnerBattleHooks
} from '../registries'
import type { PartnerEffectType } from '../registries'

/** Kỹ năng đồng hành của quái: ghi đè của loài gốc, không có thì của race. */
export function partnerSkillIdOf(data: GameData, monster: Monster): string {
  return getBaseSpecies(data, monster)?.partnerSkillId ?? data.races[monster.raceId].partnerSkillId
}

/** Sức mạnh theo thân mật: 1 + strengthPerTier × bậc (mức đầu của affinityTiers.json là bậc 0). */
export function partnerStrength(data: GameData, monster: Monster): number {
  const tier = affinityTierOf(data, monster.affinity)
  const index = tier ? Object.keys(data.affinityTiers).indexOf(tier.id) : 0
  return 1 + data.config.partnerSkill.strengthPerTier * index
}

export interface ActivePartner {
  monster: Monster
  skill: PartnerSkillDef
  strength: number
}

/** Quái đồng hành đang có tác dụng: ô 0 của đội nếu còn sống; không thì null. */
export function activePartner(data: GameData, party: readonly Monster[]): ActivePartner | null {
  const monster = party[0]
  if (!monster || isFainted(data, monster)) return null
  return {
    monster,
    skill: data.partnerSkills[partnerSkillIdOf(data, monster)],
    strength: partnerStrength(data, monster)
  }
}

/** Tổng lượng một kênh ngoài trận của quái đồng hành (0 nếu không có / không có hiệu ứng đó). */
export function partnerAmount(
  data: GameData,
  party: readonly Monster[],
  type: PartnerEffectType
): number {
  const partner = activePartner(data, party)
  if (!partner) return 0
  let total = 0
  for (const effect of partner.skill.effects) {
    if (effect.type !== type || !isPartnerEffectType(effect.type)) continue
    const handler = PARTNER_EFFECTS[effect.type]
    if (handler.kind === 'amount') total += handler.amount(effect.params, partner.strength)
  }
  return total
}

/** Hệ số nhân của một kênh % (1 + % / 100, không dưới 0). */
export const partnerMultiplier = (
  data: GameData,
  party: readonly Monster[],
  type: PartnerEffectType
): number => Math.max(0, 1 + partnerAmount(data, party, type) / 100)

/**
 * Mục phối hợp đội trong trận của quái đồng hành: null nếu không có quái đồng hành còn sống hoặc kỹ
 * năng không có hiệu ứng trong trận.
 */
export function partnerTeamBonus(data: GameData, party: readonly Monster[]): TeamBonus | null {
  const partner = activePartner(data, party)
  if (!partner || partnerBattleHooks(partner.skill.effects).length === 0) return null
  return {
    kind: 'partner',
    id: partner.skill.id,
    monsterId: partner.monster.id,
    strength: partner.strength
  }
}
