// Kiểm tra phần luyện đan, luyện khí và linh điền trong save (docs/rules/alchemy.md).

import { craftLevelFromExp, recipeStation } from '../progression'
import { asObject, checkBig, checkInteger, type Decimal } from '../shared'
import { dayOf, type CraftStation, type GameData } from '../model'

/** lastCraft: null hoặc { recipeId là công thức của đúng nơi luyện, successes, failures }. */
function checkLastCraft(
  data: GameData,
  { value, station, field }: { value: unknown; station: CraftStation; field: string },
  issues: string[]
): void {
  if (value === null) return
  const craft = asObject(value)
  const recipe =
    craft && typeof craft.recipeId === 'string' && Object.hasOwn(data.recipes, craft.recipeId)
      ? data.recipes[craft.recipeId]
      : undefined
  if (!craft || !recipe || recipeStation(recipe) !== station) {
    issues.push(`${field}.lastCraft phải là null hoặc { recipeId, successes, failures } hợp lệ`)
    return
  }
  issues.push(...checkInteger(craft.successes, `${field}.lastCraft.successes`, 0))
  issues.push(...checkInteger(craft.failures, `${field}.lastCraft.failures`, 0))
}

/** Cấp của một nơi luyện: nguyên ≥ 1 khớp tổng exp, lần luyện gần nhất hợp lệ. */
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
  checkLastCraft(data, { value: skill.lastCraft, station, field }, issues)
  return issues
}

/** smithing: cấp luyện khí khớp tổng exp, lần luyện gần nhất là công thức luyện khí. */
export function validateSmithingState(data: GameData, value: unknown): string[] {
  const smithing = asObject(value)
  if (!smithing) return ['smithing phải là object']
  return checkCraftSkill(data, { skill: smithing, station: 'smithing', field: 'smithing' })
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

/** garden: mỗi ô null hoặc hạt giống đã trồng vào một ngày không sau hôm nay. */
export function validateGardenState(data: GameData, value: unknown, time: unknown): string[] {
  const garden = asObject(value)
  if (!garden || !Array.isArray(garden.plots)) return ['garden phải là { plots: danh sách }']
  const today = typeof time === 'number' ? dayOf(time) : Infinity
  const issues: string[] = []
  garden.plots.forEach((entry, i) => {
    if (entry === null) return
    const plot = asObject(entry)
    const at = `garden.plots[${i}]`
    const seedId = plot?.seedItemId
    if (typeof seedId !== 'string' || data.items[seedId]?.category !== 'seed') {
      issues.push(`${at}.seedItemId phải là hạt giống, nhận "${String(seedId)}"`)
    }
    issues.push(...checkInteger(plot?.plantedDay, `${at}.plantedDay`, 0))
    if (typeof plot?.plantedDay === 'number' && plot.plantedDay > today) {
      issues.push(`${at}.plantedDay không được sau hôm nay`)
    }
  })
  return issues
}
