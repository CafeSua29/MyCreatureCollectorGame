// Hiệu ứng toàn cục của event (docs/rules/events.md): mỗi loại hiệu ứng một handler. Loại "%" nhân
// một tỉ lệ / phần thưởng (gặp boss, shiny, tiền, đồ rơi, giá cửa hàng, tỉ lệ event), loại "môi
// trường" cố định thời tiết / địa hình của trận trên tầng. Nơi dùng hỏi qua eventModifierMultiplier
// / eventModifierFields, không rẽ nhánh theo id modifier.

import {
  GLOBAL_FIELD_LAYERS,
  type ActiveModifier,
  type EventModifierEffectType,
  type GameData,
  type GlobalFieldLayer
} from '../model'
import { asObject, checkNumber } from '../shared'
import { checkFieldIdList } from './paramChecks'

export type EventModifierHandler =
  | { kind: 'percent'; validateParams(params: unknown, data: GameData): string[] }
  | { kind: 'field'; validateParams(params: unknown, data: GameData): string[] }

/** % khác 0, không dưới −100 (hệ số không âm). */
const percentEffect: EventModifierHandler = {
  kind: 'percent',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.percent, 'percent', -100)
    if (obj.percent === 0) issues.push('percent phải khác 0')
    return issues
  }
}

export const EVENT_MODIFIER_EFFECTS: Readonly<
  Record<EventModifierEffectType, EventModifierHandler>
> = {
  bossChancePercent: percentEffect,
  shinyChancePercent: percentEffect,
  moneyPercent: percentEffect,
  dropRatePercent: percentEffect,
  shopPricePercent: percentEffect,
  eventChancePercent: percentEffect,
  // Lớp có ghi lấy môi trường đó cả trận (sau môi trường tự nhiên của map).
  fixedField: {
    kind: 'field',
    validateParams(params, data) {
      const obj = asObject(params)
      if (!obj) return ['params phải là object']
      const layers = GLOBAL_FIELD_LAYERS.filter((layer) => obj[layer] !== undefined)
      if (layers.length === 0) return ['cần ít nhất một lớp weather / terrain']
      return layers.flatMap((layer) => checkFieldIdList(data, [obj[layer]], layer, layer))
    }
  }
}

export const isEventModifierEffectType = (type: string): type is EventModifierEffectType =>
  Object.hasOwn(EVENT_MODIFIER_EFFECTS, type)

/**
 * Hệ số của một kênh %: mỗi modifier 1 + tổng % / 100 (không dưới 0), các modifier khác nhau nhân
 * với nhau. Không có modifier nào thì 1.
 */
export function eventModifierMultiplier(
  data: GameData,
  modifiers: readonly ActiveModifier[],
  type: EventModifierEffectType
): number {
  let multiplier = 1
  for (const active of modifiers) {
    const percent = data.eventModifiers[active.modifierId].effects
      .filter((effect) => effect.type === type)
      .reduce((sum, effect) => sum + (effect.params as { percent: number }).percent, 0)
    multiplier *= Math.max(0, 1 + percent / 100)
  }
  return multiplier
}

/** Môi trường cố định của các modifier đang có (modifier sau ghi đè lớp của modifier trước). */
export function eventModifierFields(
  data: GameData,
  modifiers: readonly ActiveModifier[]
): Partial<Record<GlobalFieldLayer, string>> {
  const fields: Partial<Record<GlobalFieldLayer, string>> = {}
  for (const active of modifiers) {
    for (const effect of data.eventModifiers[active.modifierId].effects) {
      if (effect.type !== 'fixedField') continue
      Object.assign(fields, effect.params)
    }
  }
  return fields
}

/** Một trận trên tầng trôi qua: modifier theo số trận giảm 1, hết thì mất (modifier thị trấn giữ). */
export function tickModifierList(modifiers: readonly ActiveModifier[]): ActiveModifier[] {
  return modifiers.flatMap((active) => {
    if (active.battlesLeft === null) return [active]
    const battlesLeft = active.battlesLeft - 1
    return battlesLeft > 0 ? [{ ...active, battlesLeft }] : []
  })
}
