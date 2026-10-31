// Hook trait của công thức sát thương, chí mạng và trúng đòn (mục "Sát thương" ở battle.md):
// sát thương theo hệ / máu / khắc chế / sức mạnh skill, bỏ qua thủ, STAB, chí mạng, accuracy, né.
// Cùng quy ước với traitHooks.ts. Quy ước cấp (mục "Trait" ở stats-traits.md): chỉ nhân % và tỉ lệ;
// ngưỡng điều kiện (hpBelowPercent, maxPower) và hook bật / tắt không đổi theo cấp.

import { asObject, checkInteger, checkNumber } from '../shared'
import type { TraitHookHandler } from './traitHooks'
import { checkIdList } from './paramChecks'
import {
  checkHpThreshold,
  isAtOrBelow,
  percentToMultiplier,
  validateEmptyParams
} from './traitHookUtils'

/** Hook chỉ có một tham số `percent` (số hữu hạn bất kỳ). */
function validatePercentOnly(params: unknown): string[] {
  const obj = asObject(params)
  return obj ? checkNumber(obj.percent, 'percent') : ['params phải là object']
}

const percentOf = (params: unknown): number => (params as { percent: number }).percent

// ---------- elementDamageDealt: tăng sát thương gây ra bằng skill các hệ (kiểu Blaze khi máu thấp) ----------

interface ElementDamageDealtParams {
  elementIds: string[]
  percent: number
  hpBelowPercent?: number
}

const elementDamageDealt: TraitHookHandler = {
  heldUse: 'damage',
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkNumber(obj.percent, 'percent'),
      ...checkIdList(obj.elementIds, 'elementIds', data.elements, { label: 'hệ' }),
      ...(obj.hpBelowPercent === undefined
        ? []
        : checkHpThreshold(obj.hpBelowPercent, 'hpBelowPercent'))
    ]
  },
  modifyDamageDealt(params, scale, { skill, attackerHpRatio }) {
    const { elementIds, percent, hpBelowPercent } = params as ElementDamageDealtParams
    if (!elementIds.includes(skill.elementId)) return 1
    if (hpBelowPercent !== undefined && !isAtOrBelow(attackerHpRatio, hpBelowPercent)) return 1
    return percentToMultiplier(percent * scale)
  }
}

// ---------- damageVsLowHp: tăng sát thương lên mục tiêu máu thấp ----------

interface DamageVsLowHpParams {
  hpBelowPercent: number
  percent: number
}

const damageVsLowHp: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkNumber(obj.percent, 'percent'),
      ...checkHpThreshold(obj.hpBelowPercent, 'hpBelowPercent')
    ]
  },
  modifyDamageDealt(params, scale, { defenderHpRatio }) {
    const { hpBelowPercent, percent } = params as DamageVsLowHpParams
    return isAtOrBelow(defenderHpRatio, hpBelowPercent) ? percentToMultiplier(percent * scale) : 1
  }
}

// ---------- damageTakenAtFullHp: đổi sát thương nhận khi đầy máu (kiểu Multiscale) ----------

const damageTakenAtFullHp: TraitHookHandler = {
  validateParams: validatePercentOnly,
  modifyDamageTaken(params, scale, { defender }) {
    return defender.damageTaken.isZero() ? percentToMultiplier(percentOf(params) * scale) : 1
  }
}

// ---------- effectivenessModifier: đổi sát thương theo khắc chế (kiểu Solid Rock, Tinted Lens) ----------

export const EFFECTIVENESS_SIDES = ['dealt', 'taken'] as const
export const EFFECTIVENESS_CONDITIONS = ['superEffective', 'notVeryEffective'] as const

interface EffectivenessModifierParams {
  side: (typeof EFFECTIVENESS_SIDES)[number]
  when: (typeof EFFECTIVENESS_CONDITIONS)[number]
  percent: number
  /** Chỉ skill các hệ này (kiểu berry kháng hệ); bỏ trống = mọi hệ. */
  elementIds?: string[]
}

/** Hệ số khắc chế khớp điều kiện: > 1 là khắc, (0, 1) là bị kháng; miễn nhiễm (0) không tính. */
const matchesEffectiveness = (
  when: EffectivenessModifierParams['when'],
  effectiveness: number
): boolean =>
  when === 'superEffective' ? effectiveness > 1 : effectiveness > 0 && effectiveness < 1

