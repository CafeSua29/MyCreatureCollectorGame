// Hook trait lượt và hành động (mục "Trait lượt và hành động" ở battle-traits.md): mất lượt theo tỉ lệ
// hoặc xen kẽ (kiểu Truant), dùng skill ngẫu nhiên, đi sau trong cùng mức priority (Stall), cộng
// priority theo loại skill (Prankster), chạy trốn (kiểu Run Away) và tự bỏ chạy khi máu thấp
// (mục "Trait chạy trốn"), đi trước theo tỉ lệ trong cùng mức priority (Quick Claw). Cùng quy ước với traitHooks.ts: tỉ lệ nhân hệ số cấp, kẹp
// 100; priority và hook bật / tắt không đổi theo cấp.

import { asObject, checkEnumList, checkInteger, checkNumber } from '../shared'
import { SKILL_CATEGORIES, type Skill, type SkillCategory } from '../model'
import type { TraitHookHandler } from './traitHooks'
import { checkHpThreshold, isAtOrBelow, validateEmptyParams } from './traitHookUtils'

export const PRIORITY_CATEGORIES = [...SKILL_CATEGORIES, 'any'] as const
/** Loại skill được cộng priority; any = mọi skill. */
export type PriorityCategory = (typeof PRIORITY_CATEGORIES)[number]

/** Hook chỉ có một tỉ lệ % (> 0, ≤ 100). */
function validateChance(params: unknown): string[] {
  const obj = asObject(params)
  return obj ? checkNumber(obj.chance, 'chance', Number.MIN_VALUE, 100) : ['params phải là object']
}

/** Tỉ lệ đã nhân hệ số cấp, kẹp 100. */
const scaledChance = (params: unknown, scale: number): number =>
  Math.min(100, (params as { chance: number }).chance * scale)

// ---------- skipTurnChance: % mất lượt khi dùng skill ----------

const skipTurnChance: TraitHookHandler = {
  validateParams: validateChance,
  skipTurnChancePercent: scaledChance
}

// ---------- skipEveryOtherTurn: mất lượt xen kẽ từ lượt thứ hai trên sân (kiểu Truant) ----------

const skipEveryOtherTurn: TraitHookHandler = {
  validateParams: validateEmptyParams,
  skipsAlternateTurns: () => true
}

// ---------- randomSkillChance: % dùng skill ngẫu nhiên thay lệnh đã chọn ----------

const randomSkillChance: TraitHookHandler = {
  validateParams: validateChance,
  randomSkillChancePercent: scaledChance
}

// ---------- actLast: đi sau mọi quái không mang trait trong cùng mức priority (Stall) ----------

const actLast: TraitHookHandler = {
  validateParams: validateEmptyParams,
  actsLast: () => true
}

// ---------- priorityModifier: cộng priority cho skill theo loại (Prankster) ----------

interface PriorityModifierParams {
  skillCategory: PriorityCategory
  amount: number
  /** Skill được cộng priority (amount > 0) thất bại lên quái phe địch mang hệ này (Prankster: Bóng tối). */
  failsAgainstElementIds?: string[]
}

const priorityModifier: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = (PRIORITY_CATEGORIES as readonly unknown[]).includes(obj.skillCategory)
      ? []
      : [`skillCategory phải là một trong: ${PRIORITY_CATEGORIES.join(', ')}`]
    issues.push(...checkInteger(obj.amount, 'amount'))
    if (obj.amount === 0) issues.push('amount phải khác 0')
    if (obj.failsAgainstElementIds !== undefined) {
      const elementIds = Object.keys(data.elements)
      issues.push(
        ...checkEnumList(obj.failsAgainstElementIds, 'failsAgainstElementIds', elementIds)
      )
    }
    return issues
  },
  priorityBonus(params, category: SkillCategory) {
    const { skillCategory, amount } = params as PriorityModifierParams
    return skillCategory === 'any' || skillCategory === category ? amount : 0
  },
  boostFailsAgainst(params, category: SkillCategory, targetElementIds) {
    const { amount, failsAgainstElementIds } = params as PriorityModifierParams
    if (amount <= 0 || !failsAgainstElementIds) return false
    if (this.priorityBonus?.(params, category) === 0) return false
    return targetElementIds.some((id) => failsAgainstElementIds.includes(id))
  }
}

// ---------- conditionalPriority: priority theo hệ skill / máu đầy / skill hồi máu ----------

