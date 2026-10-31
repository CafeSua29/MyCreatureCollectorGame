// Kiểm tra dữ liệu dưỡng dục (docs/rules/imprinting.md): config.imprint.

import { IMPRINT_REQUEST_KINDS, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'

/** Món ăn: consumable dùng được ngoài trận, nhắm quái ta (cho ăn qua useItem). */
function checkFoods(data: GameData, foods: unknown, issues: string[]): void {
  if (!Array.isArray(foods) || foods.length === 0) {
    issues.push('config.imprint.foods phải là danh sách có ít nhất một món')
    return
  }
  for (const itemId of foods) {
    const item = data.items[String(itemId)]
    const usable =
      item?.category === 'consumable' && item.use !== 'battle' && item.target === 'ally'
    if (!usable) {
      issues.push(
        `config.imprint.foods: "${String(itemId)}" phải là consumable dùng ngoài trận lên quái ta`
      )
    }
  }
  if (new Set(foods).size !== foods.length) issues.push('config.imprint.foods bị lặp')
}

/** Kiểm tra config.imprint. */
export function checkImprintData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.imprint)
  if (!config) {
    issues.push('config.imprint phải là object')
    return
  }
  const at = (field: string): string => `config.imprint.${field}`
  issues.push(...checkInteger(config.requestEveryDays, at('requestEveryDays'), 1))
  issues.push(...checkInteger(config.fallbackDays, at('fallbackDays'), 1))
  issues.push(...checkNumber(config.maxStatPercent, at('maxStatPercent'), 0))
  checkFoods(data, config.foods, issues)
  issues.push(...checkNumber(config.favoriteFoodWeight, at('favoriteFoodWeight'), Number.MIN_VALUE))
  const weights = asObject(config.requestWeights)
  let totalWeight = 0
  for (const kind of IMPRINT_REQUEST_KINDS) {
    const weight = weights?.[kind]
    issues.push(...checkNumber(weight, at(`requestWeights.${kind}`), 0))
    if (typeof weight === 'number' && Number.isFinite(weight)) totalWeight += weight
  }
  for (const key of Object.keys(weights ?? {})) {
    if (!IMPRINT_REQUEST_KINDS.some((kind) => kind === key)) {
      issues.push(`${at('requestWeights')}: loại yêu cầu lạ "${key}"`)
    }
  }
  if (weights && totalWeight <= 0) issues.push(`${at('requestWeights')}: tổng trọng số phải > 0`)
}