function effectivenessMultiplier(
  params: unknown,
  scale: number,
  side: EffectivenessModifierParams['side'],
  { effectiveness, elementId }: { effectiveness: number; elementId: string }
): number {
  const { side: ownSide, when, percent, elementIds } = params as EffectivenessModifierParams
  if (ownSide !== side || !matchesEffectiveness(when, effectiveness)) return 1
  if (elementIds && !elementIds.includes(elementId)) return 1
  return percentToMultiplier(percent * scale)
}

const effectivenessModifier: TraitHookHandler = {
  heldUse: 'damage',
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.percent, 'percent')
    if (obj.elementIds !== undefined) {
      issues.push(...checkIdList(obj.elementIds, 'elementIds', data.elements, { label: 'hệ' }))
    }
    if (!(EFFECTIVENESS_SIDES as readonly unknown[]).includes(obj.side)) {
      issues.push(`side phải là một trong ${EFFECTIVENESS_SIDES.join(', ')}`)
    }
    if (!(EFFECTIVENESS_CONDITIONS as readonly unknown[]).includes(obj.when)) {
      issues.push(`when phải là một trong ${EFFECTIVENESS_CONDITIONS.join(', ')}`)
    }
    return issues
  },
  modifyDamageDealt: (params, scale, { effectiveness, skill }) =>
    effectivenessMultiplier(params, scale, 'dealt', { effectiveness, elementId: skill.elementId }),
  modifyDamageTaken: (params, scale, { effectiveness, skill }) =>
    effectivenessMultiplier(params, scale, 'taken', { effectiveness, elementId: skill.elementId })
}

// ---------- lowPowerSkillBoost: tăng sát thương skill yếu (kiểu Technician) ----------

interface LowPowerSkillBoostParams {
  maxPower: number
  percent: number
}

const lowPowerSkillBoost: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [...checkNumber(obj.percent, 'percent'), ...checkNumber(obj.maxPower, 'maxPower', 0)]
  },
  // Sức mạnh sau môi trường (fieldModifiers của skill), như Pokémon xét sức mạnh đã đổi.
  modifyDamageDealt(params, scale, { power }) {
    const { maxPower, percent } = params as LowPowerSkillBoostParams
    return power <= maxPower ? percentToMultiplier(percent * scale) : 1
  }
}

// ---------- ignoreDefensePercent: bỏ qua % thủ của mục tiêu ----------

const ignoreDefensePercent: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent', 0, 100) : ['params phải là object']
  },
  defenseIgnoredPercent: (params, scale) => percentOf(params) * scale
}

// ---------- stabMultiplier: hệ số STAB riêng (kiểu Adaptability) ----------

const stabMultiplier: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.multiplier, 'multiplier', 1) : ['params phải là object']
  },
  // Cấp chỉ nhân phần tăng thêm: cấp 1 = multiplier, cấp 2 với ×2 thành ×2,2.
  stabMultiplier: (params, scale) => 1 + ((params as { multiplier: number }).multiplier - 1) * scale
}

// ---------- chí mạng ----------

/** +bậc chí mạng (kiểu Super Luck, như Pokémon); số bậc cố định, không nhân theo cấp trait. */
const critStage: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkInteger(obj.stages, 'stages', 1) : ['params phải là object']
  },
  critStages: (params) => (params as { stages: number }).stages
}

const critChanceModifier: TraitHookHandler = {
  validateParams: validatePercentOnly,
  critChancePercent: (params, scale) => percentOf(params) * scale
}

const critDamageModifier: TraitHookHandler = {
  validateParams: validatePercentOnly,
  critDamagePercent: (params, scale) => percentOf(params) * scale
}

const critImmunity: TraitHookHandler = {
  validateParams: validateEmptyParams,
  blocksCritical: () => true
}

// ---------- accuracy và né đòn ----------

const accuracyModifier: TraitHookHandler = {
  validateParams: validatePercentOnly,
  accuracyPercent: (params, scale) => percentOf(params) * scale
}

const evasion: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent', 0, 100) : ['params phải là object']
  },
  evasionPercent: (params, scale) => percentOf(params) * scale
}

export const COMBAT_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  elementDamageDealt,
  damageVsLowHp,
  damageTakenAtFullHp,
  effectivenessModifier,
  lowPowerSkillBoost,
  ignoreDefensePercent,
  stabMultiplier,
  critStage,
  critChanceModifier,
  critDamageModifier,
  critImmunity,
  accuracyModifier,
  evasion
}
