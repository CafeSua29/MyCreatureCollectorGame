// Tra cứu hook trait cuối lượt và trạng thái (turnEndTraitHooks.ts) và hút skill theo hệ
// (absorbElement ở fieldTraitHooks.ts) trên một quái. Dùng cho trận (battle/turnEndTraits.ts,
// battle/elementAbsorb.ts, các nguồn sát thương gián tiếp), công thức sát thương và AI.

import type { GameData, Monster, MonsterBattleContext, StageStat } from '../model'
import { sumByTrait, type TraitPercentTotal } from './hitTraitQueries'
import type { TraitChance } from './actionTraitQueries'
import { forEachTraitHook, hasTraitFlag } from './traitHooks'
import { percentToMultiplier } from './traitHookUtils'

/** % max HP mỗi địch trên sân mất cuối lượt vì trait của quái này. */
export const traitFoeTurnEndDamage = (
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): TraitPercentTotal =>
  sumByTrait(
    data,
    monster,
    (handler, params, scale) => handler.foeTurnEndDamagePercent?.(params, scale),
    ctx
  )

/** % max HP quái tự mất cuối lượt theo tỉ lệ máu hiện tại. */
export const traitSelfTurnEndDamage = (
  data: GameData,
  monster: Monster,
  hpRatio: number,
  ctx?: MonsterBattleContext
): TraitPercentTotal =>
  sumByTrait(
    data,
    monster,
    (handler, params, scale) => handler.selfTurnEndDamagePercent?.(params, scale, hpRatio),
    ctx
  )

/** Các tỉ lệ tự chữa trạng thái cuối lượt, theo thứ tự trait rồi hook. */
export function traitTurnEndCureChances(
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): TraitChance[] {
  const result: TraitChance[] = []
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale, traitId, source) => {
      const chance = handler.turnEndCureChance?.(params, scale)
      if (chance !== undefined) result.push({ chance, traitId, source: source.kind })
    },
    ctx
  )
  return result
}

/** Trait chữa trạng thái khi rời sân (kiểu Natural Cure): id trait đầu tiên, hoặc null. */
export function cureOnLeaveTraitId(
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): string | null {
  let found: string | null = null
  forEachTraitHook(
    data,
    monster,
    (handler, params, _scale, traitId) => {
      if (found === null && handler.curesStatusOnLeave?.(params)) found = traitId
    },
    ctx
  )
  return found
}

/** Tổng % max HP hồi khi rời sân (Regenerator) và trait đầu tiên có hook đó; null = không có. */
export function leaveHeal(
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): { percent: number; traitId: string } | null {
  let percent = 0
  let traitId: string | null = null
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale, id) => {
      const amount = handler.leaveHealPercent?.(params, scale) ?? 0
      if (amount <= 0) return
      percent += amount
      traitId ??= id
    },
    ctx
  )
  return traitId === null ? null : { percent: Math.min(100, percent), traitId }
}

/** Quái không mất máu vì nguồn gián tiếp (kiểu Magic Guard). */
export const isIndirectDamageImmune = (
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): boolean =>
  hasTraitFlag(data, monster, (handler, params) => handler.immuneToIndirectDamage?.(params), ctx)

/** Quái hút skill hệ `elementId`: % hồi (cộng, kẹp 100), trait hút và trait được tăng sát thương. */
export interface Absorption {
  healPercent: number
  traitIds: string[]
  boostTraitIds: string[]
  stages: { stat: StageStat; delta: number }[]
}

/** Các trait hút skill hệ `elementId` của quái; null = không hút. */
export function traitAbsorption(
  data: GameData,
  monster: Monster,
  elementId: string,
  ctx?: MonsterBattleContext
): Absorption | null {
  const result: Absorption = { healPercent: 0, traitIds: [], boostTraitIds: [], stages: [] }
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale, traitId) => {
      const effect = handler.absorbs?.(params, scale, elementId)
      if (!effect) return
      result.healPercent = Math.min(100, result.healPercent + effect.healPercent)
      if (!result.traitIds.includes(traitId)) result.traitIds.push(traitId)
      result.stages.push(...effect.stages)
      if (effect.boosts && !result.boostTraitIds.includes(traitId))
        result.boostTraitIds.push(traitId)
    },
    ctx
  )
  return result.traitIds.length > 0 ? result : null
}

/**
 * Hệ số tăng sát thương skill hệ `elementId` từ các trait đã hút (`boostedTraitIds`, kiểu Flash
 * Fire); nhiều trait nhân dồn như mọi hệ số trait.
 */
export function absorbBoostMultiplier(
  data: GameData,
  monster: Monster,
  { boostedTraitIds, elementId }: { boostedTraitIds: readonly string[]; elementId: string },
  ctx?: MonsterBattleContext
): number {
  if (boostedTraitIds.length === 0) return 1
  let multiplier = 1
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale, traitId) => {
      if (!boostedTraitIds.includes(traitId) || !handler.absorbBoostPercent) return
      multiplier *= percentToMultiplier(handler.absorbBoostPercent(params, scale, elementId))
    },
    ctx
  )
  return multiplier
}
