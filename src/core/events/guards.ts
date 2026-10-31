// Chặn action theo state event (docs/rules/events.md): có event chờ thì chỉ chọn lựa chọn; đang có
// thú triều thì không rời thị trấn, không hồi máu ở NPC / nghỉ, không vào trận khác ở thị trấn
// (hồi máu giữa các đợt phải bằng vật phẩm, skill...). Thú triều: rút lui.

import { ActionError } from '../shared'
import { failBeastTide } from '../battle'
import type { EventLogEntry, GameAction, GameData, GameState } from '../model'

/** Action bị chặn khi thú triều đang diễn ra (thủ thành, rút lui, quản lý quái vẫn được). */
const BLOCKED_DURING_TIDE: ReadonlySet<GameAction['type']> = new Set<GameAction['type']>([
  'travel',
  'healParty',
  'rest',
  'challengeArena',
  'enterTournament',
  'challengeTournament',
  'enterTrial',
  'challengeTrial',
  'challengeTower',
  'startTribulation',
  'enterSafari'
])

/** Ném ActionError nếu state event không cho làm action này. */
export function assertEventAllows(state: GameState, action: GameAction): void {
  const pending = state.events.pending
  if (pending && action.type !== 'chooseEventOption') {
    throw new ActionError('eventPending', { eventId: pending.eventId })
  }
  if (state.events.beastTide?.phase === 'active' && BLOCKED_DURING_TIDE.has(action.type)) {
    throw new ActionError('beastTideActive')
  }
}

/** Rút lui khỏi thú triều (ngoài trận): mất % tiền, cửa hàng đóng, hết thú triều. */
export function retreatBeastTide(data: GameData, state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.events.beastTide?.phase !== 'active') throw new ActionError('noBeastTide')
  const { lossMoneyPercent } = data.config.events.beastTide
  const moneyLost = state.money.times(lossMoneyPercent).div(100).floor()
  const next = { time: state.time, events: state.events }
  const shopClosedUntilDay = failBeastTide(data, next)
  const log: EventLogEntry[] = [{ type: 'beastTideRetreated', moneyLost, shopClosedUntilDay }]
  return {
    ...state,
    money: state.money.minus(moneyLost),
    events: { ...next.events, log }
  }
}
