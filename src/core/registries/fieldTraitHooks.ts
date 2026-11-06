// Hook trait theo hệ và môi trường trong trận (mục "Môi trường" ở battle-environment.md): miễn nhiễm / giảm
// sát thương theo hệ, không chạm đất, chỉ số / hồi máu theo thời tiết và địa hình, đặt môi trường
// khi vào sân, miễn sát thương môi trường, hút skill theo hệ. Cùng quy ước với traitHooks.ts.

import { asObject, checkEnumList, checkInteger, checkNumber } from '../shared'
import type { FieldPlacement, GlobalFieldLayer, PartialStats, StageStat } from '../model'
import type { TraitHookHandler } from './traitHooks'
import { isLayerFieldIn } from './fieldIds'
import {
  checkFieldIdList,
  checkIdList,
  checkSetFieldParams,
  isBattleStageStat,
  isGlobalFieldLayer
} from './paramChecks'
import {
  percentToMultiplier,
  scaleStats,
  sumPercent,
  validateEmptyParams,
  validatePartialStats
} from './traitHookUtils'

// ---------- elementDamageTaken: tăng / giảm sát thương nhận từ skill các hệ (kiểu Thick Fat) ----------

interface ElementDamageTakenParams {
  elementIds: string[]
  percent: number
  /** Không áp cho đòn chí mạng (Resistance của Cassette Beasts). */
  exceptCritical?: true
}

const elementDamageTaken: TraitHookHandler = {
  heldUse: 'damage',
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkNumber(obj.percent, 'percent', -100),
      ...checkIdList(obj.elementIds, 'elementIds', data.elements, { label: 'hệ' }),
      ...(obj.exceptCritical === undefined || obj.exceptCritical === true
        ? []
        : ['exceptCritical chỉ được là true'])
    ]
  },
  modifyDamageTaken(params, scale, { skill, critical }) {
    const { elementIds, percent, exceptCritical } = params as ElementDamageTakenParams
    if (exceptCritical && critical) return 1
    return elementIds.includes(skill.elementId) ? percentToMultiplier(percent * scale) : 1
  },
  // −100% khai báo trong dữ liệu là miễn nhiễm thật (sát thương 0, kiểu Levitate). Hệ số đã nhân
  // cấp chạm 0 thì vẫn chỉ là hệ số (sát thương tối thiểu 1), như mọi trait giảm sát thương.
  immuneToElement(params, elementId) {
    const { elementIds, percent } = params as ElementDamageTakenParams
    return percent <= -100 && elementIds.includes(elementId)
  }
}

// ---------- blocksElementReactions: không chịu phản ứng hệ của skill các hệ (Resistance) ----------

const blocksElementReactions: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return checkIdList(obj.elementIds, 'elementIds', data.elements, { label: 'hệ' })
  },
  blocksElementReaction: (params, elementId) =>
    (params as { elementIds: string[] }).elementIds.includes(elementId)
}

// ---------- wallIgnoreChance: đòn tầm xa có % đi xuyên tường địch (Ricochet) ----------

const wallIgnoreChance: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100)
  },
  wallIgnoreChance: (params) => (params as { percent: number }).percent
}

// ---------- staminaMaxPercent / staminaCostPercent / overexertion: thể lực (stamina.md) ----------

const validateStaminaPercent = (params: unknown): string[] => {
  const obj = asObject(params)
  return obj ? checkNumber(obj.percent, 'percent', -100) : ['params phải là object']
}

const staminaMaxPercent: TraitHookHandler = {
  validateParams: validateStaminaPercent,
  staminaMaxPercent: (params, scale) => (params as { percent: number }).percent * scale
}

interface StaminaCostParams {
  percent: number
  /** Chỉ skill gây sát thương (power > 0; Efficient của Temtem). */
  damaging?: true
}

const staminaCostPercent: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...validateStaminaPercent(params),
      ...(obj.damaging === undefined || obj.damaging === true ? [] : ['damaging chỉ được là true'])
    ]
  },
  staminaCostPercent(params, scale, skill) {
    const { percent, damaging } = params as StaminaCostParams
    return damaging && skill.power <= 0 ? 0 : percent * scale
  }
}

interface OverexertionParams {
  hpPercent?: number
  skipsExhaustion?: true
  cannotFaint?: true
}

