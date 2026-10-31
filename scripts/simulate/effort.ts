// Điểm nỗ lực trong mô phỏng (mục "Điểm nỗ lực" ở simulation-features.md, docs/rules/effort-values.md):
// quét tầng giả định điểm theo tầng; chơi liên tục thì điểm tăng thật theo trận thắng.

import { STAT_NAMES, effortTotal, mapStats, type GameData, type Monster, type Stats } from '@core'

/**
 * Tổng điểm nỗ lực trung bình một quái đội mẫu có thêm mỗi tầng khi chơi liên tục (đo bằng cột
 * effortPercent của progression.csv, kịch bản mặc định 2026-10-28: tầng 10 khoảng 190–500 điểm,
 * trung bình 350; xem simulation-features.md).
 */
export const EFFORT_PER_FLOOR = 35

/**
 * Điểm nỗ lực giả định ở tầng `floor`: tầng × EFFORT_PER_FLOOR, tới trần tổng; chia đều 6 chỉ số
 * (quái hoang mỗi map đủ loại nên điểm rải khắp chỉ số), phần lẻ vào các chỉ số đầu.
 */
export function assumedEffortValues(data: GameData, floor: number): Stats {
  const { maxTotal, maxPerStat } = data.config.effort
  const total = Math.min(maxTotal, Math.max(0, floor) * EFFORT_PER_FLOOR)
  const share = Math.floor(total / STAT_NAMES.length)
  const remainder = total - share * STAT_NAMES.length
  return mapStats((stat) =>
    Math.min(maxPerStat, share + (STAT_NAMES.indexOf(stat) < remainder ? 1 : 0))
  )
}

/** Đặt điểm nỗ lực giả định cho cả đội (giữ điểm sẵn có nếu cao hơn). */
export const withAssumedEffort = (
  data: GameData,
  party: readonly Monster[],
  floor: number
): Monster[] => {
  const assumed = assumedEffortValues(data, floor)
  return party.map((monster) =>
    effortTotal(monster.effortValues) >= effortTotal(assumed)
      ? monster
      : { ...monster, effortValues: assumed }
  )
}
