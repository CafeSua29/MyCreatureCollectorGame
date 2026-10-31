// Câu cá và khai thác trong mô phỏng (mục "Câu cá và khai thác" ở simulation-features.md,
// docs/rules/gathering.md): mỗi (tầng × cách chơi: cách thu thập, dụng cụ, mồi câu) thu thập `casts`
// lần bằng action thật ở một map câu cá và khai thác được (cùng map cho mọi cách chơi của tầng), trận
// mở ra đánh bằng AI (runBattle chạy lại đúng action, tất định). Cách chơi `wild` đánh quái hoang
// thường ở cùng map để so giá trị mỗi giờ.

import {
  addItems,
  createGameState,
  gameReducer,
  type GameAction,
  type GameData,
  type GameState
} from '@core'
import { runBattle } from './battleRunner'
import { assumedTamerRealm } from './tamer'
import { buildTeam, deriveSeed } from './team'
import { priceOf, stackValue } from './zones'
import type { GatheringRun, TeamSpec } from './scenarios'

export interface GatheringRow {
  floor: number
  run: GatheringRun
  biomeId: string
  casts: number
  battles: number
  battlesWon: number
  /** Trận gặp loài hiếm (catchRate < RARE_CATCH_RATE). */
  rareEncounters: number
  /** Tổng level quái địch (chia battles ra trung bình). */
  enemyLevelSum: number
  hours: number
  /** Tổng giá gốc đồ nhận được (kể cả đồ rơi trong trận), tiền thắng trận, giá mồi câu đã dùng. */
  itemValue: number
  money: number
  lureCost: number
}

/** Loài hiếm như khu bảo tồn (catchRate thang 0–100). */
const RARE_CATCH_RATE = 30

/** Action của một lần theo cách chơi. */
function actionOf(run: GatheringRun): GameAction {
  switch (run.method) {
    case 'fishing':
      return { type: 'fish', ...(run.lureItemId ? { lureItemId: run.lureItemId } : {}) }
    case 'mining':
      return { type: 'mine' }
    case 'wild':
      return { type: 'startWildBattle' }
  }
}

/**
 * Map của tầng: map có cả câu cá lẫn khai thác (mọi cách chơi ở một tầng cùng map để so được, kể
 * cả wild), chọn theo seed để mỗi tầng một map khác nhau.
 */
function mapFor(data: GameData, seed: number): string {
  const ids = Object.values(data.biomes)
    .filter((biome) => biome.gathering?.fishing && biome.gathering.mining)
    .map((biome) => biome.id)
  if (ids.length === 0)
    throw new Error('Mô phỏng thu thập: không có map nào câu cá và khai thác được')
  return ids[seed % ids.length]
}

const catchRateOf = (data: GameData, speciesId: string): number => {
  const species = data.species[speciesId]
  return species?.kind === 'normal' ? species.catchRate : 100
}

/** Hồi máu, về lại tầng giữa hai lần (giả định: không tính giờ, như đội đã tự hồi bằng vật phẩm). */
const refresh = (state: GameState, floor: number): GameState => ({
  ...state,
  location: { type: 'floor', floor },
  party: state.party.map((m) => ({ ...m, damageTaken: m.damageTaken.times(0), statuses: [] }))
})

/** Một lần: thu thập (hoặc trận quái hoang), trận mở ra đánh tới hết. */
function castOnce(
  data: GameData,
  state: GameState,
  { row, action, limits }: { row: GatheringRow; action: GameAction; limits: { maxTurns: number } }
): GameState {
  // Trận quái hoang có thể gặp event trước: runBattle tự giải quyết event rồi đánh (không đo loài).
  if (action.type !== 'startWildBattle') {
    const opened = gameReducer(data, state, action)
    if (!opened.battle) return opened
    const enemy = opened.battle.enemies[0]
    row.enemyLevelSum += enemy.level
    if (catchRateOf(data, enemy.speciesId) < RARE_CATCH_RATE) row.rareEncounters++
  }
  row.battles++
  const result = runBattle(data, state, { kind: 'wild', maxTurns: limits.maxTurns, start: action })
  if (result.stats.outcome === 'won') {
    row.battlesWon++
    row.money += result.stats.money.toNumber()
  }
  return result.state
}

/** Một (tầng × cách chơi): `casts` lần liên tiếp với đội mẫu ở tầng đó. */
export function runGathering(
  data: GameData,
  {
    floor,
    run,
    team,
    casts,
    seed,
    limits
  }: {
    floor: number
    run: GatheringRun
    team: TeamSpec
    casts: number
    seed: number
    limits: { maxTurns: number }
  }
): GatheringRow {
  const runSeed = deriveSeed(seed, 'gathering', run.id, floor)
  const biomeId = mapFor(data, deriveSeed(seed, 'gathering', floor))
  const row: GatheringRow = {
    floor,
    run,
    biomeId,
    casts,
    battles: 0,
    battlesWon: 0,
    rareEncounters: 0,
    enemyLevelSum: 0,
    hours: 0,
    itemValue: 0,
    money: 0,
    lureCost: 0
  }
  const base = createGameState({
    // Mô phỏng đo với thọ nguyên bật (game mới mặc định tắt, docs/rules/options.md).
    lifespanEnabled: true,
    seed: runSeed,
    party: buildTeam(data, team, floor, runSeed),
    floorBiomeIds: Array.from({ length: floor }, () => biomeId),
    tamerRealm: assumedTamerRealm(floor),
    location: { type: 'floor', floor }
  })
  let inventory = base.inventory
  if (run.toolItemId) inventory = addItems(inventory, run.toolItemId, 1)
  if (run.lureItemId) inventory = addItems(inventory, run.lureItemId, casts)
  let state: GameState = { ...base, inventory }
  const action = actionOf(run)
  const startTime = state.time
  const startValue = stackValue(data, state.inventory, floor)
  for (let i = 0; i < casts; i++) {
    state = castOnce(data, refresh(state, floor), { row, action, limits })
  }
  row.hours = state.time - startTime
  row.lureCost = run.lureItemId ? priceOf(data, run.lureItemId, floor) * casts : 0
  // Mồi đã dùng làm túi giảm: cộng lại để itemValue là đồ nhận được.
  row.itemValue = stackValue(data, state.inventory, floor) - startValue + row.lureCost
  return row
}