const OVEREXERTION_FLAGS = ['skipsExhaustion', 'cannotFaint'] as const

// Synergy Adept / Master của Temtem: synergy có tác dụng thì sát thương +%.
const synergyBoost: TraitHookHandler = {
  validateParams: (params) => {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent', Number.MIN_VALUE) : ['params phải là object']
  },
  synergyBoostPercent: (params, scale) => (params as { percent: number }).percent * scale
}

// Tireless của Temtem: giảm máu mất, không mất lượt; cannotFaint: máu mất không làm gục.
const overexertion: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = OVEREXERTION_FLAGS.flatMap((flag) =>
      obj[flag] === undefined || obj[flag] === true ? [] : [`${flag} chỉ được là true`]
    )
    if (obj.hpPercent !== undefined) issues.push(...checkNumber(obj.hpPercent, 'hpPercent', -100))
    if (obj.hpPercent === undefined && OVEREXERTION_FLAGS.every((flag) => !obj[flag])) {
      issues.push('cần ít nhất một trong hpPercent / skipsExhaustion / cannotFaint')
    }
    return issues
  },
  overexertion(params, scale) {
    const { hpPercent, skipsExhaustion, cannotFaint } = params as OverexertionParams
    return {
      hpPercent: (hpPercent ?? 0) * scale,
      skipsExhaustion: skipsExhaustion === true,
      cannotFaint: cannotFaint === true
    }
  }
}

// ---------- airborne: không đứng trên mặt đất (kiểu Levitate) ----------

// Đồ cầm kiểu Air Balloon: bay tới khi bị đánh trúng.
const airborne: TraitHookHandler = {
  heldUse: 'hit',
  validateParams: validateEmptyParams,
  isAirborne: () => true
}

// ---------- trapped: không đổi quái / chạy trốn được ----------

// Như Pokémon: hệ mang trapImmune (hệ Ma) không bị giữ chân (kiểm ở isMonsterTrapped).
// `elementIds`: chỉ giữ quái có một trong các hệ này (Magnet Pull: hệ Thép).
const trapped: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const extra = Object.keys(obj).filter((key) => key !== 'elementIds')
    if (extra.length > 0) return [`trapped chỉ có tham số elementIds (thừa: ${extra.join(', ')})`]
    return obj.elementIds === undefined
      ? []
      : checkIdList(obj.elementIds, 'elementIds', data.elements, { label: 'hệ' })
  },
  isTrapped: (params, elementIds) => {
    const only = (params as { elementIds?: string[] }).elementIds
    return !only || only.some((id) => elementIds.includes(id))
  }
}

// ---------- sureHit / surelyHit / identified: trúng chắc, lộ diện (Lock-On, Telekinesis, Foresight) ----------

const sureHit: TraitHookHandler = { validateParams: validateEmptyParams, hitsSurely: () => true }

const surelyHit: TraitHookHandler = { validateParams: validateEmptyParams, surelyHit: () => true }

interface IdentifiedParams {
  /** Hệ skill đánh trúng quái dù hệ của nó miễn nhiễm (Foresight: thường, giác đấu). */
  elementIds: string[]
}

const identified: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return checkEnumList(obj.elementIds, 'elementIds', Object.keys(data.elements))
  },
  immunityRemovedFor: (params, elementId) =>
    (params as IdentifiedParams).elementIds.includes(elementId),
  evasionIgnored: () => true
}

// ---------- anchored: không bị ép rời sân (Ingrain, Suction Cups) ----------

const anchored: TraitHookHandler = {
  validateParams: validateEmptyParams,
  resistsForceSwitch: () => true
}

// ---------- grounded: bị ép đứng trên mặt đất (Smack Down, Thousand Arrows, Ingrain, Iron Ball) ----------

interface GroundedParams {
  /** Hệ skill mất miễn nhiễm lên quái này dù nó mang hệ bay / trait bay (hệ Đất, như Pokémon). */
  removesImmunityFromElementIds?: string[]
}

// Như Pokémon: quái bị hạ xuống đất đứng trên mặt đất (địa hình, bẫy tác dụng) và chiêu hệ Đất đánh
// trúng dù là hệ Bay / Levitate. Thắng cả hook airborne.
const grounded: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    if (obj.removesImmunityFromElementIds === undefined) return []
    return checkEnumList(
      obj.removesImmunityFromElementIds,
      'removesImmunityFromElementIds',
      Object.keys(data.elements)
    )
  },
  isForcedGrounded: () => true,
  removesAirborneImmunity: (params, elementId) =>
    (params as GroundedParams).removesImmunityFromElementIds?.includes(elementId) ?? false
}

