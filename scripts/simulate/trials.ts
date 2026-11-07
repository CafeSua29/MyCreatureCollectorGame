// Bí cảnh và tháp thí luyện trong chơi liên tục (mục "Bí cảnh và tháp thí luyện" ở
// simulation-features.md, docs/rules/trials.md): mỗi lần ở thị trấn (đã hồi máu), có Bí Cảnh Lệnh
// thì "người chơi" vào bí cảnh và đánh từng trận tới khi xong / thua (hết lượt thì bỏ cuộc), rồi
// leo tháp tới khi thua hoặc đủ `towerAttempts` tầng, về hồi máu lại. Sau mỗi trận thắng có lựa chọn
// ân huệ (docs/rules/trial-boons.md) thì chọn ân huệ điểm cao nhất (bestTrialBoon); mỗi bí cảnh chạy
// thêm bản đối chứng tắt ân huệ từ cùng state để so cặp.

import {
  TRIAL_BOON_RARITIES,
  getItemCount,
  type GameAction,
  type GameData,
  type GameState
} from '@core'
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
  /** Số ân huệ đã chọn. */
  boonsChosen: number
  /**
   * Số bí cảnh hoàn thành ở bản đối chứng tắt ân huệ: cùng state lúc vào (cùng bí cảnh, cùng RNG),
   * chỉ đếm, không giữ state (so cặp, docs/rules/trial-boons.md mục "Mô phỏng").
   */
  completedNoBoons: number
}

/** Hook chỉ có ích trong tình huống riêng (hệ / race của địch, trạng thái gặp phải...). */
const SITUATIONAL_HOOKS: ReadonlySet<string> = new Set([
  'elementDamageTaken',
  'damageVsRace',
  'statusImmunity',
  'statusDamageModifier',
  'recoilImmunity'
])

/** Điểm mỗi bậc hiếm; ân huệ tình huống / ấn hệ không hợp đội trừ điểm (dưới ân huệ chung cùng bậc). */
const RARITY_SCORE = 10
const SITUATIONAL_PENALTY = 5
const MISMATCH_PENALTY = 15
/** Ân huệ nhắm boss cuối (bossWeaken, hook điều kiện bossBattle): trận người chơi hay thua nhất. */
const BOSS_BONUS = 3

/** Hook có điều kiện trận boss (`when` chứa bossBattle). */
const isBossHook = (params: unknown): boolean =>
  JSON.stringify((params as { when?: unknown }).when ?? []).includes('"bossBattle"')

/** Điểm của một ân huệ với đội hiện tại: bậc hiếm, cộng điểm nếu nhắm boss, trừ điểm nếu khó có ích. */
function boonScore(data: GameData, state: GameState, boonId: string): number {
  const def = data.trialBoons[boonId]
  const partyElements = new Set(state.party.flatMap((monster) => monster.elementIds))
  let score = TRIAL_BOON_RARITIES.indexOf(def.rarity) * RARITY_SCORE
  for (const effect of def.effects) {
    if (effect.type === 'bossWeaken') score += BOSS_BONUS
    if (effect.type !== 'hooks') continue
    for (const hook of effect.hooks) {
      if (isBossHook(hook.params)) score += BOSS_BONUS
      if (SITUATIONAL_HOOKS.has(hook.type)) score -= SITUATIONAL_PENALTY
      // Ép kiểu: params của elementDamageDealt đã qua kiểm tra dữ liệu.
      const elementIds = (hook.params as { elementIds?: string[] }).elementIds
      if (hook.type === 'elementDamageDealt' && !elementIds?.some((id) => partyElements.has(id))) {
        score -= MISMATCH_PENALTY
      }
    }
  }
  return score
}

/**
 * Ân huệ đang chờ có điểm cao nhất (bậc hiếm, tránh ân huệ không hợp đội; bằng thì lựa chọn đầu);
 * không chờ thì null.
 */
export function bestTrialBoon(data: GameData, state: GameState): string | null {
  if (state.trial?.kind !== 'realm') return null
  let best: string | null = null
  let bestScore = -Infinity
  for (const boonId of state.trial.boonChoices) {
    const score = boonScore(data, state, boonId)
    if (score > bestScore) [best, bestScore] = [boonId, score]
  }
  return best
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

interface RealmRun {
  state: GameState
  completed: boolean
  battles: number
  boonsChosen: number
}

/**
 * Đi hết bí cảnh vừa vào: đánh lần lượt tới khi xong hoặc không thắng (thua thì bí cảnh tự kết thúc;
 * hết lượt thì state về trước trận nên bỏ cuộc); sau mỗi trận thắng chọn ân huệ tốt nhất.
 */
function clearRealm(data: GameData, start: GameState, limits: TurnLimits): RealmRun {
  const run: RealmRun = { state: start, completed: false, battles: 0, boonsChosen: 0 }
  const realm = start.trial
  const total = realm?.kind === 'realm' ? realm.battleCount : 0
  let wins = 0
  while (run.state.trial !== null) {
    // Trận cuối là boss (luật bossOnly cũng vậy nhưng mô phỏng chỉ xét trận cuối).
    const isBoss = run.state.trial.cleared + 1 >= total
    const fought = fight(data, run.state, { start: { type: 'challengeTrial' }, isBoss, limits })
    run.state = fought.state
    run.battles++
    if (!fought.won) break
    wins++
    const boonId = bestTrialBoon(data, run.state)
    if (boonId !== null) {
      run.state = simAct(data, run.state, { type: 'chooseTrialBoon', boonId })
      run.boonsChosen++
    }
  }
  if (run.state.trial !== null) run.state = simAct(data, run.state, { type: 'abandonTrial' })
  run.completed = wins === total
  return run
}

/** Dữ liệu đối chứng tắt ân huệ (không tung lựa chọn nào), tạo một lần cho mỗi GameData. */
const BOONLESS = new WeakMap<GameData, GameData>()

function boonlessData(data: GameData): GameData {
  const cached = BOONLESS.get(data)
  if (cached) return cached
  const { boons } = data.config.trials
  const off: GameData = {
    ...data,
    config: {
      ...data.config,
      trials: {
        ...data.config.trials,
        boons: { ...boons, choiceCount: 0, rarityWeights: { common: 0, rare: 0, epic: 0 } }
      }
    }
  }
  BOONLESS.set(data, off)
  return off
}

/** Có ân huệ để tung không (không thì bản đối chứng giống hệt, khỏi chạy lại). */
const hasBoons = (data: GameData): boolean =>
  Object.keys(data.trialBoons).length > 0 &&
  Object.values(data.config.trials.boons.rarityWeights).some((weight) => weight > 0)

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
    towerBattles: 0,
    boonsChosen: 0,
    completedNoBoons: 0
  }
  if (getItemCount(result.state.inventory, data.config.trials.tokenItemId) > 0) {
    const entered = simAct(data, result.state, { type: 'enterTrial' })
    result.entered++
    const run = clearRealm(data, entered, limits)
    const control = hasBoons(data) ? clearRealm(boonlessData(data), entered, limits) : run
    if (run.completed) result.completed++
    if (control.completed) result.completedNoBoons++
    result.realmBattles += run.battles
    result.boonsChosen += run.boonsChosen
    result.state = heal(data, run.state)
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
