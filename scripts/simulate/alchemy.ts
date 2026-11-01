// Luyện đan và linh điền trong chơi liên tục (mục "Luyện đan" ở simulation-features.md,
// docs/rules/alchemy.md): mỗi lần ở thị trấn, "người chơi" thu hoạch ô đã chín, trồng hạt giống
// trong túi vào ô trống (túi hết hạt thì mua một hạt nếu cửa hàng bán), rồi luyện hết mọi công thức
// dùng được theo nguyên liệu đang có (thứ tự trong recipes.json). Đan ra được các phần khác của mô
// phỏng dùng (độ kiếp, đột phá, thiên tài địa bảo). Giả định: chỉ luyện công thức luyện đan (công
// thức luyện khí bỏ qua, yêu đan để đúc ở forge.ts); công thức dùng nguyên liệu nhóm (yêu đan bất kỳ)
// mỗi lần về thị trấn luyện tối đa ALCHEMY_POLICY.groupRecipeTimes lần để giữ yêu đan cho Thợ rèn.

import {
  craftLevel,
  craftableTimes,
  cropDaysLeft,
  itemBuyPrice,
  recipeStation,
  type GameData,
  type GameState
} from '@core'
import { simAct, shopStock } from './events'

/** Giả định của mô phỏng, không phải luật game. */
export const ALCHEMY_POLICY = { groupRecipeTimes: 1 }

export interface AlchemyRound {
  state: GameState
  /** Số lần luyện (thành + bại) và số lần thu hoạch. */
  crafts: number
  harvests: number
}

/** Túi không có hạt giống: mua một hạt đầu tiên cửa hàng đang bán nếu đủ tiền. */
function buySeedIfNone(data: GameData, state: GameState): GameState {
  const has = Object.keys(state.inventory.stacks).some((id) => data.items[id]?.category === 'seed')
  if (has) return state
  const entry = shopStock(state).find(
    (e) => e.storage === 'stack' && data.items[e.itemId]?.category === 'seed'
  )
  if (entry?.storage !== 'stack') return state
  const item = { storage: 'stack', itemId: entry.itemId } as const
  if (state.money.lt(itemBuyPrice(data, item, state.highestFloor))) return state
  return simAct(data, state, { type: 'buyItem', item, count: 1 })
}

/** Ô trống / chín: thu hoạch rồi trồng lại bằng hạt giống có trong túi. */
function tendGarden(data: GameData, state: GameState): { state: GameState; harvests: number } {
  let harvests = 0
  state.dwelling.plots.forEach((plot, plotIndex) => {
    if (plot && cropDaysLeft(data, state, plotIndex) === 0) {
      state = simAct(data, state, { type: 'harvest', plotIndex })
      harvests++
    }
  })
  state.dwelling.plots.forEach((plot, plotIndex) => {
    if (plot) return
    state = buySeedIfNone(data, state)
    const seedId = Object.keys(state.inventory.stacks).find(
      (itemId) => data.items[itemId]?.category === 'seed'
    )
    if (seedId) state = simAct(data, state, { type: 'plantSeed', plotIndex, itemId: seedId })
  })
  return { state, harvests }
}

/** Ở thị trấn: chăm linh điền rồi luyện hết mọi công thức dùng được. */
export function runAlchemy(data: GameData, state: GameState): AlchemyRound {
  const tended = tendGarden(data, state)
  state = tended.state
  let crafts = 0
  for (const recipe of Object.values(data.recipes)) {
    if (recipeStation(recipe) !== 'alchemy') continue
    if (recipe.minLevel > craftLevel(state, 'alchemy')) continue
    if (recipe.scroll && !state.alchemy.knownRecipes.includes(recipe.id)) continue
    const usesGroup = recipe.inputs.some((input) => 'groupId' in input)
    const most = craftableTimes(data, state, recipe)
    const times = usesGroup ? Math.min(most, ALCHEMY_POLICY.groupRecipeTimes) : most
    if (times <= 0) continue
    state = simAct(data, state, { type: 'craft', recipeId: recipe.id, times })
    crafts += times
  }
  // Đan phương trong túi: học ngay.
  for (const [itemId] of Object.entries(state.inventory.stacks)) {
    const item = data.items[itemId]
    if (item?.category === 'recipeScroll' && !state.alchemy.knownRecipes.includes(item.recipeId)) {
      state = simAct(data, state, { type: 'learnRecipe', itemId })
    }
  }
  return { state, crafts, harvests: tended.harvests }
}