// ---------- statModifierInWeather / terrainStatModifier: % chỉ số trong môi trường ----------

interface FieldStatParams {
  fieldIds: string[]
  percent: PartialStats
}

/**
 * Trait % chỉ số khi môi trường của lớp `layer` thuộc danh sách `idsKey` (Swift Swim, Surge
 * Surfer...). Cộng % ở bước trait cùng mọi trait khác (mục "Thứ tự tính chỉ số"); địa hình chỉ
 * tác dụng lên quái đứng trên mặt đất.
 */
function fieldStatModifier(layer: GlobalFieldLayer, idsKey: string): TraitHookHandler {
  const read = (params: unknown): FieldStatParams => {
    // Ép kiểu vì params đã qua validateParams lúc khởi động.
    const obj = params as Record<string, unknown>
    return { fieldIds: obj[idsKey] as string[], percent: obj.percent as PartialStats }
  }
  return {
    validateParams(params, data) {
      const obj = asObject(params)
      if (!obj) return ['params phải là object']
      if (obj.percent === undefined) return ['cần percent']
      return [
        ...checkFieldIdList(data, obj[idsKey], idsKey, layer),
        ...validatePartialStats(obj.percent, 'percent')
      ]
    },
    modifyStats(params, scale, { data, field, grounded }) {
      const { fieldIds, percent } = read(params)
      const active = field !== undefined && isLayerFieldIn(data, field, layer, fieldIds)
      const applies = active && (layer !== 'terrain' || grounded === true)
      return { flat: {}, percent: applies ? scaleStats(percent, scale) : {} }
    },
    fieldBenefit(params, fieldId) {
      const { fieldIds, percent } = read(params)
      return fieldIds.includes(fieldId) ? Math.sign(sumPercent(percent)) : 0
    }
  }
}

// ---------- regenInWeather: hồi % max HP cuối lượt khi có thời tiết (kiểu Rain Dish) ----------

interface RegenInWeatherParams {
  weatherIds: string[]
  percent: number
}

const regenInWeather: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkNumber(obj.percent, 'percent'),
      ...checkFieldIdList(data, obj.weatherIds, 'weatherIds', 'weather')
    ]
  },
  onTurnEnd(params, scale, { data, field }) {
    const { weatherIds, percent } = params as RegenInWeatherParams
    const active = field !== undefined && isLayerFieldIn(data, field, 'weather', weatherIds)
    return { healPercent: active ? percent * scale : 0 }
  },
  fieldBenefit(params, fieldId) {
    const { weatherIds, percent } = params as RegenInWeatherParams
    return weatherIds.includes(fieldId) ? Math.sign(percent) : 0
  }
}

// ---------- setFieldOnEntry: vào sân thì đặt môi trường (kiểu Drizzle, Drought) ----------

const setFieldOnEntry: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    return obj ? checkSetFieldParams(data, obj) : ['params phải là object']
  },
  fieldOnEntry(params) {
    return params as FieldPlacement
  }
}

// ---------- fieldDamageImmunity: miễn sát thương môi trường (kiểu Overcoat) ----------

// fieldIds: chỉ miễn sát thương của các môi trường này (Sand Veil, Sand Rush, Sand Force: bão cát);
// bỏ trống = mọi môi trường.
const fieldDamageImmunity: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = Object.keys(obj)
      .filter((key) => key !== 'fieldIds')
      .map((key) => `trường lạ "${key}"`)
    if (obj.fieldIds !== undefined) {
      issues.push(
        ...checkIdList(obj.fieldIds, 'fieldIds', data.fieldEffects, { label: 'môi trường' })
      )
    }
    return issues
  },
  immuneToFieldDamage(params, fieldId) {
    const { fieldIds } = params as { fieldIds?: string[] }
    if (fieldIds === undefined) return true
    return fieldId !== undefined && fieldIds.includes(fieldId)
  },
  // Có ích khi môi trường gây sát thương; AI tính phần đó qua turnEndDamage (miễn thì không trừ).
  fieldBenefit: () => 0
}

// ---------- absorbElement: hút skill các hệ của địch, hồi máu / tăng sát thương (Water Absorb) ----------

