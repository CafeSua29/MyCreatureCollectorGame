// Hiểm địa trong mô phỏng (mục "Hiểm địa" ở simulation-features.md, docs/rules/zones.md): mỗi
// (hiểm địa × tầng) vào `visits` lần bằng action thật với đội mẫu ở tầng đó. Trước mỗi lượt vào: hồi
// máu ở thị trấn, mang đủ đồ tiếp tế (`supplies`) và vật phẩm điều kiện của hiểm địa; giữa các bước
// dùng đồ tiếp tế (hồi sinh quái gục, hồi máu quái dưới ngưỡng, chữa trạng thái). Đo tỉ lệ xong / thua,
// trận, boss canh giữ, giờ, giá trị đồ nhận được và giá đồ đã dùng mỗi lượt vào.

import {
  createGameState,
  gameReducer,
  getMaxHp,
  isFainted,
  itemBasePrice,
  type GameData,
  type GameState,
  type Inventory,
  type ItemReward,
  type Monster
} from '@core'
import { runBattle, type BattleKind } from './battleRunner'
import { floorMapsFor } from './floorSweep'
import { assumedTamerRealm } from './tamer'
import { buildTeam, deriveSeed } from './team'
import type { TeamSpec, ZoneSupplies } from './scenarios'

type VisitEnd = 'completed' | 'failed' | 'abandoned'

export interface ZoneRow {
  zoneId: string
  floor: number
  visits: number
  /** Lượt vào kết thúc bằng hạ / bắt boss canh giữ, thua, hết lượt trận (rời hiểm địa). */
  completed: number
  failed: number
  abandoned: number
  battles: number
  battlesWon: number
  guardianBattles: number
  guardianWins: number
  /** Tổng giờ game của mọi lượt vào. */
  hours: number
  /** Tổng giá gốc đồ gộp chồng nhận được (không trừ đồ đã dùng), tiền thắng trận. */
  lootValue: number
  money: number
  /** Số món tiếp tế đã dùng và tổng giá gốc đồ đã dùng (kể cả vật phẩm điều kiện đã tiêu). */
  suppliesUsed: number
  supplyCost: number
}

const priceOf = (data: GameData, itemId: string, floor: number): number =>
  itemBasePrice(data, { storage: 'stack', itemId }, floor).toNumber()

/** Tổng giá gốc (theo tầng) của item gộp chồng trong túi. */
function stackValue(data: GameData, inventory: Inventory, floor: number): number {
  let total = 0
  for (const [itemId, count] of Object.entries(inventory.stacks)) {
    total += priceOf(data, itemId, floor) * count
  }
  return total
}

/** Đồ mang vào: đồ tiếp tế + vật phẩm của điều kiện vào (chìa khóa). */
function packingList(data: GameData, zoneId: string, supplies: ZoneSupplies): ItemReward[] {
  const keys = data.zones[zoneId].requirements.flatMap((req) =>
    req.type === 'item' ? [{ itemId: req.itemId, count: req.count }] : []
  )
  return [
    { itemId: supplies.reviveItemId, count: supplies.revives },
    { itemId: supplies.healItemId, count: supplies.heals },
    { itemId: supplies.cureItemId, count: supplies.cures },
    ...keys
  ]
}

/** Túi chỉ còn đúng danh sách mang vào (đồ nhận ở lượt trước đã tính giá). */
function packInventory(state: GameState, list: readonly ItemReward[]): Inventory {
  const stacks: Record<string, number> = {}
  for (const { itemId, count } of list) {
    if (count > 0) stacks[itemId] = (stacks[itemId] ?? 0) + count
  }
  return { ...state.inventory, stacks }
}

/** Hồi máu ở thị trấn nếu cần, tua tới ngày hiểm địa mở lại (bỏ qua thời gian khóa). */
function prepareVisit(data: GameData, state: GameState, zoneId: string): GameState {
  const hurt = state.party.some((m) => m.damageTaken.gt(0) || m.statuses.length > 0)
  const healed = hurt ? gameReducer(data, state, { type: 'healParty' }) : state
  const reopenDay = healed.zones.reopenDay[zoneId] ?? 0
  return { ...healed, time: Math.max(healed.time, reopenDay * 24) }
}

/** Vật phẩm người chơi dùng cho một quái giữa hai bước (null = không cần). */
function supplyFor(data: GameData, monster: Monster, supplies: ZoneSupplies): string | null {
  if (isFainted(data, monster)) return supplies.reviveItemId
  const maxHp = getMaxHp(data, monster)
  // Máu còn dưới healBelowPercent % thì hồi.
  if (monster.damageTaken.times(100).gt(maxHp.times(100 - supplies.healBelowPercent))) {
    return supplies.healItemId
  }
  return monster.statuses.length > 0 ? supplies.cureItemId : null
}

