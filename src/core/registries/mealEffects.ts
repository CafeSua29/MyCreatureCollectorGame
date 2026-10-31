// Hiệu ứng món ăn linh thực (docs/rules/cooking.md): mỗi loại hiệu ứng một handler. `statPercent` cộng
// % chỉ số trong trận cho quái ta (nguồn % `meal`), loại "%" còn lại nhân một kênh phần thưởng / tỉ lệ
// như kỹ năng đồng hành. Nơi dùng hỏi qua mealMultiplier / mealStatPercent, không rẽ nhánh theo id món.

import {
  STAT_NAMES,
  type ActiveMeal,
  type DishItem,
  type GameData,
  type MealEffectType,
  type PartialStats,
  type StatName
} from '../model'
import { asObject, checkNumber } from '../shared'

export type MealEffectHandler =
  | { kind: 'stat'; validateParams(params: unknown): string[] }
  | { kind: 'percent'; validateParams(params: unknown): string[] }

/** Kênh % (mọi loại trừ statPercent). */
export type MealChannel = Exclude<MealEffectType, 'statPercent'>

/** % khác 0, không dưới −100 (hệ số không âm). */
function checkPercent(obj: Record<string, unknown>): string[] {
  const issues = checkNumber(obj.percent, 'percent', -100)
  if (obj.percent === 0) issues.push('percent phải khác 0')
  return issues
}

const percentEffect: MealEffectHandler = {
  kind: 'percent',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkPercent(obj)
    for (const key of Object.keys(obj)) if (key !== 'percent') issues.push(`trường lạ "${key}"`)
    return issues
  }
}

export const MEAL_EFFECTS: Readonly<Record<MealEffectType, MealEffectHandler>> = {
  // { percent, stat? }: không ghi stat = mọi chỉ số kể cả max HP.
  statPercent: {
    kind: 'stat',
    validateParams(params) {
      const obj = asObject(params)
      if (!obj) return ['params phải là object']
      const issues = checkPercent(obj)
      if (obj.stat !== undefined && !STAT_NAMES.some((stat) => stat === obj.stat)) {
        issues.push(`stat lạ "${String(obj.stat)}"`)
      }
      for (const key of Object.keys(obj)) {
        if (key !== 'percent' && key !== 'stat') issues.push(`trường lạ "${key}"`)
      }
      return issues
    }
  },
  expPercent: percentEffect,
  moneyPercent: percentEffect,
  dropRatePercent: percentEffect,
  catchRatePercent: percentEffect,
  affinityGainPercent: percentEffect
}

/** Món ăn của bữa đang có tác dụng (null nếu chưa ăn / id không còn là món ăn). */
function dishOf(data: GameData, meal: ActiveMeal | null): DishItem | null {
  if (!meal) return null
  const item = data.items[meal.itemId]
  return item?.category === 'dish' ? item : null
}

/** Tổng % một kênh của món đang ăn (0 nếu không ăn gì / món không có kênh đó). */
export function mealPercent(data: GameData, meal: ActiveMeal | null, channel: MealChannel): number {
  return (
    (dishOf(data, meal)?.effects ?? [])
      .filter((effect) => effect.type === channel)
      // Ép kiểu: kiểm tra dữ liệu (MEAL_EFFECTS.validateParams) đảm bảo params có percent.
      .reduce((sum, effect) => sum + (effect.params as { percent: number }).percent, 0)
  )
}

/** Hệ số của một kênh %: 1 + mealPercent / 100 (không dưới 0); không ăn gì thì 1. */
export const mealMultiplier = (
  data: GameData,
  meal: ActiveMeal | null,
  channel: MealChannel
): number => Math.max(0, 1 + mealPercent(data, meal, channel) / 100)

/** % chỉ số trong trận cho quái ta của món đang ăn (cộng dồn mọi hiệu ứng statPercent). */
export function mealStatPercent(data: GameData, meal: ActiveMeal | null): PartialStats {
  const dish = dishOf(data, meal)
  const total: PartialStats = {}
  for (const effect of dish?.effects ?? []) {
    if (effect.type !== 'statPercent') continue
    // Ép kiểu: kiểm tra dữ liệu đảm bảo params { percent, stat? }.
    const { percent, stat } = effect.params as { percent: number; stat?: StatName }
    for (const name of stat ? [stat] : STAT_NAMES) total[name] = (total[name] ?? 0) + percent
  }
  return total
}

/** Một trận vừa kết thúc (mọi loại trận): bữa ăn bớt một trận, hết thì mất. */
export function tickMeal(meal: ActiveMeal | null): ActiveMeal | null {
  if (!meal) return null
  return meal.battlesLeft > 1 ? { ...meal, battlesLeft: meal.battlesLeft - 1 } : null
}
