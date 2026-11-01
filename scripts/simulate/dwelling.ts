// Động phủ trong chơi liên tục (mục "Động phủ" ở simulation-features.md, docs/rules/dwelling.md):
// mỗi lần ở thị trấn, "người chơi" lấy hết đồ trong kho động phủ, nâng công trình rẻ nhất khi giá ≤
// buildingSpendFraction tiền và đủ nguyên liệu, rồi giao quái rảnh trong kho có chỉ số đúng việc
// (> 0, chạy sau thám hiểm nên thám hiểm được chọn trước) vào ô còn trống, quái sức cao nhất trước;
// giữ hộp thức ăn đủ feedDays ngày cho quái làm việc: nấu Thức ăn linh thú (mua quả khi cửa hàng bán)
// rồi bỏ hết món ăn có trong túi vào hộp (docs/rules/dwelling.md mục "Đói và tinh thần"); quái làm
// việc bị bệnh thì dùng thuốc bậc thấp nhất đủ chữa (có trong túi, không thì mua khi cửa hàng bán).

import {
  buildingSlots,
  buildingUpgradeCost,
  craftLevel,
  craftableTimes,
  recipeStation,
  itemBuyPrice,
  getItemCount,
  isFainted,
  workStats,
  workerPower,
  type GameData,
  type GameState
} from '@core'
import { ECONOMY_POLICY, type EconomyCount } from './economy'
import { shopStock, simAct } from './events'

/** Lấy hết đồ trong kho động phủ về túi; đếm số món. */
function collect(data: GameData, state: GameState, count: EconomyCount): GameState {
  const { stacks, books } = state.dwelling.storage
  const items =
    Object.values(stacks).reduce((sum, n) => sum + n, 0) +
    books.reduce((sum, book) => sum + book.count, 0)
  if (items === 0) return state
  count.dwellingItems += items
  return simAct(data, state, { type: 'collectDwelling' })
}

/** Nâng công trình có giá tiền thấp nhất trong số đủ nguyên liệu và giá ≤ buildingSpendFraction tiền. */
function upgradeCheapest(data: GameData, state: GameState, count: EconomyCount): GameState {
  const budget = state.money.times(ECONOMY_POLICY.buildingSpendFraction)
  const affordable = Object.values(data.buildings)
    .filter(
      (def) =>
        def.maxLevel === undefined || (state.dwelling.buildings[def.id]?.level ?? 0) < def.maxLevel
    )
    .map((def) => ({ id: def.id, cost: buildingUpgradeCost(data, state, def.id) }))
    .filter(
      ({ cost }) =>
        cost.money.lte(budget) &&
        cost.items.every(({ itemId, count: need }) => getItemCount(state.inventory, itemId) >= need)
    )
    .sort((a, b) => a.cost.money.cmp(b.cost.money))
  if (affordable.length === 0) return state
  count.buildingUpgrades++
  return simAct(data, state, { type: 'upgradeBuilding', buildingId: affordable[0].id })
}

/** Giao quái rảnh có thiên phú đúng việc vào ô trống của mọi công trình. */
function assignWorkers(data: GameData, state: GameState, count: EconomyCount): GameState {
  for (const [buildingId, building] of Object.entries(state.dwelling.buildings)) {
    const { workType } = data.buildings[buildingId]
    let free = buildingSlots(data, state, buildingId) - building.workers.length
    if (free <= 0) continue
    const candidates = state.storage
      .filter(
        (m) =>
          m.assignment === null &&
          m.ailment === null &&
          !isFainted(data, m) &&
          (workStats(data, m)[workType] ?? 0) > 0
      )
      .sort((a, b) => workerPower(data, b, workType) - workerPower(data, a, workType))
    for (const monster of candidates) {
      if (free <= 0) break
      state = simAct(data, state, { type: 'assignWorker', buildingId, monsterId: monster.id })
      count.workersAssigned++
      free--
    }
  }
  return state
}

/** Một lần ở thị trấn: lấy đồ, nâng một công trình, giao quái rảnh. */
export function runDwelling(data: GameData, state: GameState, count: EconomyCount): GameState {
  if (state.location.type !== 'town' || state.battle) return state
  state = collect(data, state, count)
  state = upgradeCheapest(data, state, count)
  state = assignWorkers(data, state, count)
  state = stockMedicine(data, state)
  state = treatAilments(data, state, count)
  return stockFeed(data, state, count)
}

/** Số thuốc mỗi bậc người chơi mô phỏng mua sẵn khi cửa hàng bán (chữa chấn thương trận kịp). */
const MEDICINE_RESERVE = 2

/** Mua sẵn thuốc mỗi bậc tới MEDICINE_RESERVE viên khi cửa hàng bán và đủ tiền. */
function stockMedicine(data: GameData, state: GameState): GameState {
  for (const entry of shopStock(state)) {
    if (entry.storage !== 'stack' || cureTierOf(data, entry.itemId) === null) continue
    const missing = MEDICINE_RESERVE - getItemCount(state.inventory, entry.itemId)
    const item = { storage: 'stack', itemId: entry.itemId } as const
    if (missing <= 0) continue
    if (state.money.lt(itemBuyPrice(data, item, state.highestFloor).times(missing))) continue
    state = simAct(data, state, { type: 'buyItem', item, count: missing })
  }
  return state
}

/** Bậc chữa bệnh của vật phẩm (hiệu ứng `cureAilment`); null = không phải thuốc. */
function cureTierOf(data: GameData, itemId: string): number | null {
  const item = data.items[itemId]
  if (item?.category !== 'consumable') return null
  const effect = item.effects.find((e) => e.type === 'cureAilment')
  const tier = effect?.params && (effect.params as { tier?: unknown }).tier
  return typeof tier === 'number' ? tier : null
}

