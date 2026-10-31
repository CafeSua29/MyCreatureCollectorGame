// Ngự thú sư NPC trong chơi liên tục (mục "Ngự thú sư NPC" ở simulation-features.md,
// docs/rules/trainers.md): mỗi lần ở thị trấn (đã hồi máu), "người chơi" dự giải đấu nếu đang mở
// (đánh tới khi vô địch / bị loại), đánh đấu trường một trận, rồi thách đạo quán chưa có huy hiệu
// thấp nhất (đi tới tầng đó, đánh tới khi có huy hiệu hoặc thua), về thị trấn hồi máu lại.

import { dayOf, type GameAction, type GameData, type GameState } from '@core'
import { runBattle } from './battleRunner'
import { simAct } from './events'

export interface TrainerRunResult {
  state: GameState
  battles: number
  wins: number
  badges: number
  tournamentsWon: number
}

/** Đánh một trận NPC mở bằng `start`; trả state sau trận và có thắng không. */
function fight(
  data: GameData,
  state: GameState,
  { start, maxTurns }: { start: GameAction; maxTurns: number }
): { state: GameState; won: boolean } {
  const run = runBattle(data, state, { kind: 'wild', maxTurns, start })
  return { state: run.state, won: run.stats.outcome === 'won' }
}

const heal = (data: GameData, state: GameState): GameState =>
  state.party.some((m) => m.damageTaken.gt(0) || m.statuses.length > 0)
    ? simAct(data, state, { type: 'healParty' })
    : state

const tournamentOpen = (data: GameData, state: GameState): boolean =>
  Math.floor(dayOf(state.time) / data.config.trainers.tournament.everyDays) >
  state.trainers.tournament.lastPeriod

/** Việc NPC ở thị trấn (state đang ở thị trấn, ngoài trận). */
export function runTrainerChallenges(
  data: GameData,
  state: GameState,
  { maxTurns }: { maxTurns: number }
): TrainerRunResult {
  const result: TrainerRunResult = { state, battles: 0, wins: 0, badges: 0, tournamentsWon: 0 }
  const play = (start: GameAction): boolean => {
    const fought = fight(data, result.state, { start, maxTurns })
    result.state = fought.state
    result.battles++
    if (fought.won) result.wins++
    return fought.won
  }
  if (tournamentOpen(data, result.state)) {
    result.state = simAct(data, result.state, { type: 'enterTournament' })
    while (result.state.trainers.tournament.round !== null) {
      if (!play({ type: 'challengeTournament' })) break
    }
    if (result.state.trainers.tournament.round !== null) {
      result.state = simAct(data, result.state, { type: 'forfeitTournament' })
    } else if (result.wins === data.config.trainers.tournament.rounds.length) {
      result.tournamentsWon++
    }
    result.state = heal(data, result.state)
  }
  play({ type: 'challengeArena' })
  result.state = heal(data, result.state)
  const gym = result.state.trainers.gyms.find((entry) => entry.wins === 0)
  if (!gym) return result
  result.state = simAct(data, result.state, {
    type: 'travel',
    to: { type: 'floor', floor: gym.floor }
  })
  for (let i = 0; i <= gym.trainerCount; i++) {
    if (!play({ type: 'challengeGym' })) break
  }
  if ((result.state.trainers.gyms.find((entry) => entry.floor === gym.floor)?.wins ?? 0) > 0) {
    result.badges++
  }
  result.state = heal(data, simAct(data, result.state, { type: 'travel', to: { type: 'town' } }))
  return result
}