interface ConditionalPriorityParams {
  amount: number
  /** Chỉ skill các hệ này (Gale Wings: Bay). */
  elementIds?: string[]
  /** Chỉ khi máu đầy (Gale Wings). */
  fullHp?: true
  /** Chỉ skill hồi máu: có hiệu ứng heal / drain (Triage). */
  healing?: true
}

/** Skill hồi máu (Triage): hiệu ứng heal / drain, hoặc spell hồi máu. */
const isHealingSkill = (skill: Skill): boolean =>
  skill.effects.some((effect) => effect.type === 'heal' || effect.type === 'drain') ||
  ((skill.spell?.after ?? []) as { do?: string }[]).some((effect) => effect.do === 'heal')

const conditionalPriority: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkInteger(obj.amount, 'amount')
    if (obj.elementIds !== undefined) {
      issues.push(...checkEnumList(obj.elementIds, 'elementIds', Object.keys(data.elements)))
    }
    for (const flag of ['fullHp', 'healing'] as const) {
      if (obj[flag] !== undefined && obj[flag] !== true) issues.push(`${flag} chỉ được là true`)
    }
    return issues
  },
  conditionalPriorityBonus(params, skill, fullHp) {
    const p = params as ConditionalPriorityParams
    if (p.elementIds && !p.elementIds.includes(skill.elementId)) return 0
    if (p.fullHp && !fullHp) return 0
    if (p.healing && !isHealingSkill(skill)) return 0
    return p.amount
  }
}

// ---------- actFirstChance: % đi trước trong cùng mức priority (Quick Claw, Custap Berry) ----------

interface ActFirstChanceParams {
  chance: number
  /** Chỉ khi máu ≤ ngưỡng % (Custap Berry: 25%); bỏ trống = luôn. Không đổi theo cấp. */
  hpBelowPercent?: number
}

// Như Pokémon: không vượt mức priority cao hơn, chỉ đi trước mọi quái cùng mức (kể cả Stall).
const actFirstChance: TraitHookHandler = {
  heldUse: 'actFirst',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.chance, 'chance', Number.MIN_VALUE, 100)
    if (obj.hpBelowPercent !== undefined) {
      issues.push(...checkHpThreshold(obj.hpBelowPercent, 'hpBelowPercent'))
    }
    return issues
  },
  actFirstChancePercent(params, scale, hpRatio) {
    const { hpBelowPercent } = params as ActFirstChanceParams
    if (hpBelowPercent !== undefined && !isAtOrBelow(hpRatio, hpBelowPercent)) return undefined
    return scaledChance(params, scale)
  }
}

// ---------- choiceLock: chỉ dùng được skill đã dùng đầu tiên tới khi rời sân (Choice Band) ----------

// Như Pokémon: khóa vào skill dùng đầu tiên sau khi vào sân (kể cả skill bị trượt); rời sân thì hết
// khóa; món bị tắt (Magic Room) thì không khóa. Bật / tắt, không đổi theo cấp.
const choiceLock: TraitHookHandler = {
  validateParams: validateEmptyParams,
  locksChoice: () => true
}

// ---------- fleeChanceOverride: tỉ lệ chạy trốn khi quái đang trên sân (kiểu Run Away) ----------

const fleeChanceOverride: TraitHookHandler = {
  validateParams: validateChance,
  fleeChancePercent: scaledChance
}

// ---------- fleeWhenLowHp: cuối lượt máu ≤ ngưỡng thì % tự bỏ chạy (Bản năng sinh tồn) ----------

interface FleeWhenLowHpParams {
  hpBelowPercent: number
  chance: number
}

const fleeWhenLowHp: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkHpThreshold(obj.hpBelowPercent, 'hpBelowPercent'),
      ...checkNumber(obj.chance, 'chance', Number.MIN_VALUE, 100)
    ]
  },
  lowHpFleeChancePercent(params, scale, hpRatio) {
    const { hpBelowPercent } = params as FleeWhenLowHpParams
    return isAtOrBelow(hpRatio, hpBelowPercent) ? scaledChance(params, scale) : undefined
  }
}

export const ACTION_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  conditionalPriority,
  skipTurnChance,
  skipEveryOtherTurn,
  randomSkillChance,
  actLast,
  priorityModifier,
  actFirstChance,
  choiceLock,
  fleeChanceOverride,
  fleeWhenLowHp
}
