// Dưỡng dục (docs/rules/imprinting.md): quái nở từ trứng đòi chăm sóc suốt thời gian dưỡng dục,
// làm đủ thì nhận buff vĩnh viễn. Chỉ lưu nguyên liệu (số yêu cầu đã làm / tổng), % tính lại.

/** Các loại yêu cầu chăm sóc (dùng cho cả type lẫn kiểm tra lúc chạy). */
export const IMPRINT_REQUEST_KINDS = ['feed', 'battle', 'rest', 'pet'] as const

export type ImprintRequestKind = (typeof IMPRINT_REQUEST_KINDS)[number]

/** Phần riêng của từng loại yêu cầu. */
export type ImprintRequestTask =
  /** Cho ăn đúng món `itemId` (một món trong config.imprint.foods). */
  | { kind: 'feed'; itemId: string }
  /** Thắng một trận khi quái ở trong đội. */
  | { kind: 'battle' }
  /** Nghỉ / NPC hồi máu khi quái ở trong đội. */
  | { kind: 'rest' }
  /** Vuốt ve (action petMonster). */
  | { kind: 'pet' }

/** Yêu cầu hiện tại: hạn `dueDay` (cũng là ngày sinh yêu cầu kế tiếp), đã làm xong chưa. */
export type ImprintRequest = ImprintRequestTask & { dueDay: number; done: boolean }

/**
 * Tiến độ dưỡng dục của quái. `total` = số yêu cầu dự kiến trong cả thời gian dưỡng dục (tính sẵn
 * lúc nở), nên làm hết thì đúng 100%.
 */
export type Imprint =
  /** Đang dưỡng dục: hết `endDay` thì chốt buff. */
  | { phase: 'active'; completed: number; total: number; endDay: number; request: ImprintRequest }
  /** Đã xong (buff vĩnh viễn theo completed / total); không dưỡng dục lại. */
  | { phase: 'done'; completed: number; total: number }

/** Cấu hình dưỡng dục (balance.json, khóa `imprint`). */
export interface ImprintConfig {
  /** Mỗi bao nhiêu ngày sinh một yêu cầu. */
  requestEveryDays: number
  /** Thời gian dưỡng dục (ngày) khi tắt thọ nguyên. */
  fallbackDays: number
  /** Buff % mọi chỉ số khi đạt 100%. */
  maxStatPercent: number
  /** Món ăn có thể được đòi (consumable dùng ngoài trận lên quái ta). */
  foods: string[]
  /** Món đúng khẩu vị của quái (favoriteRaceIds / favoriteElementIds) được đòi với trọng số này (món khác 1). */
  favoriteFoodWeight: number
  /** Trọng số ra từng loại yêu cầu. */
  requestWeights: Record<ImprintRequestKind, number>
}

/** % dưỡng dục (0–100) theo số yêu cầu đã làm / tổng. */
export const imprintPercent = (imprint: Imprint): number =>
  (imprint.completed * 100) / imprint.total
