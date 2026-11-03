// Kiểm tra phần luyện đan, luyện khí, nấu ăn trong save (docs/rules/alchemy.md, cooking.md); linh
// điền ở validateDwellingState.ts.

import { craftLevelFromExp } from '../progression'
import { asObject, checkBig, checkInteger, type Decimal } from '../shared'
import { checkKnownFields } from '../gameData'
import type { CraftStation, GameData } from '../model'

/** Cấp của một nơi luyện: nguyên ≥ 1 khớp tổng exp. */
function checkCraftSkill(
  data: GameData,
  {
    skill,
    station,
    field
  }: { skill: Record<string, unknown>; station: CraftStation; field: string }
): string[] {
  const issues = [
    ...checkInteger(skill.level, `${field}.level`, 1),
    ...checkBig(skill.exp, `${field}.exp`, 0)
  ]
  if (issues.length === 0) {
    // Ép kiểu: vừa kiểm tra là Decimal.
    const expected = craftLevelFromExp(data, station, skill.exp as Decimal)
    if (skill.level !== expected) {
      issues.push(`${field}.level phải khớp tổng exp (${expected}), nhận ${String(skill.level)}`)
    }
  }
  return issues
}

/** smithing: cấp luyện khí khớp tổng exp. */
export function validateSmithingState(data: GameData, value: unknown): string[] {
  const smithing = asObject(value)
  if (!smithing) return ['smithing phải là object']
  return checkCraftSkill(data, { skill: smithing, station: 'smithing', field: 'smithing' })
}

/** cooking.meal: null hoặc { itemId là món ăn, battlesLeft nguyên ≥ 1 }. */
function checkMeal(data: GameData, value: unknown, issues: string[]): void {
  if (value === null) return
  const meal = asObject(value)
  if (!meal) {
    issues.push('cooking.meal phải là object hoặc null')
    return
  }
  checkKnownFields(meal, ['itemId', 'battlesLeft'], 'cooking.meal', 'món ăn', issues)
  if (typeof meal.itemId !== 'string' || data.items[meal.itemId]?.category !== 'dish') {
    issues.push(`cooking.meal.itemId: không phải món ăn "${String(meal.itemId)}"`)
  }
  issues.push(...checkInteger(meal.battlesLeft, 'cooking.meal.battlesLeft', 1))
}

/** cooking: cấp nấu ăn khớp tổng exp, món ăn đang có. */
export function validateCookingState(data: GameData, value: unknown): string[] {
  const cooking = asObject(value)
  if (!cooking) return ['cooking phải là object']
  const issues = checkCraftSkill(data, { skill: cooking, station: 'cooking', field: 'cooking' })
  checkMeal(data, cooking.meal, issues)
  return issues
}

/** alchemy: cấp khớp tổng exp, công thức đã học là công thức cần đan phương, không lặp. */
export function validateAlchemyState(data: GameData, value: unknown): string[] {
  const alchemy = asObject(value)
  if (!alchemy) return ['alchemy phải là object']
  const issues = checkCraftSkill(data, { skill: alchemy, station: 'alchemy', field: 'alchemy' })
  const known = alchemy.knownRecipes
  if (!Array.isArray(known)) issues.push('alchemy.knownRecipes phải là danh sách')
  else {
    for (const id of known) {
      const recipe = typeof id === 'string' ? data.recipes[id] : undefined
      if (!recipe?.scroll) {
        issues.push(`alchemy.knownRecipes: "${String(id)}" không phải công thức cần đan phương`)
      }
    }
    if (new Set(known).size !== known.length) issues.push('alchemy.knownRecipes bị lặp')
  }
  return issues
}
