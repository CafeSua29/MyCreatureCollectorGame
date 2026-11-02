// Tông môn trong chơi liên tục (mục "Tông môn" ở simulation-features.md, docs/rules/sects.md): mỗi
// ngày ở thị trấn (cùng nhịp việc NPC) "người chơi" gia nhập tông có buff tốt nhất nếu chưa ở tông,
// nộp nhiệm vụ tông đã xong, luận võ với đồng môn chức vị thấp nhất tới hết lượt trong ngày, thi
// thăng chức khi đủ cống hiến, dự tông chiến khi mở (đánh tới khi vô địch / bị loại).

import {
  sectRankThreshold,
  sectWarPeriod,
  dayOf,
  type GameAction,
  type GameData,
  type GameState,
  type SectDef
} from '@core'
import { runBattle } from './battleRunner'
import { simAct } from './events'

/** Điểm chọn tông: % chỉ số đội và % EXP (tiến trình mô phỏng đo theo level / tầng) rồi tới % tiền. */
const SECT_CHANNEL_SCORES: Readonly<Record<string, number>> = {
  teamStatPercent: 3,
  expPercent: 2,
  moneyPercent: 1
}

export interface SectRunResult {
  state: GameState
  battles: number
  wins: number
  missions: number
  promotions: number
  warsWon: number
}

function sectScore(sect: SectDef): number {
  return sect.rankBonuses.reduce((sum, effect) => {
    // Ép kiểu: kiểm tra dữ liệu đảm bảo kênh ...Percent có params.percent.
    const percent = (effect.params as { percent?: number }).percent ?? 0
    return sum + (SECT_CHANNEL_SCORES[effect.type] ?? 0) * percent
  }, 0)
}

/** Tông gia nhập được có điểm cao nhất (hòa theo thứ tự dữ liệu); null = chưa đủ cảnh giới / đang chờ. */
function bestSect(data: GameData, state: GameState): string | null {
  const { leftDay } = state.sect
  if (leftDay !== null && dayOf(state.time) < leftDay + data.config.sects.rejoinCooldownDays) {
    return null
  }
  let best: { id: string; score: number } | null = null
  for (const sect of Object.values(data.sects)) {
    if (sect.minRealm > state.tamer.realm) continue
    const score = sectScore(sect)
    if (best === null || score > best.score) best = { id: sect.id, score }
  }
  return best?.id ?? null
}

const heal = (data: GameData, state: GameState): GameState =>
  state.party.some((m) => m.damageTaken.gt(0) || m.statuses.length > 0)
    ? simAct(data, state, { type: 'healParty' })
    : state

/** Việc tông môn ở thị trấn (state đang ở thị trấn, ngoài trận, không dự giải). */
export function runSectActivities(
  data: GameData,
  state: GameState,
  { maxTurns }: { maxTurns: number }
): SectRunResult {
  const result: SectRunResult = {
    state,
    battles: 0,
    wins: 0,
    missions: 0,
    promotions: 0,
    warsWon: 0
  }
  const play = (start: GameAction): boolean => {
    const run = runBattle(data, result.state, { kind: 'wild', maxTurns, start })
    // Đang dự tông chiến thì không hồi máu giữa các vòng (như giải đấu).
    result.state = run.state.sect.war.round === null ? heal(data, run.state) : run.state
    result.battles++
    const won = run.stats.outcome === 'won'
    if (won) result.wins++
    return won
  }
  if (result.state.sect.sectId === null) {
    const sectId = bestSect(data, result.state)
    if (sectId === null) return result
    result.state = simAct(data, result.state, { type: 'joinSect', sectId })
  }
  for (const mission of result.state.quests.sect) {
    if (mission.progress < mission.target) continue
    result.state = simAct(data, result.state, { type: 'claimSectMission', questId: mission.id })
    result.missions++
  }
  // Lượt luận võ còn lại hôm nay (trận tốn giờ nên có thể đã sang ngày mới với lượt đã dùng).
  const duelsLeft = (): number => {
    const { duels } = result.state.sect
    const used = duels.day === dayOf(result.state.time) ? duels.count : 0
    return data.config.sects.duel.perDay - used
  }
  // Tối đa perDay trận mỗi lần ở thị trấn (trận sang ngày mới không mở thêm lượt trong lần này).
  for (let i = 0; i < data.config.sects.duel.perDay && duelsLeft() > 0; i++) {
    const weakest = [...result.state.sect.members].sort((a, b) => a.rank - b.rank)[0]
    if (!weakest) break
    if (!play({ type: 'challengeSectMember', memberId: weakest.id })) break
  }
  const nextRank = result.state.sect.rank + 1
  if (result.state.sect.totalContribution >= sectRankThreshold(data, nextRank)) {
    if (play({ type: 'challengePromotion' })) result.promotions++
  }
  const period = sectWarPeriod(data, dayOf(result.state.time))
  if (period > result.state.sect.war.lastPeriod) {
    result.state = simAct(data, result.state, { type: 'enterSectWar' })
    while (result.state.sect.war.round !== null) {
      const round = result.state.sect.war.round
      if (!play({ type: 'challengeSectWar' })) break
      if (round + 1 >= data.config.sects.war.rounds.length) result.warsWon++
    }
    if (result.state.sect.war.round !== null) {
      result.state = simAct(data, result.state, { type: 'forfeitSectWar' })
    }
    result.state = heal(data, result.state)
  }
  return result
}
