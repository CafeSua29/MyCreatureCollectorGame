// Trao đổi với NPC trong chơi liên tục (mục "Trao đổi với NPC" ở simulation-features.md,
// docs/rules/trades.md): mỗi ngày ở thị trấn "người chơi" nhận mọi đề nghị có quái trong kho (không
// thuộc đội mẫu, không bận, không phải bản mệnh) đúng yêu cầu, đưa quái level thấp nhất hợp lệ.

import {
  computeStats,
  meetsTradeWant,
  STAT_NAMES,
  type GameData,
  type GameState,
  type Monster,
  type TradeWant
} from '@core'
import { simAct } from './events'

/** Quái trong kho đưa được cho yêu cầu: level thấp nhất (giữ quái mạnh), hòa theo thứ tự kho. */
function tradeCandidate(
  data: GameData,
  state: GameState,
  { want, teamIds }: { want: TradeWant; teamIds: ReadonlySet<string> }
): Monster | null {
  let best: Monster | null = null
  for (const monster of state.storage) {
    if (teamIds.has(monster.id) || monster.bond || monster.locked) continue
    if (monster.assignment !== null) continue
    if (!meetsTradeWant(data, want, monster)) continue
    if (best === null || monster.level < best.level) best = monster
  }
  return best
}

/** Tổng chỉ số cuối của quái (so sức mạnh quái nhận với đội mẫu). */
const statTotal = (data: GameData, monster: Monster): number => {
  const { final } = computeStats(data, monster)
  return STAT_NAMES.reduce((sum, stat) => sum + final[stat].toNumber(), 0)
}

/** Quái NPC đưa bằng bao nhiêu % trung bình đội mẫu (đo độ "đáng đổi", quái nhận nằm ở kho). */
function powerPercent(data: GameData, state: GameState, received: Monster): number {
  const team = state.party.filter((m) => m.id !== received.id)
  if (team.length === 0) return 0
  const average = team.reduce((sum, m) => sum + statTotal(data, m), 0) / team.length
  return average > 0 ? (statTotal(data, received) / average) * 100 : 0
}

/** Nhận mọi đề nghị đưa được; trả state mới, số lần trao đổi, % sức mạnh cao nhất của quái nhận. */
export function runTrades(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; trades: number; powerPercent: number } {
  if (state.battle || state.location.type !== 'town') return { state, trades: 0, powerPercent: 0 }
  let trades = 0
  let bestPower = 0
  for (const offer of state.trades.offers) {
    const monster = tradeCandidate(data, state, { want: offer.want, teamIds })
    if (!monster) continue
    if (offer.give.kind === 'monster') {
      bestPower = Math.max(bestPower, powerPercent(data, state, offer.give.monster))
    }
    state = simAct(data, state, {
      type: 'acceptTrade',
      offerId: offer.id,
      monsterId: monster.id,
      discardOverflow: true
    })
    trades++
  }
  return { state, trades, powerPercent: bestPower }
}
