// Bí cảnh và tháp thí luyện trong chơi liên tục (mục "Bí cảnh và tháp thí luyện" ở
// simulation-features.md, docs/rules/trials.md): mỗi lần ở thị trấn (đã hồi máu), có Bí Cảnh Lệnh
// thì "người chơi" vào bí cảnh và đánh từng trận tới khi xong / thua (hết lượt thì bỏ cuộc), rồi
// leo tháp tới khi thua hoặc đủ `towerAttempts` tầng, về hồi máu lại.

import { getItemCount, type GameAction, type GameData, type GameState } from '@core'
import { runBattle } from './battleRunner'
import { simAct } from './events'

export interface TrialRunResult {
  state: GameState
  /** Số bí cảnh đã vào / đã hoàn thành. */
  entered: number
  completed: number
  /** Số trận bí cảnh đã đánh. */
  realmBattles: number
  /** Số tầng tháp đã thắng / số trận tháp. */
  towerWins: number
  towerBattles: number
}

const heal = (data: GameData, state: GameState): GameState =>
  state.trial === null && state.party.some((m) => m.damageTaken.gt(0) || m.statuses.length > 0)
    ? simAct(data, state, { type: 'healParty' })
    : state

/** Trần lượt của trận thường / trận boss (như chơi liên tục). */
export interface TurnLimits {
  maxTurns: number
  maxTurnsBoss: number
}

/** Đánh một trận mở bằng `start` (trận boss dùng trần lượt boss); trả state sau trận, có thắng. */
function fight(
  data: GameData,
  state: GameState,
  { start, isBoss, limits }: { start: GameAction; isBoss: boolean; limits: TurnLimits }
): { state: GameState; won: boolean } {
  const maxTurns = isBoss ? limits.maxTurnsBoss : limits.maxTurns
  const run = runBattle(data, state, { kind: isBoss ? 'boss' : 'wild', maxTurns, start })
  return { state: run.state, won: run.stats.outcome === 'won' }
}

/**
 * Đi hết bí cảnh vừa vào: đánh lần lượt tới khi xong hoặc không thắng (thua thì bí cảnh tự kết thúc;
 * hết lượt thì state về trước trận nên bỏ cuộc). Trả true nếu hoàn thành.
 */
function clearRealm(data: GameData, result: TrialRunResult, limits: TurnLimits): boolean {
  const realm = result.state.trial
  const total = realm?.kind === 'realm' ? realm.battleCount : 0
  let wins = 0
  while (result.state.trial !== null) {
    // Trận cuối là boss (luật bossOnly cũng vậy nhưng mô phỏng chỉ xét trận cuối).
    const isBoss = result.state.trial.cleared + 1 >= total
    const fought = fight(data, result.state, {
      start: { type: 'challengeTrial' },
      isBoss,
      limits
    })
    result.state = fought.state
    result.realmBattles++
    if (!fought.won) break
    wins++
  }
  if (result.state.trial !== null) {
    result.state = simAct(data, result.state, { type: 'abandonTrial' })
  }
  return wins === total
}

/** Việc bí cảnh / tháp ở thị trấn (state đang ở thị trấn, ngoài trận). */
export function runTrials(
  data: GameData,
  state: GameState,
  { limits, towerAttempts }: { limits: TurnLimits; towerAttempts: number }
): TrialRunResult {
  const result: TrialRunResult = {
    state,
    entered: 0,
    completed: 0,
    realmBattles: 0,
    towerWins: 0,
    towerBattles: 0
  }
  if (getItemCount(result.state.inventory, data.config.trials.tokenItemId) > 0) {
    result.state = simAct(data, result.state, { type: 'enterTrial' })
    result.entered++
    if (clearRealm(data, result, limits)) result.completed++
    result.state = heal(data, result.state)
  }
  for (let i = 0; i < towerAttempts; i++) {
    const isBoss = (result.state.tower.highest + 1) % data.config.trials.tower.bossEvery === 0
    const fought = fight(data, result.state, { start: { type: 'challengeTower' }, isBoss, limits })
    result.state = heal(data, fought.state)
    result.towerBattles++
    if (!fought.won) break
    result.towerWins++
  }
  return result
}