/** Dùng đồ tiếp tế cho cả đội (mỗi quái tối đa hai món: hồi sinh rồi hồi máu / chữa). */
function applySupplies(
  data: GameData,
  state: GameState,
  { supplies, row, floor }: { supplies: ZoneSupplies; row: ZoneRow; floor: number }
): GameState {
  let current = state
  for (const { id } of state.party) {
    for (let i = 0; i < 2; i++) {
      const monster = current.party.find((m) => m.id === id)
      const itemId = monster ? supplyFor(data, monster, supplies) : null
      if (!itemId || (current.inventory.stacks[itemId] ?? 0) < 1) break
      current = gameReducer(data, current, { type: 'useItem', itemId, monsterId: id })
      row.suppliesUsed++
      row.supplyCost += priceOf(data, itemId, floor)
    }
  }
  return current
}

/**
 * Một bước khám phá; bước mở trận đánh bằng AI (runBattle chạy lại đúng bước đó, tất định). `ended`:
 * cách lượt vào kết thúc ở bước này (null = còn tiếp).
 */
function exploreStep(
  data: GameData,
  state: GameState,
  { row, limits }: { row: ZoneRow; limits: { maxTurns: number; maxTurnsBoss: number } }
): { state: GameState; ended: VisitEnd | null } {
  const explored = gameReducer(data, state, { type: 'exploreZone' })
  const special = explored.battle?.special
  if (special?.kind !== 'zone') return { state: explored, ended: null }
  const kind: BattleKind = explored.battle?.isBoss ? 'boss' : 'wild'
  const run = runBattle(data, state, {
    kind,
    maxTurns: kind === 'boss' ? limits.maxTurnsBoss : limits.maxTurns,
    start: { type: 'exploreZone' }
  })
  row.battles++
  if (special.guardian) row.guardianBattles++
  switch (run.stats.outcome) {
    case 'won':
      row.battlesWon++
      row.money += run.stats.money.toNumber()
      if (!special.guardian) return { state: run.state, ended: null }
      row.guardianWins++
      return { state: run.state, ended: 'completed' }
    case 'timeout':
      // Hết lượt trận: state về trước bước; người chơi rời hiểm địa.
      return {
        state: gameReducer(data, run.state, { type: 'leaveZone' }),
        ended: 'abandoned'
      }
    default:
      return { state: run.state, ended: run.state.zones.visit ? null : 'failed' }
  }
}

/** Một (hiểm địa × tầng): `visits` lượt vào liên tiếp với đội mẫu ở tầng đó. */
export function runZone(
  data: GameData,
  {
    zoneId,
    floor,
    team,
    visits,
    supplies,
    seed,
    limits
  }: {
    zoneId: string
    floor: number
    team: TeamSpec
    visits: number
    supplies: ZoneSupplies
    seed: number
    limits: { maxTurns: number; maxTurnsBoss: number }
  }
): ZoneRow {
  const runSeed = deriveSeed(seed, 'zones', zoneId, floor)
  const row: ZoneRow = {
    zoneId,
    floor,
    visits,
    completed: 0,
    failed: 0,
    abandoned: 0,
    battles: 0,
    battlesWon: 0,
    guardianBattles: 0,
    guardianWins: 0,
    hours: 0,
    lootValue: 0,
    money: 0,
    suppliesUsed: 0,
    supplyCost: 0
  }
  const packing = packingList(data, zoneId, supplies)
  let state = createGameState({
    // Mô phỏng đo với thọ nguyên bật (game mới mặc định tắt, docs/rules/options.md).
    lifespanEnabled: true,
    seed: runSeed,
    party: buildTeam(data, team, floor, runSeed),
    floorBiomeIds: floorMapsFor(data, { floor, biomeId: null, seed: runSeed }),
    tamerRealm: assumedTamerRealm(floor)
  })
  for (let i = 0; i < visits; i++) {
    state = prepareVisit(data, state, zoneId)
    state = { ...state, inventory: packInventory(state, packing) }
    const startTime = state.time
    const startValue = stackValue(data, state.inventory, floor)
    const costBefore = row.supplyCost
    state = gameReducer(data, state, { type: 'enterZone', zoneId })
    // Vật phẩm điều kiện đã tiêu khi vào: tính là đồ đã dùng.
    row.supplyCost += startValue - stackValue(data, state.inventory, floor)
    let ended: VisitEnd | null = null
    while (state.zones.visit) {
      state = applySupplies(data, state, { supplies, row, floor })
      ;({ state, ended } = exploreStep(data, state, { row, limits }))
    }
    row[ended ?? 'abandoned']++
    row.hours += state.time - startTime
    // Đồ nhận được = chênh lệch túi + giá đồ đã dùng trong lượt (dùng đồ làm túi giảm).
    const used = row.supplyCost - costBefore
    row.lootValue += stackValue(data, state.inventory, floor) - startValue + used
  }
  return row
}
