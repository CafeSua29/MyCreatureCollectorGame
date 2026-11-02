// Luyện đan, luyện khí, nấu ăn (docs/rules/alchemy.md, cooking.md): cấp của mỗi nơi luyện theo tổng
// exp, tỉ lệ thành công, luyện nhiều lần (mỗi lần tung RNG riêng, thất bại mất nguyên liệu và tiền),
// học đan phương. Linh điền ở garden.ts (công trình động phủ, docs/rules/dwelling.md).

import { addItems, recipeInputCount, removeItems, removeRecipeInput } from '../inventory'
import { partnerAmount } from '../tamer'
import { bumpStat, tamerBonusAmount } from '../registries'
import { dwellingCraftBonus } from './dwelling'
import { requireTown } from './town'
import {
  ActionError,
  malformedAction,
  rollPercent,
  spendMoney,
  toBig,
  type Decimal,
  curveExpForLevel,
  curveLevelFromExp,
  type LevelCurve
} from '../shared'
import {
  type CraftSkillState,
  type CraftStation,
  type GameData,
  type GameState,
  type RecipeDef,
  type StatKey,
  type TamerBonusType
} from '../model'

/** Luật theo nơi luyện: đường cong cấp, phần state, mã lỗi thiếu cấp, cộng thêm % thành công. */
interface CraftStationRule {
  curve: (data: GameData) => LevelCurve
  levelBonusPercent: (data: GameData) => number
  skill: (state: GameState) => CraftSkillState
  withSkill: (state: GameState, skill: CraftSkillState) => GameState
  levelError: 'alchemyLevelTooLow' | 'smithingLevelTooLow' | 'cookingLevelTooLow'
  /** Tên dùng trong lỗi dữ liệu của đường cong cấp. */
  label: string
  /** % thành công cộng thêm ngoài cấp, kênh thưởng ngự thú sư (danh hiệu, thiên phú) và động phủ. */
  bonusPercent: (data: GameData, state: GameState) => number
  /** Kênh thưởng ngự thú sư cộng vào % thành công (docs/rules/tamer-talents.md). */
  bonusChannel: TamerBonusType
  /** Khóa bộ đếm thành tựu cộng số lần luyện thành công (docs/rules/achievements.md). */
  craftedStat: StatKey
}

const CRAFT_STATION_RULES: Record<CraftStation, CraftStationRule> = {
  alchemy: {
    curve: (data) => ({ base: data.config.alchemy.expBase, power: data.config.alchemy.expPower }),
    levelBonusPercent: (data) => data.config.alchemy.levelBonusPercent,
    skill: (state) => state.alchemy,
    withSkill: (state, skill) => ({ ...state, alchemy: { ...state.alchemy, ...skill } }),
    levelError: 'alchemyLevelTooLow',
    label: 'luyện đan',
    bonusPercent: (data, state) =>
      partnerAmount(data, state.party, 'alchemySuccessPercent') +
      dwellingCraftBonus(data, state, 'alchemy'),
    bonusChannel: 'alchemySuccessPercent',
    craftedStat: 'pillsCrafted'
  },
  smithing: {
    curve: (data) => ({ base: data.config.forge.expBase, power: data.config.forge.expPower }),
    levelBonusPercent: (data) => data.config.forge.levelBonusPercent,
    skill: (state) => state.smithing,
    withSkill: (state, skill) => ({ ...state, smithing: skill }),
    levelError: 'smithingLevelTooLow',
    label: 'luyện khí',
    bonusPercent: (data, state) => dwellingCraftBonus(data, state, 'smithing'),
    bonusChannel: 'smithingSuccessPercent',
    craftedStat: 'itemsForged'
  },
  // Linh thực ở Đầu bếp (docs/rules/cooking.md); giữ món ăn đang có tác dụng khi cộng exp.
  cooking: {
    curve: (data) => ({ base: data.config.cooking.expBase, power: data.config.cooking.expPower }),
    levelBonusPercent: (data) => data.config.cooking.levelBonusPercent,
    skill: (state) => state.cooking,
    withSkill: (state, skill) => ({ ...state, cooking: { ...state.cooking, ...skill } }),
    levelError: 'cookingLevelTooLow',
    label: 'nấu ăn',
    bonusPercent: (data, state) => dwellingCraftBonus(data, state, 'cooking'),
    bonusChannel: 'cookingSuccessPercent',
    craftedStat: 'dishesCooked'
  }
}

/** Nơi luyện của công thức (không ghi = luyện đan). */
export const recipeStation = (recipe: RecipeDef): CraftStation => recipe.station ?? 'alchemy'

/** Tổng exp đạt cấp `level` của nơi luyện (cấp 1 = 0). */
export function craftExpForLevel(data: GameData, station: CraftStation, level: number): Decimal {
  return curveExpForLevel(CRAFT_STATION_RULES[station].curve(data), level)
}

/** Cấp cao nhất của nơi luyện có craftExpForLevel ≤ exp (tối thiểu 1). */
export function craftLevelFromExp(data: GameData, station: CraftStation, exp: Decimal): number {
  const rule = CRAFT_STATION_RULES[station]
  return curveLevelFromExp(rule.curve(data), exp, rule.label)
}

/** Tổng exp đạt cấp luyện đan `level` (cấp 1 = 0). */
export const alchemyExpForLevel = (data: GameData, level: number): Decimal =>
  craftExpForLevel(data, 'alchemy', level)

/** Cấp luyện đan cao nhất có alchemyExpForLevel ≤ exp (tối thiểu 1). */
export const alchemyLevelFromExp = (data: GameData, exp: Decimal): number =>
  craftLevelFromExp(data, 'alchemy', exp)

