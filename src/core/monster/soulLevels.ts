// Hồn tinh (docs/rules/soul-levels.md): cấp theo từng chỉ số, mỗi cấp +% chỉ số đó; nâng cấp tốn
// điểm hồn tinh và tiền tăng theo cấp.

import { toBig, type Decimal } from '../shared'
import { mapStats } from './stats'
import { STAT_NAMES, type GameData, type Monster, type StatName, type Stats } from '../model'

/** Mọi chỉ số cấp 0 (quái mới, con breeding, quái hoang). */
export function emptySoulLevels(): Stats {
  return mapStats(() => 0)
}

/** Giá nâng một chỉ số từ cấp `level` lên `level + 1`: điểm hồn tinh và tiền. */
export interface SoulLevelCost {
  points: number
  money: Decimal
}

/** Cấp n → n + 1 tốn n + 1 điểm hồn tinh và costBase × (n + 1)² tiền. */
export function soulLevelCost(data: GameData, level: number): SoulLevelCost {
  const next = level + 1
  return { points: next, money: toBig(data.config.soulLevels.costBase).times(toBig(next).pow(2)) }
}

/** Tổng điểm hồn tinh đã dùng cho một chỉ số ở cấp `level`: 1 + 2 + ... + level. */
function pointsSpentForLevel(level: number): number {
  return (level * (level + 1)) / 2
}

/** Tổng điểm hồn tinh đã dùng trên quái (mọi chỉ số). */
export function soulPointsSpent(monster: Monster): number {
  return STAT_NAMES.reduce((sum, stat) => sum + pointsSpentForLevel(monster.soulLevels[stat]), 0)
}

/** Điểm hồn tinh hoàn lại khi quái bị tiêu hao lúc fuse: fuseRefundPercent % đã dùng, làm tròn xuống. */
export function soulFuseRefund(data: GameData, monster: Monster): number {
  return Math.floor((soulPointsSpent(monster) * data.config.soulLevels.fuseRefundPercent) / 100)
}

/** Hiển thị một chỉ số: cấp, % đang cộng, giá cấp tiếp theo. */
export interface SoulLevelStatView {
  level: number
  percent: number
  next: SoulLevelCost
}

export type SoulLevelView = Record<StatName, SoulLevelStatView>

/** Hồn tinh của quái theo từng chỉ số (MonsterView). */
export function soulLevelView(data: GameData, monster: Monster): SoulLevelView {
  const { percentPerLevel } = data.config.soulLevels
  const entry = (stat: StatName): SoulLevelStatView => {
    const level = monster.soulLevels[stat]
    return { level, percent: level * percentPerLevel, next: soulLevelCost(data, level) }
  }
  // Gán đủ mọi chỉ số ngay bên dưới (như mapStats).
  const view = {} as SoulLevelView
  for (const stat of STAT_NAMES) view[stat] = entry(stat)
  return view
}
