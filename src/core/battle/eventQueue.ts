// Hàng đợi sự kiện kích hoạt trait (mục "Ngôn ngữ trait" ở trait-dsl.md). Nơi xảy ra sự kiện (trừ máu,
// hồi máu, dính trạng thái, dùng skill...) chỉ xếp sự kiện vào hàng đợi; traitEvents.ts xử lý hàng
// đợi sau mỗi hành động, nên các file cấp thấp (draft.ts, statuses.ts) không phải import phần chạy
// hiệu ứng (tránh import vòng).
// Hàng đợi gắn với bản nháp (WeakMap theo object Draft): không nằm trong state, không vào save, mất
// cùng bản nháp. Kết quả vẫn tất định vì thứ tự xếp / xử lý cố định.

import type { Decimal } from '../shared'
import type { TraitEventType } from '../registries'

export interface QueuedEvent {
  type: TraitEventType
  /** Quái mà sự kiện xảy ra với nó. */
  subjectId: string
  /** Bên kia của sự kiện (kẻ đánh, mục tiêu, người gây trạng thái...). */
  otherId?: string
  skillId?: string
  amount?: Decimal
  statusId?: string
  critical?: boolean
  /** Hệ số khắc chế của đòn (sự kiện damaged). */
  effectiveness?: number
  /** Hành động gây ra sự kiện do trait / minion tạo (không phải lượt của quái hành động). */
  reactive?: boolean
  /** Tầng lồng nhau: 0 = do hành động gốc, n + 1 = do hiệu ứng chạy từ sự kiện tầng n. */
  depth: number
}

export interface EventQueue {
  events: QueuedEvent[]
  /** Tầng gán cho sự kiện mới xếp (đang chạy hiệu ứng của sự kiện tầng depth − 1). */
  depth: number
  /** Số hành động phụ (đánh / dùng skill do trait) đã chạy cho hành động gốc hiện tại. */
  actions: number
}

const queues = new WeakMap<object, EventQueue>()

/** Hàng đợi của bản nháp (tạo mới nếu chưa có). */
export function queueOf(draft: object): EventQueue {
  let queue = queues.get(draft)
  if (!queue) {
    queue = { events: [], depth: 0, actions: 0 }
    queues.set(draft, queue)
  }
  return queue
}

/** Xếp một sự kiện vào hàng đợi của bản nháp, gắn tầng hiện tại. */
export function emitTraitEvent(draft: object, event: Omit<QueuedEvent, 'depth'>): void {
  const queue = queueOf(draft)
  queue.events.push({ ...event, depth: queue.depth })
}
