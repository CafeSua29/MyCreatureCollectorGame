// Ability đổi tác dụng berry của chính quái (mục "Berry" ở abilities.md): Ripen (hiệu ứng berry gấp
// đôi), Gluttony (berry "lúc nguy" ăn ở ½ máu thay vì ¼). Viết bằng cách đổi params hook của berry
// trước khi chạy, nên dữ liệu berry không phải biết ability.

import type { TraitHookDef } from '../model'
import type { AmountSpec, DslCondition, TraitEffect, TriggerDef } from './traitDsl'

/** Ngưỡng máu của berry "lúc nguy" (Liechi, Custap...) và ngưỡng mới khi có Gluttony (như Pokémon). */
const PINCH_PERCENT = 25
const GLUTTONY_PERCENT = 50

export interface BerryAdjust {
  /** Ripen: hồi máu, bậc, sát thương gấp đôi; berry kháng hệ ×¼ thay vì ×½. */
  ripe: boolean
  /** Gluttony: ngưỡng 25% thành 50%. */
  early: boolean
}

const doubleAmount = (amount: AmountSpec): AmountSpec =>
  'flat' in amount
    ? { ...amount, flat: amount.flat * 2 }
    : { ...amount, percent: amount.percent * 2 }

function ripenEffect(effect: TraitEffect): TraitEffect {
  switch (effect.do) {
    case 'heal':
    case 'damage':
      return { ...effect, amount: doubleAmount(effect.amount) }
    case 'stage':
      return { ...effect, delta: effect.delta * 2 }
    default:
      return effect
  }
}

const earlyCondition = (condition: DslCondition): DslCondition =>
  condition.if === 'hpBelow' && condition.percent === PINCH_PERCENT
    ? { ...condition, percent: GLUTTONY_PERCENT }
    : condition

function adjustTrigger(def: TriggerDef, { ripe, early }: BerryAdjust): TriggerDef {
  return {
    ...def,
    ...(def.when && early ? { when: def.when.map(earlyCondition) } : {}),
    effects: ripe ? def.effects.map(ripenEffect) : def.effects
  }
}

/** Hook berry sau khi áp Ripen / Gluttony của quái cầm (không có thì trả lại chính hook). */
export function adjustBerryHook(hook: TraitHookDef, adjust: BerryAdjust): TraitHookDef {
  if (!adjust.ripe && !adjust.early) return hook
  // Ép kiểu params theo `type` của hook: dữ liệu đã qua kiểm tra của chính hook đó lúc khởi động.
  switch (hook.type) {
    case 'trigger':
      return { ...hook, params: adjustTrigger(hook.params as TriggerDef, adjust) }
    case 'effectivenessModifier': {
      if (!adjust.ripe) return hook
      const params = hook.params as { percent: number }
      const multiplier = 1 + params.percent / 100
      return { ...hook, params: { ...params, percent: (multiplier * multiplier - 1) * 100 } }
    }
    case 'actFirstChance': {
      const params = hook.params as { hpBelowPercent?: number }
      return adjust.early && params.hpBelowPercent === PINCH_PERCENT
        ? { ...hook, params: { ...params, hpBelowPercent: GLUTTONY_PERCENT } }
        : hook
    }
    default:
      return hook
  }
}
