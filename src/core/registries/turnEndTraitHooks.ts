// Hook trait cuối lượt và trạng thái (mục "Trait cuối lượt và trạng thái" ở battle-traits.md): gây mất máu
// cho địch trên sân, tự mất máu khi máu thấp, tự chữa trạng thái theo tỉ lệ, chữa trạng thái khi
// rời sân (kiểu Natural Cure), miễn sát thương gián tiếp (kiểu Magic Guard). Cùng quy ước với
// traitHooks.ts: % và tỉ lệ nhân hệ số cấp (tỉ lệ kẹp 100); ngưỡng máu và hook bật / tắt không đổi.

import { asObject, checkNumber } from '../shared'
import type { TraitHookHandler } from './traitHooks'
import { checkHpThreshold, isAtOrBelow, validateEmptyParams } from './traitHookUtils'

/** Hook chỉ có một % dương. */
function validatePositivePercent(params: unknown): string[] {
  const obj = asObject(params)
  return obj ? checkNumber(obj.percent, 'percent', Number.MIN_VALUE) : ['params phải là object']
}

// ---------- turnEndDamageFoes: cuối lượt mọi địch trên sân mất % max HP của chúng ----------

const turnEndDamageFoes: TraitHookHandler = {
  validateParams: validatePositivePercent,
  foeTurnEndDamagePercent(params, scale) {
    return (params as { percent: number }).percent * scale
  }
}

// ---------- turnEndSelfDamageWhileLowHp: cuối lượt máu ≤ ngưỡng thì tự mất % max HP ----------

interface SelfDamageParams {
  hpBelowPercent: number
  percent: number
}

const turnEndSelfDamageWhileLowHp: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkHpThreshold(obj.hpBelowPercent, 'hpBelowPercent'),
      ...checkNumber(obj.percent, 'percent', Number.MIN_VALUE)
    ]
  },
  selfTurnEndDamagePercent(params, scale, hpRatio) {
    const { hpBelowPercent, percent } = params as SelfDamageParams
    return isAtOrBelow(hpRatio, hpBelowPercent) ? percent * scale : 0
  }
}

// ---------- turnEndCureStatus: cuối lượt có tỉ lệ chữa mọi trạng thái (kiểu Shed Skin) ----------

const turnEndCureStatus: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj
      ? checkNumber(obj.chance, 'chance', Number.MIN_VALUE, 100)
      : ['params phải là object']
  },
  turnEndCureChance(params, scale) {
    return Math.min(100, (params as { chance: number }).chance * scale)
  }
}

// ---------- cureStatusOnLeave: rời sân còn sống / hết trận thì chữa mọi trạng thái ----------

const cureStatusOnLeave: TraitHookHandler = {
  validateParams: validateEmptyParams,
  curesStatusOnLeave: () => true
}

// ---------- healOnLeave: rời sân còn sống thì hồi % max HP (Regenerator) ----------

const healOnLeave: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj
      ? checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100)
      : ['params phải là object']
  },
  leaveHealPercent: (params, scale) =>
    Math.min(100, (params as { percent: number }).percent * scale)
}

// ---------- indirectDamageImmunity: không mất máu vì nguồn gián tiếp (kiểu Magic Guard) ----------

const indirectDamageImmunity: TraitHookHandler = {
  validateParams: validateEmptyParams,
  immuneToIndirectDamage: () => true
}

export const TURN_END_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  healOnLeave,
  turnEndDamageFoes,
  turnEndSelfDamageWhileLowHp,
  turnEndCureStatus,
  cureStatusOnLeave,
  indirectDamageImmunity
}
