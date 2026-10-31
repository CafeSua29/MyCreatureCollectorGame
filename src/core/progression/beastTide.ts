// Thú triều theo ngày (docs/rules/events.md): lên lịch thú triều kế tiếp sau intervalDays ngày, báo
// trước warningDays ngày, tới ngày thì bắt đầu khi người chơi ở thị trấn (việc theo ngày, hoặc lúc
// vào thị trấn). Trận từng đợt / thú vương ở battle/eventBattles.ts, thắng / thua ở
// battle/specialBattles.ts, rút lui ở events/.

import { hashToUnit, nextInt } from '../shared'
import { dayOf, type DayEvent, type GameData, type GameState } from '../model'

/** Số đợt thắng cần để thách đấu thú vương: ⌈số đợt × kingAfterPercent / 100⌉, trong [1, số đợt]. */
export function beastKingAfter(data: GameData, waves: number): number {
  const { kingAfterPercent } = data.config.events.beastTide
  return Math.min(waves, Math.max(1, Math.ceil((waves * kingAfterPercent) / 100)))
}

/**
 * Thú triều đã báo mà tới ngày thì bắt đầu (tung số đợt), nếu đang ở thị trấn và rảnh (không trong
 * trận, bí cảnh, giải đấu, không có event chờ). Không bắt đầu thì trả lại state cũ.
 */
export function activateBeastTideIfDue(
  data: GameData,
  state: GameState,
  day = dayOf(state.time)
): GameState {
  const tide = state.events.beastTide
  if (tide?.phase !== 'warned' || day < tide.day) return state
  const busy =
    state.battle !== null ||
    state.trial !== null ||
    state.zones.visit !== null ||
    state.trainers.tournament.round !== null ||
    state.events.pending !== null
  if (state.location.type !== 'town' || busy) return state
  const { min, max } = data.config.events.beastTide.waves
  const [waves, rng] = nextInt(state.rng, min, max)
  const kingAfter = beastKingAfter(data, waves)
  const beastTide = { phase: 'active' as const, cleared: 0, waves, kingAfter }
  return { ...state, rng, events: { ...state.events, beastTide } }
}

/**
 * Việc theo ngày: chưa có thú triều thì lên lịch thú triều kế tiếp sau số ngày đều trong
 * intervalDays (tính từ ngày lên lịch; thú triều vừa kết thúc thì lên lịch ở lần qua ngày kế tiếp); còn warningDays ngày thì báo trước; rồi bắt đầu thú triều đã tới ngày nếu đang ở
 * thị trấn.
 */
export function beastTideDailyTask(
  data: GameData,
  state: GameState,
  events: DayEvent[],
  day: number
): GameState {
  const { intervalDays, warningDays } = data.config.events.beastTide
  let next = state
  if (next.events.beastTide === null) {
    // Băm theo ngày và RNG của save (không tung RNG): lên lịch không làm đổi các giá trị random
    // khác, mỗi save một lịch riêng.
    const span = intervalDays.max - intervalDays.min + 1
    const days = intervalDays.min + Math.floor(hashToUnit('beastTide', day, next.rng) * span)
    const beastTide = { phase: 'scheduled' as const, day: day + days }
    next = { ...next, events: { ...next.events, beastTide } }
  }
  const tide = next.events.beastTide
  if (tide?.phase === 'scheduled' && day >= tide.day - warningDays) {
    next = { ...next, events: { ...next.events, beastTide: { phase: 'warned', day: tide.day } } }
    events.push({ type: 'beastTideWarning', day: tide.day })
  }
  const activated = activateBeastTideIfDue(data, next, day)
  const after = activated.events.beastTide
  if (activated !== next && after?.phase === 'active') {
    events.push({ type: 'beastTideArrived', waves: after.waves })
  }
  return activated
}