interface AbsorbElementParams {
  elementIds: string[]
  healPercent: number
  boostPercent?: number
  /** Hút xong tăng bậc (Lightning Rod: +1 đặc công; Motor Drive: +1 tốc; Sap Sipper: +1 công). */
  stages?: { stat: StageStat; delta: number }[]
}

const absorbElement: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = [
      ...checkIdList(obj.elementIds, 'elementIds', data.elements, { label: 'hệ' }),
      ...checkNumber(obj.healPercent, 'healPercent', 0, 100)
    ]
    if (obj.boostPercent !== undefined) {
      issues.push(...checkNumber(obj.boostPercent, 'boostPercent', Number.MIN_VALUE))
    }
    if (obj.stages !== undefined) {
      const stages = Array.isArray(obj.stages) ? obj.stages : [null]
      for (const entry of stages) {
        const stage = asObject(entry)
        if (!isBattleStageStat(stage?.stat)) issues.push('stages: chỉ số không hợp lệ')
        issues.push(...checkInteger(stage?.delta, 'stages.delta'))
      }
    }
    return issues
  },
  absorbs(params, scale, elementId) {
    const { elementIds, healPercent, boostPercent, stages } = params as AbsorbElementParams
    if (!elementIds.includes(elementId)) return null
    return {
      healPercent: Math.min(100, healPercent * scale),
      boosts: boostPercent !== undefined,
      stages: stages ?? []
    }
  },
  absorbBoostPercent(params, scale, elementId) {
    const { elementIds, boostPercent } = params as AbsorbElementParams
    return boostPercent !== undefined && elementIds.includes(elementId) ? boostPercent * scale : 0
  }
}

// ---------- fieldDuration: môi trường quái đặt kéo dài hơn (Damp Rock, Terrain Extender) ----------

interface FieldDurationParams {
  /** Các môi trường được kéo dài; bỏ trống thì dùng `layer`. */
  fieldIds?: string[]
  /** Mọi môi trường của lớp này (Terrain Extender: địa hình). */
  layer?: GlobalFieldLayer
  turns: number
}

// Như Pokémon: chỉ đổi số lượt mặc định (skill / trait không ghi turns), bật / tắt, không theo cấp.
const fieldDuration: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkInteger(obj.turns, 'turns', 1)
    if ((obj.fieldIds === undefined) === (obj.layer === undefined)) {
      issues.push('cần đúng một trong fieldIds / layer')
    }
    if (obj.fieldIds !== undefined) {
      issues.push(
        ...checkIdList(obj.fieldIds, 'fieldIds', data.fieldEffects, { label: 'môi trường' })
      )
    }
    if (obj.layer !== undefined && !isGlobalFieldLayer(obj.layer)) {
      issues.push('layer phải là "weather" hoặc "terrain"')
    }
    return issues
  },
  fieldTurns(params, fieldId, layer) {
    const { fieldIds, layer: extendedLayer, turns } = params as FieldDurationParams
    const matches = fieldIds ? fieldIds.includes(fieldId) : extendedLayer === layer
    return matches ? turns : undefined
  }
}

// ---------- weatherShield: đồ cầm che thời tiết cho quái cầm (Utility Umbrella) ----------

// Đọc ở draft.ts (monsterField) thẳng từ ô đồ cầm; chỉ có tác dụng trên đồ cầm.
const weatherShield: TraitHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return checkFieldIdList(data, obj.weatherIds, 'weatherIds', 'weather')
  },
  shieldedWeatherIds: (params) => (params as { weatherIds: string[] }).weatherIds
}

/** Hook trait theo hệ và môi trường; gộp vào TRAIT_HOOKS. */
export const FIELD_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  elementDamageTaken,
  blocksElementReactions,
  wallIgnoreChance,
  staminaMaxPercent,
  staminaCostPercent,
  overexertion,
  synergyBoost,
  airborne,
  grounded,
  trapped,
  anchored,
  sureHit,
  surelyHit,
  identified,
  statModifierInWeather: fieldStatModifier('weather', 'weatherIds'),
  terrainStatModifier: fieldStatModifier('terrain', 'terrainIds'),
  regenInWeather,
  setFieldOnEntry,
  fieldDamageImmunity,
  fieldDuration,
  weatherShield,
  absorbElement
}
