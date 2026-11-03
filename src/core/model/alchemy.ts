// Luyện đan, luyện khí, linh thực và linh điền (docs/rules/alchemy.md, cooking.md): công thức
// (src/data/recipes.json) theo nơi luyện, cấp luyện đan / luyện khí / nấu ăn và công thức đã biết,
// món ăn đang có tác dụng, linh điền trong state, config.

import type { Decimal } from '../shared'
import type { DropEntry } from './content'

/** Một món (vật phẩm gộp chồng) kèm số lượng. */
export interface ItemAmount {
  itemId: string
  count: number
}

/**
 * Món trong nhóm vật phẩm `config.itemGroups[groupId]`: bất kỳ (ví dụ yêu đan bất kỳ hệ), hoặc
 * `sameItem` = mọi món cùng một loại (yêu đan cùng hệ; luyện nhiều lần cũng lấy từ một loại).
 */
export interface GroupAmount {
  groupId: string
  count: number
  sameItem?: true
}

/** Nguyên liệu của công thức: đúng một món, hoặc món bất kỳ trong nhóm. */
export type RecipeInput = ItemAmount | GroupAmount

/** Nơi luyện: luyện đan (lò đan), luyện khí (Thợ rèn), nấu ăn (Đầu bếp); mỗi nơi một cấp riêng. */
export const CRAFT_STATIONS = ['alchemy', 'smithing', 'cooking'] as const
export type CraftStation = (typeof CRAFT_STATIONS)[number]

/**
 * Công thức (recipes.json; tên theo tên vật phẩm ra). `station` không ghi = luyện đan. `scroll`: phải
 * học từ đan phương (`recipeScroll`) mới dùng được; không thì biết sẵn khi đủ cấp.
 */
export interface RecipeDef {
  id: string
  station?: CraftStation
  output: ItemAmount
  inputs: RecipeInput[]
  money: number
  minLevel: number
  /** % thành công gốc ở đúng cấp yêu cầu. */
  successChance: number
  /** Exp của nơi luyện mỗi lần luyện (thành hay bại). */
  exp: number
  scroll?: true
}

/** Cấp của một nơi luyện (nguyên ≥ 1, không trần, suy từ tổng exp). */
export interface CraftSkillState {
  level: number
  exp: Decimal
}

export interface AlchemyState extends CraftSkillState {
  /** Công thức cần đan phương đã học. */
  knownRecipes: string[]
}

/** Luyện khí (Thợ rèn): cấp riêng, tăng khi luyện công thức luyện khí, cường hóa, đúc trang bị. */
export type SmithingState = CraftSkillState

/** Món ăn đang có tác dụng cho cả đội (docs/rules/cooking.md): còn `battlesLeft` trận (≥ 1). */
export interface ActiveMeal {
  itemId: string
  battlesLeft: number
}

/**
 * Hiệu ứng của món ăn (registry MEAL_EFFECTS): `statPercent` = % chỉ số trong trận cho quái ta (mọi
 * chỉ số hoặc một chỉ số), còn lại là % của một kênh phần thưởng / tỉ lệ (nhân như kỹ năng đồng hành).
 */
export const MEAL_EFFECT_TYPES = [
  'statPercent',
  'expPercent',
  'moneyPercent',
  'dropRatePercent',
  'catchRatePercent',
  'affinityGainPercent'
] as const
export type MealEffectType = (typeof MEAL_EFFECT_TYPES)[number]

/** Nấu ăn (Đầu bếp): cấp riêng, món ăn đang có tác dụng (null = chưa ăn / đã hết). */
export interface CookingState extends CraftSkillState {
  meal: ActiveMeal | null
}

/** Cấp của nơi luyện chỉ có đường cong cấp (luyện khí dùng chung trong config.forge, nấu ăn). */
export interface CraftCurveConfig {
  /** Tổng exp đạt cấp L = ⌈expBase × (L − 1) ^ expPower⌉. */
  expBase: number
  expPower: number
  /** + điểm % tỉ lệ thành công mỗi cấp trên cấp yêu cầu (kẹp 100). */
  levelBonusPercent: number
}

export interface AlchemyConfig {
  /** Tổng exp đạt cấp L = ⌈expBase × (L − 1) ^ expPower⌉. */
  expBase: number
  expPower: number
  /** + điểm % tỉ lệ thành công mỗi cấp trên cấp yêu cầu (kẹp 100). */
  levelBonusPercent: number
  /** Nguyên liệu rơi: tinh phách theo race / linh thạch theo hệ đầu của quái bị hạ (%), dược liệu. */
  raceEssenceItemIds: Record<string, string>
  elementStoneItemIds: Record<string, string>
  essenceChance: number
  stoneChance: number
  wildDrops: DropEntry[]
  /** Đan phương rơi từ boss. */
  bossDrops: DropEntry[]
}
