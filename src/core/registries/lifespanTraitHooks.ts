// Hook trait thọ nguyên (mục "Tuổi và thọ nguyên" ở lifespan.md): % thọ nguyên (Trường thọ /
// Đoản mệnh). Gộp vào TRAIT_HOOKS; LIFESPAN_MODIFIERS (lifespan.ts) cộng % của mọi hook này.

import { asObject, checkNumber } from '../shared'
import type { TraitHookHandler } from './traitHooks'

// ---------- lifespanPercent: % thọ nguyên của quái mang trait (âm = bớt) ----------

const lifespanPercent: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.percent, 'percent')
    if (obj.percent === 0) issues.push('percent phải khác 0')
    return issues
  },
  lifespanPercent: (params, scale) => (params as { percent: number }).percent * scale
}

export const LIFESPAN_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  lifespanPercent
}
