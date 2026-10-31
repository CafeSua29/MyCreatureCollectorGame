// Hook trait cuồng bạo (docs/rules/frenzy.md): ngưỡng HP cộng thêm (Cuồng tính), không bao giờ
// cuồng bạo (Điềm tĩnh). Gộp vào TRAIT_HOOKS; frenzyThreshold (frenzy.ts) đọc các hook này.

import { asObject, checkNumber } from '../shared'
import type { TraitHookHandler } from './traitHooks'
import { validateEmptyParams } from './traitHookUtils'

// ---------- frenzyThresholdBonus: ngưỡng HP kích hoạt cuồng bạo cộng thêm (điểm %) ----------

const frenzyThresholdBonus: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent', Number.MIN_VALUE) : ['params phải là object']
  },
  frenzyThresholdPercent: (params, scale) => (params as { percent: number }).percent * scale
}

// ---------- frenzyImmune: không bao giờ cuồng bạo ----------

const frenzyImmune: TraitHookHandler = {
  validateParams: validateEmptyParams,
  preventsFrenzy: () => true
}

export const FRENZY_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  frenzyThresholdBonus,
  frenzyImmune
}