/**
 * Lấy một thuốc bậc thấp nhất chữa được bệnh bậc `need`: trong túi, không thì mua khi cửa hàng bán,
 * không thì luyện (công thức đủ cấp, đủ nguyên liệu). Trả state và id thuốc (null = không có).
 */
function obtainMedicine(
  data: GameData,
  state: GameState,
  need: number
): { state: GameState; medicine: string | null } {
  const fits = (itemId: string): boolean => (cureTierOf(data, itemId) ?? 0) >= need
  const byTier = (a: string, b: string): number =>
    (cureTierOf(data, a) ?? 0) - (cureTierOf(data, b) ?? 0)
  const inBag = (): string | undefined =>
    Object.keys(state.inventory.stacks).filter(fits).sort(byTier)[0]
  if (inBag()) return { state, medicine: inBag() ?? null }
  const offer = shopStock(state)
    .flatMap((e) => (e.storage === 'stack' && fits(e.itemId) ? [e.itemId] : []))
    .sort(byTier)[0]
  const item = offer ? ({ storage: 'stack', itemId: offer } as const) : null
  if (item && state.money.gte(itemBuyPrice(data, item, state.highestFloor))) {
    return {
      state: simAct(data, state, { type: 'buyItem', item, count: 1 }),
      medicine: item.itemId
    }
  }
  const recipe = Object.values(data.recipes)
    .filter((r) => fits(r.output.itemId) && craftLevel(state, recipeStation(r)) >= r.minLevel)
    .find((r) => craftableTimes(data, state, r) > 0)
  if (recipe) state = simAct(data, state, { type: 'craft', recipeId: recipe.id, times: 1 })
  return { state, medicine: inBag() ?? null }
}

/**
 * Quái bệnh / chấn thương: quái làm việc và quái trong đội dùng thuốc bậc thấp nhất đủ chữa
 * (obtainMedicine); quái làm việc không có thuốc thì cho nghỉ việc để tự khỏi (giao lại khi khỏe).
 */
function treatAilments(data: GameData, state: GameState, count: EconomyCount): GameState {
  const sick = [...state.party, ...state.storage].filter(
    (m) => m.ailment !== null && (state.party.includes(m) || m.assignment?.kind === 'dwelling')
  )
  for (const monster of sick) {
    const ailment = monster.ailment
    if (!ailment) continue
    count.sickWorkers++
    const got = obtainMedicine(data, state, data.ailments[ailment.id]?.cureTier ?? Infinity)
    state = got.state
    if (got.medicine) {
      state = simAct(data, state, { type: 'useItem', itemId: got.medicine, monsterId: monster.id })
      count.ailmentsCured++
    } else if (monster.assignment?.kind === 'dwelling') {
      state = simAct(data, state, { type: 'unassignWorker', monsterId: monster.id })
      count.sickRested++
    }
  }
  return state
}

/** Món ăn chính người chơi mô phỏng nấu cho hộp thức ăn, số ngày ăn muốn giữ sẵn trong hộp. */
const FEED_ITEM_ID = 'beastFeed'
const FEED_DAYS = 7

/** Tổng độ no trong hộp thức ăn. */
const feedBoxFullness = (data: GameData, state: GameState): number =>
  Object.entries(state.dwelling.feedBox).reduce(
    (sum, [itemId, n]) => sum + (data.config.dwelling.foods[itemId]?.fullness ?? 0) * n,
    0
  )

/**
 * Hộp thức ăn dưới mức FEED_DAYS ngày đói của mọi quái làm việc: nấu Thức ăn linh thú (mua nguyên
 * liệu cụ thể khi cửa hàng bán) tới đủ, rồi bỏ món ăn chính có trong túi vào hộp.
 */
function stockFeed(data: GameData, state: GameState, count: EconomyCount): GameState {
  const workers = state.storage.filter((m) => m.assignment?.kind === 'dwelling').length
  const food = data.config.dwelling.foods[FEED_ITEM_ID]
  const recipe = Object.values(data.recipes).find((r) => r.output.itemId === FEED_ITEM_ID)
  if (workers === 0 || !food || food.fullness <= 0 || !recipe) return state
  const target = workers * FEED_DAYS * data.config.dwelling.needs.hungerPerDay
  const needed = (): number =>
    Math.ceil((target - feedBoxFullness(data, state)) / food.fullness) -
    getItemCount(state.inventory, FEED_ITEM_ID)
  while (needed() > 0) {
    for (const input of recipe.inputs) {
      if (!('itemId' in input) || getItemCount(state.inventory, input.itemId) >= input.count)
        continue
      const item = { storage: 'stack', itemId: input.itemId } as const
      const sold = shopStock(state).some((e) => e.storage === 'stack' && e.itemId === input.itemId)
      if (
        !sold ||
        state.money.lt(itemBuyPrice(data, item, state.highestFloor).times(input.count))
      ) {
        continue
      }
      state = simAct(data, state, { type: 'buyItem', item, count: input.count })
    }
    if (craftableTimes(data, state, recipe) <= 0) break
    state = simAct(data, state, { type: 'craft', recipeId: recipe.id, times: 1 })
  }
  const have = getItemCount(state.inventory, FEED_ITEM_ID)
  if (have === 0) return state
  count.feedStocked += have
  return simAct(data, state, { type: 'stockFeedBox', itemId: FEED_ITEM_ID, count: have })
}
