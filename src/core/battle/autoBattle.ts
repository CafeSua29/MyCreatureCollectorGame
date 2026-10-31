// Tự động đánh (docs/rules/auto-battle.md): phần core chỉ gồm hàm thuần; vòng lặp tự farm chạy ở
// renderer bằng các action có sẵn (startWildBattle, submitTurn với suggestBattleCommands,
// leaveBattle, rest). Ở đây: quái nào chặn tự đánh (chiến thuật "theo lệnh"), lý do dừng tự farm sau
// một trận, có tự nghỉ tiếp được không.

import { getCurrentHp, getMaxHp, isFainted } from '../monster'
import { restCost } from '../world'
import { BIG_ZERO } from '../shared'
import type { BattleEvent, GameData, GameState } from '../model'

/** Quái ta trên sân có chiến thuật "theo lệnh": không tự đánh lượt này (chờ người chơi). */
export function manualMonsterOnField(state: GameState): string | null {
  const battle = state.battle
  if (!battle) return null
  for (const id of battle.playerSlots) {
    const monster = id === null ? undefined : state.party.find((m) => m.id === id)
    if (monster?.tactic === 'manual') return monster.id
  }
  return null
}

/** Cài đặt tự farm của người chơi. */
export interface AutoFarmSettings {
  /** Dừng (hoặc tự nghỉ) khi % máu cả đội (tổng máu còn ÷ tổng max HP) dưới ngưỡng này. */
  minHpPercent: number
  /** Tự nghỉ (`rest`, tốn tiền) khi máu thấp rồi farm tiếp. */
  autoRest: boolean
}

/** Lý do dừng tự farm (UI hiện theo mã). */
export type AutoFarmStop =
  | 'monsterFainted'
  | 'lowHp'
  | 'cannotAffordRest'
  | 'shinyMet'
  | 'bossMet'
  | 'pendingChoice'
  | 'eggHatched'
  | 'manualTactic'

/** Việc tiếp theo của vòng tự farm sau khi xét state: farm tiếp, nghỉ rồi farm tiếp, hay dừng. */
export type AutoFarmStep =
  { kind: 'continue' } | { kind: 'rest' } | { kind: 'stop'; reason: AutoFarmStop }

/** Sự kiện của trận vừa đánh làm tự farm dừng (gặp shiny / boss, quái ta gục, trứng nở). */
function stopFromLog(
  log: readonly BattleEvent[],
  playerIds: readonly string[]
): AutoFarmStop | null {
  for (const event of log) {
    if (event.type === 'shinyAppeared') return 'shinyMet'
    if (event.type === 'bossAppeared') return 'bossMet'
    if (event.type === 'faint' && playerIds.includes(event.monsterId)) return 'monsterFainted'
    if (event.type === 'eggHatched') return 'eggHatched'
  }
  return null
}

/** % máu cả đội: tổng máu còn ÷ tổng max HP (0–100). */
export function partyHpPercent(data: GameData, state: GameState): number {
  let current = BIG_ZERO
  let max = BIG_ZERO
  for (const monster of state.party) {
    current = current.plus(getCurrentHp(data, monster))
    max = max.plus(getMaxHp(data, monster))
  }
  return max.lte(0) ? 0 : current.div(max).times(100).toNumber()
}

/**
 * Xét sau một trận tự đánh (trận vừa kết thúc, chưa rời hoặc đã rời trận): dừng nếu trận có sự
 * kiện dừng, có quái chờ chọn tiến hóa / học skill, đội có quái gục, có quái "theo lệnh" trong đội;
 * máu dưới ngưỡng thì nghỉ (nếu bật và đủ tiền) hoặc dừng.
 */
export function nextAutoFarmStep(
  data: GameData,
  state: GameState,
  settings: AutoFarmSettings
): AutoFarmStep {
  const playerIds = state.party.map((m) => m.id)
  const fromLog = state.battle ? stopFromLog(state.battle.log, playerIds) : null
  if (fromLog) return { kind: 'stop', reason: fromLog }
  if (state.party.some((m) => m.pendingEvolutionIds.length > 0 || m.pendingSkillIds.length > 0)) {
    return { kind: 'stop', reason: 'pendingChoice' }
  }
  if (state.party.some((m) => m.tactic === 'manual'))
    return { kind: 'stop', reason: 'manualTactic' }
  if (state.party.some((m) => isFainted(data, m))) return { kind: 'stop', reason: 'monsterFainted' }
  if (partyHpPercent(data, state) >= settings.minHpPercent) return { kind: 'continue' }
  if (!settings.autoRest) return { kind: 'stop', reason: 'lowHp' }
  if (state.money.lt(restCost(data, state))) return { kind: 'stop', reason: 'cannotAffordRest' }
  return { kind: 'rest' }
}