/** Cấp hiện tại của nơi luyện. */
export const craftLevel = (state: GameState, station: CraftStation): number =>
  CRAFT_STATION_RULES[station].skill(state).level

/** Cộng exp cho nơi luyện (cấp tính lại từ tổng exp); có `lastCraft` thì ghi đè. */
export function gainCraftExp(
  data: GameData,
  state: GameState,
  {
    station,
    exp,
    lastCraft
  }: { station: CraftStation; exp: Decimal; lastCraft?: CraftSkillState['lastCraft'] }
): GameState {
  const rule = CRAFT_STATION_RULES[station]
  const skill = rule.skill(state)
  const total = skill.exp.plus(exp)
  return rule.withSkill(state, {
    exp: total,
    level: craftLevelFromExp(data, station, total),
    lastCraft: lastCraft === undefined ? skill.lastCraft : lastCraft
  })
}

/** Đủ cấp của nơi luyện không; không thì ném lỗi thiếu cấp của nơi đó. */
export function requireCraftLevel(state: GameState, station: CraftStation, need: number): void {
  const have = craftLevel(state, station)
  if (have < need) throw new ActionError(CRAFT_STATION_RULES[station].levelError, { need, have })
}

/**
 * % thành công của công thức: gốc + levelBonusPercent của nơi luyện mỗi cấp trên cấp yêu cầu + cộng
 * thêm của nơi luyện (luyện đan: kỹ năng đồng hành `alchemySuccessPercent`, partner-skills.md; công
 * trình `craftBonus` của động phủ, dwelling.md) + kênh thưởng ngự thú sư của nơi luyện (danh hiệu,
 * thiên phú; tamer-talents.md), kẹp 0–100.
 */
export function craftChance(data: GameData, state: GameState, recipe: RecipeDef): number {
  const station = recipeStation(recipe)
  const rule = CRAFT_STATION_RULES[station]
  const levelBonus = (craftLevel(state, station) - recipe.minLevel) * rule.levelBonusPercent(data)
  const chance =
    recipe.successChance +
    levelBonus +
    rule.bonusPercent(data, state) +
    tamerBonusAmount(data, state, rule.bonusChannel)
  return Math.min(100, Math.max(0, chance))
}

/** Công thức dùng được không: tồn tại, đủ cấp, đã học (nếu cần đan phương). Ném lỗi nếu không. */
export function requireUsableRecipe(data: GameData, state: GameState, recipeId: string): RecipeDef {
  const recipe = Object.hasOwn(data.recipes, recipeId) ? data.recipes[recipeId] : undefined
  if (!recipe) throw new ActionError('recipeUnknown', { recipeId })
  if (recipe.scroll && !state.alchemy.knownRecipes.includes(recipeId)) {
    throw new ActionError('recipeNotLearned', { recipeId })
  }
  requireCraftLevel(state, recipeStation(recipe), recipe.minLevel)
  return recipe
}

/**
 * Luyện `times` lần (ở thị trấn): kiểm tra đủ nguyên liệu và tiền cho mọi lần trước, rồi mỗi lần tung
 * riêng; thành công nhận món ra, thất bại mất nguyên liệu và tiền. Mỗi lần + exp của nơi luyện.
 */
export function craft(
  data: GameData,
  state: GameState,
  { recipeId, times }: { recipeId: string; times: number }
): GameState {
  if (!Number.isSafeInteger(times) || times < 1)
    throw malformedAction('times phải là số nguyên ≥ 1')
  requireTown(state)
  const recipe = requireUsableRecipe(data, state, recipeId)
  let inventory = state.inventory
  for (const input of recipe.inputs) {
    inventory = removeRecipeInput(data, inventory, input, input.count * times)
  }
  const paid = spendMoney(state, toBig(recipe.money).times(times))
  const chance = craftChance(data, state, recipe)
  let rng = state.rng
  let successes = 0
  for (let i = 0; i < times; i++) {
    let success: boolean
    ;[success, rng] = rollPercent(rng, chance)
    if (success) successes++
  }
  if (successes > 0) {
    inventory = addItems(inventory, recipe.output.itemId, recipe.output.count * successes)
  }
  const station = recipeStation(recipe)
  const stats = bumpStat(state.stats, CRAFT_STATION_RULES[station].craftedStat, successes)
  return gainCraftExp(
    data,
    { ...paid, rng, inventory, stats },
    {
      station,
      exp: toBig(recipe.exp).times(times),
      lastCraft: { recipeId, successes, failures: times - successes }
    }
  )
}

/** Học đan phương (ngoài trận): tiêu một đan phương, biết công thức của nó. */
export function learnRecipe(data: GameData, state: GameState, itemId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const item = data.items[itemId]
  if (!item) throw new ActionError('unknownItem', { itemId })
  if (item.category !== 'recipeScroll') throw new ActionError('notRecipeScroll', { itemId })
  if (state.alchemy.knownRecipes.includes(item.recipeId)) {
    throw new ActionError('recipeAlreadyKnown', { recipeId: item.recipeId })
  }
  return {
    ...state,
    inventory: removeItems(state.inventory, itemId, 1),
    alchemy: { ...state.alchemy, knownRecipes: [...state.alchemy.knownRecipes, item.recipeId] }
  }
}

/** Số lần luyện tối đa với nguyên liệu và tiền đang có (UI). */
export const craftableTimes = (data: GameData, state: GameState, recipe: RecipeDef): number =>
  Math.min(
    ...recipe.inputs.map((input) =>
      Math.floor(recipeInputCount(data, state.inventory, input) / input.count)
    ),
    recipe.money > 0 ? state.money.div(recipe.money).floor().toNumber() : Number.MAX_SAFE_INTEGER
  )
