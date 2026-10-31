// Linh thực trong chơi liên tục (mục "Linh thực" ở simulation-features.md, docs/rules/cooking.md): mỗi
// lần ở thị trấn, chưa có món ăn đang có tác dụng thì "người chơi" ăn món trong túi, túi không có thì
// nấu một món (công thức nấu ra món ăn có cấp yêu cầu cao nhất còn đủ nguyên liệu, nguyên liệu thiếu
// mà cửa hàng đang bán thì mua; nấu tới khi thành công) rồi ăn ngay. Chạy trước luyện đan (alchemy.ts) vì luyện đan dùng hết dược liệu. Giả định:
// không nấu Bạc Hà Tính Cách (công thức nấu ra vật phẩm không phải món ăn).

import {
  craftLevel,
  craftableTimes,
  getItemCount,
  itemBuyPrice,
  recipeStation,
  type GameData,
  type GameState,
  type RecipeDef
} from '@core'
import { shopStock, simAct } from './events'

export interface CookingRound {
  state: GameState
  /** Số món đã ăn (0 hoặc 1) và số lần nấu (thành + bại). */
  meals: number
  cooks: number
}

const isDish = (data: GameData, itemId: string): boolean => data.items[itemId]?.category === 'dish'

/** Công thức nấu món ăn dùng được theo cấp, cấp yêu cầu cao nhất trước. */
function dishRecipes(data: GameData, state: GameState): RecipeDef[] {
  return Object.values(data.recipes)
    .filter(
      (recipe) =>
        recipeStation(recipe) === 'cooking' &&
        isDish(data, recipe.output.itemId) &&
        recipe.minLevel <= craftLevel(state, 'cooking')
    )
    .sort((a, b) => b.minLevel - a.minLevel)
}

/** Mua ở cửa hàng phần nguyên liệu (món cụ thể) còn thiếu cho một lần nấu, nếu đang bán và đủ tiền. */
function buyMissingInputs(data: GameData, state: GameState, recipe: RecipeDef): GameState {
  for (const input of recipe.inputs) {
    if (!('itemId' in input)) continue
    const missing = input.count - getItemCount(state.inventory, input.itemId)
    const sold = shopStock(state).some(
      (entry) => entry.storage === 'stack' && entry.itemId === input.itemId
    )
    if (missing <= 0 || !sold) continue
    const item = { storage: 'stack', itemId: input.itemId } as const
    if (state.money.lt(itemBuyPrice(data, item, state.highestFloor).times(missing))) continue
    state = simAct(data, state, { type: 'buyItem', item, count: missing })
  }
  return state
}

/** Ở thị trấn: chưa có món đang ăn thì ăn / nấu rồi ăn một món. */
export function runCooking(data: GameData, state: GameState): CookingRound {
  if (state.cooking.meal) return { state, meals: 0, cooks: 0 }
  let cooks = 0
  let dishId = Object.keys(state.inventory.stacks).find((itemId) => isDish(data, itemId))
  for (const recipe of dishId ? [] : dishRecipes(data, state)) {
    const cooked = (): boolean => getItemCount(state.inventory, recipe.output.itemId) > 0
    while (!cooked()) {
      state = buyMissingInputs(data, state, recipe)
      if (craftableTimes(data, state, recipe) <= 0) break
      state = simAct(data, state, { type: 'craft', recipeId: recipe.id, times: 1 })
      cooks++
    }
    if (cooked()) {
      dishId = recipe.output.itemId
      break
    }
  }
  if (!dishId) return { state, meals: 0, cooks }
  return { state: simAct(data, state, { type: 'eatDish', itemId: dishId }), meals: 1, cooks }
}
