// Tra cứu hook trait bậc trận (stageTraitHooks.ts) trên một quái: trait nào chặn hạ bậc, trait nào
// đổi bậc khi một sự kiện xảy ra. Dùng cho trận (battle/stageChanges.ts) và AI (statStage).

import type { GameData, Monster, MonsterBattleContext, StageStat } from '../model'
import type { StageTraitEffect, StageTraitEvent } from './stageTraitHooks'
import { forEachTraitHook } from './traitHooks'

/** Trait đầu tiên của quái chặn quái khác hạ bậc `stat`; null = không trait nào chặn. */
export function statLowerBlockingTrait(
  data: GameData,
  monster: Monster,
  stat: StageStat,
  ctx?: MonsterBattleContext
): string | null {
  let blocking: string | null = null
  forEachTraitHook(
    data,
    monster,
    (handler, params, _scale, traitId) => {
      if (blocking === null && handler.blocksStatLower?.(params, stat)) blocking = traitId
    },
    ctx
  )
  return blocking
}

/** Mọi lần đổi bậc trait của quái gây ra khi `event` xảy ra, theo thứ tự trait rồi hook. */
export function stageTraitEffects(
  data: GameData,
  monster: Monster,
  event: StageTraitEvent,
  ctx?: MonsterBattleContext
): { traitId: string; effect: StageTraitEffect }[] {
  const effects: { traitId: string; effect: StageTraitEffect }[] = []
  forEachTraitHook(
    data,
    monster,
    (handler, params, _scale, traitId) => {
      const effect = handler.stageOnEvent?.(params, event)
      if (effect) effects.push({ traitId, effect })
    },
    ctx
  )
  return effects
}
