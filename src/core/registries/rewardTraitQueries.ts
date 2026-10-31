// Tra cứu hook trait phần thưởng (rewardTraitHooks.ts) trên một nhóm quái. Dùng khi thắng trận
// (battle/outcome.ts): tiền, EXP, rơi đồ, trứng; khi breed: truyền tính cách.

import { STAT_NAMES, type GameData, type Monster, type PartialStats } from '../model'
import { forEachTraitHook, hasTraitFlag, type TraitHookHandler } from './traitHooks'
import { percentToMultiplier } from './traitHookUtils'

/** Tổng % một pha trên mọi trait của mọi quái (cộng dồn giữa các quái). */
function sumPercent(
  data: GameData,
  monsters: readonly Monster[],
  read: (handler: TraitHookHandler, params: unknown, scale: number) => number | undefined
): number {
  let total = 0
  for (const monster of monsters) {
    forEachTraitHook(data, monster, (handler, params, scale) => {
      total += read(handler, params, scale) ?? 0
    })
  }
  return total
}

/** Hệ số nhân tỉ lệ rơi đồ từ trait của `monsters` (kiểu Pickup, cộng dồn). */
export const traitDropMultiplier = (data: GameData, monsters: readonly Monster[]): number =>
  percentToMultiplier(
    sumPercent(data, monsters, (handler, params, scale) =>
      handler.dropChancePercent?.(params, scale)
    )
  )

/** Hệ số nhân tiền thưởng từ trait của `monsters` (cộng dồn, không xuống dưới 0). */
export const traitMoneyMultiplier = (data: GameData, monsters: readonly Monster[]): number =>
  percentToMultiplier(
    sumPercent(data, monsters, (handler, params, scale) => handler.moneyPercent?.(params, scale))
  )

/**
 * Hệ số nhân EXP quái nhận theo trait của chính nó, cộng `extraPercent` của nguồn khác cùng kiểu
 * (linh dịch) vào cùng tổng % (không xuống dưới 0).
 */
export const traitExpMultiplier = (data: GameData, monster: Monster, extraPercent = 0): number =>
  percentToMultiplier(
    extraPercent +
      sumPercent(data, [monster], (handler, params, scale) =>
        handler.expGainPercent?.(params, scale)
      )
  )

/** Số trận trứng giảm thêm mỗi trận thắng: lớn nhất trong `monsters`, không cộng dồn. */
export function traitEggHatchExtra(data: GameData, monsters: readonly Monster[]): number {
  let extra = 0
  for (const monster of monsters) {
    forEachTraitHook(data, monster, (handler, params) => {
      extra = Math.max(extra, handler.eggHatchExtra?.(params) ?? 0)
    })
  }
  return extra
}

/** Quái truyền tính cách cho con khi breed (lắp Bất Biến Thạch; docs/rules/natures.md). */
export const passesNature = (data: GameData, monster: Monster): boolean =>
  hasTraitFlag(data, monster, (handler, params) => handler.passesNature?.(params))

/**
 * Điểm nỗ lực cộng thêm cho mỗi quái bị hạ / bị bắt, từ hook của quái nhận (kiểu Power Weight;
 * cộng dồn giữa các nguồn).
 */
export function traitEffortBonus(data: GameData, monster: Monster): PartialStats {
  const bonus: PartialStats = {}
  forEachTraitHook(data, monster, (handler, params) => {
    const gained = handler.effortBonus?.(params)
    if (!gained) return
    for (const stat of STAT_NAMES) {
      const amount = gained[stat]
      if (amount !== undefined) bonus[stat] = (bonus[stat] ?? 0) + amount
    }
  })
  return bonus
}

/** Hệ số nhân điểm nỗ lực quái nhận theo hook của chính nó (kiểu Macho Brace; không dưới 0). */
export const traitEffortMultiplier = (data: GameData, monster: Monster): number =>
  percentToMultiplier(
    sumPercent(data, [monster], (handler, params, scale) =>
      handler.effortGainPercent?.(params, scale)
    )
  )
