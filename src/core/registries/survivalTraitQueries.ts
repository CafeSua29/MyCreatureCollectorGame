// Tra cứu hook trait sống sót (survivalTraitHooks.ts) trên một quái. Dùng cho trận
// (battle/survival.ts, loseHp) và AI.

import type { GameData, Monster, MonsterBattleContext } from '../model'
import type { LethalSurvival } from './survivalTraitHooks'
import { forEachTraitHook, type HookSourceKind } from './traitHooks'

/** Các cách trụ lại đang thỏa điều kiện của quái, theo thứ tự trait rồi hook. */
export function traitLethalSurvivals(
  data: GameData,
  monster: Monster,
  { fullHp }: { fullHp: boolean },
  ctx?: MonsterBattleContext
): (LethalSurvival & { traitId: string; source: HookSourceKind })[] {
  const result: (LethalSurvival & { traitId: string; source: HookSourceKind })[] = []
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale, traitId, source) => {
      const survival = handler.lethalSurvival?.(params, scale, { fullHp })
      if (survival) result.push({ ...survival, traitId, source: source.kind })
    },
    ctx
  )
  return result
}

/** % max HP quái sống lại khi hồi sinh (lớn nhất giữa các trait); null = không có. */
export function traitRevive(
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): { hpPercent: number; traitId: string } | null {
  let best: { hpPercent: number; traitId: string } | null = null
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale, traitId) => {
      const hpPercent = handler.revivePercent?.(params, scale)
      if (hpPercent !== undefined && (best === null || hpPercent > best.hpPercent)) {
        best = { hpPercent, traitId }
      }
    },
    ctx
  )
  return best
}
