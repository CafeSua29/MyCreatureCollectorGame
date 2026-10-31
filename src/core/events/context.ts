// Bối cảnh khi áp kết quả event (docs/rules/events.md): state đang dựng, log kết quả, tầng / map để
// scale phần thưởng, chuỗi của event. Kết quả là hàm đổi `ctx.state` (luôn thay bằng object mới,
// không sửa state cũ).

import type { FloorSite } from '../world'
import type { EventLogEntry, GameData, GameState } from '../model'

export interface EventContext {
  data: GameData
  state: GameState
  log: EventLogEntry[]
  eventId: string
  /** Tầng để scale phần thưởng / độ khó (tầng đang đứng; thị trấn: tầng cao nhất). */
  floor: number
  /** Map của tầng đó (bảng gặp, trang bị, NPC). */
  site: FloorSite
  /** Event là bước của chuỗi này (advanceChain đi tiếp chuỗi này); null = không. */
  chainId: string | null
  /** Vị trí của kết quả đang áp (trận event tra lại onWin / onLoss theo vị trí này). */
  position: { optionId: string; outcomeIndex: number; resultIndex: number }
}

/** Ghi một dòng log kết quả. */
export function logResult(ctx: EventContext, entry: EventLogEntry): void {
  ctx.log.push(entry)
}

/** Đổi phần state event của bối cảnh. */
export function updateEvents(ctx: EventContext, patch: Partial<GameState['events']>): void {
  ctx.state = { ...ctx.state, events: { ...ctx.state.events, ...patch } }
}
