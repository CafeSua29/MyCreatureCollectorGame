// Thức tỉnh trong chơi liên tục (mục "Độ kiếp" ở simulation-features.md, docs/rules/awakening.md):
// ở thị trấn, "người chơi" cho quái đội mẫu đủ level độ kiếp (mua Thức tỉnh đan cùng hệ nếu thiếu và
// cửa hàng có bán), hồi máu sau mỗi lần. Không thử khi lần này thua là chết (người chơi thận trọng).

import {
  anyOfItemCount,
  awakeningPillIds,
  awakeningRequirements,
  humanFormBlocker,
  humanFormCost,
  getItemCount,
  isFainted,
  itemBuyPrice,
  type GameData,
  type GameState,
  type Monster
} from '@core'
import { runBattle } from './battleRunner'
import { simAct, shopStock } from './events'

export interface AwakeningTry {
  state: GameState
  successes: number
  failures: number
}

/** Quái đội mẫu đủ điều kiện độ kiếp (trừ tiền / đan): level, không trọng thương, còn đường lui. */
function canTry(data: GameData, monster: Monster): boolean {
  const config = data.config.awakening
  return (
    monster.level >= awakeningRequirements(config, monster.awakening).level &&
    monster.injuryBattlesLeft === 0 &&
    monster.tribulationFailures < config.maxFailures &&
    !isFainted(data, monster)
  )
}

/**
 * Có quái đội mẫu đủ điều kiện độ kiếp và túi đã đủ tiền / đan (người chơi về thị trấn để độ kiếp).
 * Thiếu đan thì không về riêng vì cửa hàng chưa chắc bán; đan mua khi tình cờ ở thị trấn.
 */
export const readyToAwaken = (
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): boolean =>
  state.party.some((m) => teamIds.has(m.id) && canTry(data, m) && canPay(data, state, m))

/**
 * Mua thêm Thức tỉnh đan cùng hệ cho đủ `need` nếu cửa hàng đang bán một loại đan của quái và đủ tiền
 * (cả tiền độ kiếp); nhiều loại thì loại của hệ trước.
 */
function buyPills(data: GameData, state: GameState, monster: Monster): GameState {
  const config = data.config.awakening
  const need = awakeningRequirements(config, monster.awakening)
  const pillIds = awakeningPillIds(config, monster)
  const missing = need.pills - anyOfItemCount(state.inventory, pillIds)
  if (missing <= 0) return state
  const pillId = pillIds.find((id) =>
    shopStock(state).some((entry) => entry.storage === 'stack' && entry.itemId === id)
  )
  if (pillId === undefined) return state
  const item = { storage: 'stack', itemId: pillId } as const
  const price = itemBuyPrice(data, item, state.highestFloor).times(missing)
  if (state.money.lt(price.plus(need.money))) return state
  return simAct(data, state, { type: 'buyItem', item, count: missing })
}

/** Đủ tiền và đan cho lần độ kiếp của quái. */
function canPay(data: GameData, state: GameState, monster: Monster): boolean {
  const config = data.config.awakening
  const need = awakeningRequirements(config, monster.awakening)
  const pills = anyOfItemCount(state.inventory, awakeningPillIds(config, monster))
  return state.money.gte(need.money) && pills >= need.pills
}

/**
 * Ở thị trấn: quái đội mẫu đủ điều kiện hóa hình thì hóa hình (mua Hóa Hình Đan nếu thiếu và cửa
 * hàng bán; docs/rules/human-form.md). Trả về state và số quái vừa hóa hình.
 */
export function takeHumanFormWhenPossible(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; taken: number } {
  const { pillItemId } = data.config.humanForm
  let taken = 0
  for (const monster of state.party) {
    if (!teamIds.has(monster.id) || humanFormBlocker(data, monster) !== null) continue
    if (monster.injuryBattlesLeft > 0 || isFainted(data, monster)) continue
    const cost = humanFormCost(data, monster)
    if (getItemCount(state.inventory, pillItemId) < 1) {
      const item = { storage: 'stack', itemId: pillItemId } as const
      const sold = shopStock(state).some((e) => e.storage === 'stack' && e.itemId === pillItemId)
      if (!sold || state.money.lt(itemBuyPrice(data, item, state.highestFloor).plus(cost))) continue
      state = simAct(data, state, { type: 'buyItem', item, count: 1 })
    }
    if (state.money.lt(cost)) continue
    state = simAct(data, state, { type: 'takeHumanForm', monsterId: monster.id })
    taken++
  }
  return { state, taken }
}

/** Ở thị trấn: mỗi quái đội mẫu độ kiếp liên tục tới khi không còn đủ điều kiện hoặc thua. */
export function awakenWhilePossible(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): AwakeningTry {
  let successes = 0
  let failures = 0
  const maxTurns = data.config.awakening.tribulation.maxTurns + 1
  for (const id of teamIds) {
    for (;;) {
      const monster = state.party.find((m) => m.id === id)
      if (!monster || !canTry(data, monster)) break
      state = buyPills(data, state, monster)
      if (!canPay(data, state, monster)) break
      const before = monster.awakening
      const { stats, state: after } = runBattle(data, state, {
        kind: 'boss',
        maxTurns,
        start: { type: 'startTribulation', monsterId: id }
      })
      // NPC hồi máu (cả quái còn 1 HP sau khi thua); đội đầy máu thì NPC báo lỗi nên bỏ qua.
      const hurt = after.party.some((m) => m.damageTaken.gt(0) || m.statuses.length > 0)
      state = hurt ? simAct(data, after, { type: 'healParty' }) : after
      const awakened = state.party.find((m) => m.id === id)
      if (stats.outcome === 'won' && awakened && awakened.awakening > before) successes++
      else failures++
    }
  }
  return { state, successes, failures }
}
