// Hook trait khi trúng đòn / hạ gục (mục "Trait khi trúng đòn / hạ gục" ở battle-traits.md): hút máu,
// đánh trúng gây trạng thái (kiểu Poison Touch), bị đánh thì kẻ đánh dính trạng thái (Static) hoặc
// mất máu (Rough Skin), hạ ngay mục tiêu máu thấp, hồi máu khi hạ gục, phản đòn khi bị hạ gục
// (Aftermath), tăng tỉ lệ hiệu ứng phụ của skill (Serene Grace). Cùng quy ước với traitHooks.ts.
// Quy ước cấp: % và tỉ lệ nhân hệ số cấp (tỉ lệ trạng thái kẹp 100), ngưỡng máu không đổi.

import { asObject, checkNumber } from '../shared'
import type { GameData, SkillCategory } from '../model'
import type { TraitHookHandler } from './traitHooks'
import { checkHpThreshold } from './traitHookUtils'

export const HIT_CATEGORIES = ['physical', 'special', 'any'] as const
/** Loại skill gây sát thương kích hoạt hook; any = mọi skill gây sát thương. */
export type HitCategory = (typeof HIT_CATEGORIES)[number]

/** Một trạng thái hook có thể gây, tỉ lệ % (đã nhân hệ số cấp, kẹp 100). */
export interface StatusChance {
  statusId: string
  chance: number
}

/** Skill loại `category` có kích hoạt hook lọc theo `hitCategory` không (skill status thì không). */
export const matchesHitCategory = (hitCategory: HitCategory, category: SkillCategory): boolean =>
  category !== 'status' && (hitCategory === 'any' || hitCategory === category)

const checkHitCategory = (value: unknown): string[] =>
  (HIT_CATEGORIES as readonly unknown[]).includes(value)
    ? []
    : [`category phải là một trong: ${HIT_CATEGORIES.join(', ')}`]

/** Hook chỉ có một tham số % (> 0). */
function validatePositivePercent(params: unknown, field: string): string[] {
  const obj = asObject(params)
  return obj ? checkNumber(obj[field], field, Number.MIN_VALUE) : ['params phải là object']
}

// ---------- onHitApplyStatus / onAttackApplyStatus: gây trạng thái khi trúng đòn ----------

interface StatusOnHitParams {
  category: HitCategory
  statuses: StatusChance[]
}

function validateStatusOnHit(params: unknown, data: GameData): string[] {
  const obj = asObject(params)
  if (!obj) return ['params phải là object']
  const issues = checkHitCategory(obj.category)
  if (!Array.isArray(obj.statuses) || obj.statuses.length === 0) {
    return [...issues, 'statuses phải là danh sách không rỗng']
  }
  obj.statuses.forEach((entry, index) => {
    const status = asObject(entry)
    if (!status) {
      issues.push(`statuses[${index}] phải là object`)
      return
    }
    if (typeof status.statusId !== 'string' || !(status.statusId in data.statuses)) {
      issues.push(`statuses[${index}]: trạng thái không tồn tại "${String(status.statusId)}"`)
    }
    issues.push(...checkNumber(status.chance, `statuses[${index}].chance`, Number.MIN_VALUE, 100))
  })
  return issues
}

/** Trạng thái hook gây khi skill loại `category` trúng; tỉ lệ nhân hệ số cấp, kẹp 100. */
function statusesFor(params: unknown, scale: number, category: SkillCategory): StatusChance[] {
  const { category: hitCategory, statuses } = params as StatusOnHitParams
  if (!matchesHitCategory(hitCategory, category)) return []
  return statuses.map(({ statusId, chance }) => ({
    statusId,
    chance: Math.min(100, chance * scale)
  }))
}

/** Quái mang trait bị đánh trúng: quái đánh dính trạng thái (kiểu Static, Flame Body). */
const onHitApplyStatus: TraitHookHandler = {
  validateParams: validateStatusOnHit,
  hitStatuses: statusesFor
}

/** Quái mang trait đánh trúng: mục tiêu dính trạng thái (kiểu Poison Touch, đòn tẩm độc). */
const onAttackApplyStatus: TraitHookHandler = {
  validateParams: validateStatusOnHit,
  attackStatuses: statusesFor
}

// ---------- retaliateDamage: bị đánh thì quái đánh mất % max HP của nó (kiểu Rough Skin) ----------

interface RetaliateParams {
  category: HitCategory
  percentOfAttackerMaxHp: number
}

const retaliateDamage: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkHitCategory(obj.category),
      ...checkNumber(obj.percentOfAttackerMaxHp, 'percentOfAttackerMaxHp', Number.MIN_VALUE)
    ]
  },
  retaliatePercent(params, scale, category) {
    const { category: hitCategory, percentOfAttackerMaxHp } = params as RetaliateParams
    return matchesHitCategory(hitCategory, category) ? percentOfAttackerMaxHp * scale : 0
  }
}

// ---------- retaliateOnKnockout: bị hạ gục thì quái đánh mất % max HP (kiểu Aftermath) ----------

const retaliateOnKnockout: TraitHookHandler = {
  validateParams: (params) => validatePositivePercent(params, 'percentOfAttackerMaxHp'),
  knockedOutRetaliatePercent: (params, scale) =>
    (params as { percentOfAttackerMaxHp: number }).percentOfAttackerMaxHp * scale
}

// ---------- recoilOnAttack: tự mất % max HP sau mỗi skill gây sát thương (kiểu Life Orb) ----------

const recoilOnAttack: TraitHookHandler = {
  validateParams: (params) => validatePositivePercent(params, 'percent'),
  recoilPercent: (params, scale) => (params as { percent: number }).percent * scale
}

// ---------- healOnKnockout: hạ gục địch thì hồi % max HP ----------

const healOnKnockout: TraitHookHandler = {
  validateParams: (params) => validatePositivePercent(params, 'percent'),
  knockoutHealPercent: (params, scale) => (params as { percent: number }).percent * scale
}

// ---------- lifesteal: hồi % sát thương đã gây (như drain của skill) ----------

const lifesteal: TraitHookHandler = {
  validateParams: (params) => validatePositivePercent(params, 'percent'),
  lifestealPercent: (params, scale) => (params as { percent: number }).percent * scale
}

// ---------- executeLowHp: mục tiêu còn máu ≤ ngưỡng sau đòn thì gục ngay ----------

const executeLowHp: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkHpThreshold(obj.hpBelowPercent, 'hpBelowPercent') : ['params phải là object']
  },
  // Ngưỡng điều kiện không đổi theo cấp trait (quy ước cấp).
  executeBelowPercent: (params) => (params as { hpBelowPercent: number }).hpBelowPercent
}

// ---------- secondaryEffectChance: tăng tỉ lệ hiệu ứng phụ của skill (kiểu Serene Grace) ----------

// % âm giảm tỉ lệ; −100 tắt hẳn hiệu ứng phụ (Sheer Force).
const secondaryEffectChance: TraitHookHandler = {
  validateParams: (params) => {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent', -100) : ['params phải là object']
  },
  secondaryChancePercent: (params, scale) => (params as { percent: number }).percent * scale
}

export const HIT_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  onHitApplyStatus,
  onAttackApplyStatus,
  retaliateDamage,
  retaliateOnKnockout,
  healOnKnockout,
  recoilOnAttack,
  lifesteal,
  executeLowHp,
  secondaryEffectChance
}
