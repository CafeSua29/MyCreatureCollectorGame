// Hook trait phần thưởng ngoài trận (mục "Phần thưởng" ở battle.md, "Trứng" ở breeding-eggs.md):
// tỉ lệ rơi đồ (kiểu Pickup), EXP quái nhận, tiền thưởng, trứng nở nhanh hơn (kiểu Flame Body),
// truyền tính cách khi breed (Bất Biến Thạch, docs/rules/natures.md), điểm nỗ lực nhận khi thắng
// (Power Weight, Macho Brace; docs/rules/effort-values.md).
// Cùng quy ước với traitHooks.ts: % nhân hệ số cấp; số trận của trứng không đổi theo cấp.

import { STAT_NAMES, type PartialStats, type StatName } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import type { TraitHookHandler } from './traitHooks'
import { validateEmptyParams } from './traitHookUtils'

/** % khác 0 (âm = bớt). */
function validateNonZeroPercent(params: unknown): string[] {
  const obj = asObject(params)
  if (!obj) return ['params phải là object']
  const issues = checkNumber(obj.percent, 'percent')
  if (obj.percent === 0) issues.push('percent phải khác 0')
  return issues
}

const scaledPercent = (params: unknown, scale: number): number =>
  (params as { percent: number }).percent * scale

// ---------- extraDropChance: + % tỉ lệ rơi mọi món khi thắng (kiểu Pickup) ----------

const extraDropChance: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent', Number.MIN_VALUE) : ['params phải là object']
  },
  dropChancePercent: scaledPercent
}

// ---------- expRewardModifier: % EXP quái mang trait nhận ----------

const expRewardModifier: TraitHookHandler = {
  validateParams: validateNonZeroPercent,
  expGainPercent: scaledPercent
}

// ---------- moneyRewardModifier: % tiền thưởng khi thắng ----------

const moneyRewardModifier: TraitHookHandler = {
  validateParams: validateNonZeroPercent,
  moneyPercent: scaledPercent
}

// ---------- eggHatchBoost: trứng giảm thêm số trận mỗi trận thắng ----------

const eggHatchBoost: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkInteger(obj.extraCount, 'extraCount', 1) : ['params phải là object']
  },
  eggHatchExtra: (params) => (params as { extraCount: number }).extraCount
}

// ---------- affinityGainPercent: % lượng thân mật tăng (kiểu Soothe Bell) ----------

const affinityGainPercent: TraitHookHandler = {
  validateParams: validateNonZeroPercent,
  affinityGainPercent: scaledPercent
}

// ---------- inheritNature: con breeding nhận tính cách của quái mang hook (Bất Biến Thạch) ----------

const inheritNature: TraitHookHandler = {
  validateParams: validateEmptyParams,
  passesNature: () => true
}

// ---------- effortGainBonus: + điểm nỗ lực một chỉ số mỗi quái bị hạ (kiểu Power Weight) ----------

const effortGainBonus: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkInteger(obj.amount, 'amount', 1)
    if (!(STAT_NAMES as readonly unknown[]).includes(obj.stat)) {
      issues.push(`stat phải là chỉ số, nhận "${String(obj.stat)}"`)
    }
    return issues
  },
  // Số điểm cộng thẳng nên không nhân hệ số cấp (quy ước cấp: chỉ nhân % và tỉ lệ).
  effortBonus(params): PartialStats {
    const { stat, amount } = params as { stat: StatName; amount: number }
    return { [stat]: amount }
  }
}

// ---------- effortGainModifier: % điểm nỗ lực nhận khi thắng (kiểu Macho Brace) ----------

const effortGainModifier: TraitHookHandler = {
  validateParams: validateNonZeroPercent,
  effortGainPercent: scaledPercent
}

export const REWARD_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  extraDropChance,
  expRewardModifier,
  moneyRewardModifier,
  eggHatchBoost,
  affinityGainPercent,
  inheritNature,
  effortGainBonus,
  effortGainModifier
}
