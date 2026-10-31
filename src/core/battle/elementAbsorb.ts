// Hút skill theo hệ (trait absorbElement, mục "Trait cuối lượt và trạng thái" ở battle-traits.md): skill
// của quái phe địch có hệ (sau môi trường) trait hút được thì mục tiêu không nhận sát thương hay
// hiệu ứng nào, được hồi máu và / hoặc tăng sát thương skill các hệ đó tới khi rời sân (kiểu Flash
// Fire). Xét trước accuracy như Pokémon, sau hiệu ứng theo phe chặn skill (guard).

import { getMaxHp, percentOfMaxHp } from '../monster'
import { skillInField, traitAbsorption, type Absorption } from '../registries'
import { minBig } from '../shared'
import type { GameData, Monster, Skill } from '../model'
import { Draft, log, sideOf, userField } from './draft'
import { heal } from './hpChanges'
import { applyStageChange } from './stageChanges'

/** Trait hút skill của `user` lên `target`; null = không hút (cùng phe hoặc không có trait). */
export function absorptionOf(
  data: GameData,
  d: Draft,
  { user, skill, target }: { user: Monster; skill: Skill; target: Monster }
): Absorption | null {
  if (sideOf(d, user.id) === sideOf(d, target.id)) return null
  const { elementId } = skillInField(data, userField(data, d, user), skill, user)
  return traitAbsorption(data, target, elementId)
}

/**
 * Mục tiêu hút skill thì ghi log trait, hồi máu, đánh dấu tăng sát thương (không cộng dồn) và trả
 * về true: skill không tác động lên mục tiêu này nữa.
 */
export function absorbSkill(
  data: GameData,
  d: Draft,
  strike: { user: Monster; skill: Skill; target: Monster }
): boolean {
  const absorption = absorptionOf(data, d, strike)
  if (absorption === null) return false
  const { target } = strike
  for (const traitId of absorption.traitIds) {
    log(d, { type: 'traitTriggered', monsterId: target.id, traitId })
  }
  if (absorption.healPercent > 0) {
    heal(data, d, target, percentOfMaxHp(getMaxHp(data, target), absorption.healPercent))
  }
  for (const { stat, delta } of absorption.stages) {
    applyStageChange(data, d, { targetId: target.id, stat, delta, cause: 'self' })
  }
  const volatile = d.battle.volatiles[target.id]
  if (volatile && absorption.boostTraitIds.length > 0) {
    const boosts = new Set([...(volatile.absorbBoosts ?? []), ...absorption.boostTraitIds])
    volatile.absorbBoosts = [...boosts]
  }
  return true
}

/**
 * Điểm AI khi nhắm skill vào địch hút được nó (null = không hút): ngược dấu với hồi máu cho địch
 * (healWeight × máu địch hồi được / max HP, như drain); không có sát thương hay hiệu ứng.
 */
export function absorbAiScore(
  data: GameData,
  d: Draft,
  strike: { user: Monster; skill: Skill; target: Monster }
): number | null {
  const absorption = absorptionOf(data, d, strike)
  if (absorption === null) return null
  const maxHp = getMaxHp(data, strike.target)
  const healed = minBig(percentOfMaxHp(maxHp, absorption.healPercent), strike.target.damageTaken)
  return -healed.div(maxHp).toNumber() * data.config.ai.healWeight
}
