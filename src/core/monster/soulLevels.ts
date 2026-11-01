// Hồn tinh (docs/rules/soul-levels.md): cấp theo từng chỉ số, mỗi cấp +% chỉ số đó; nâng cấp tốn
// điểm hồn tinh và tiền tăng theo cấp.

import { toBig, type Decimal } from '../shared'
import { mapStats } from './stats'
import { STAT_NAMES, type GameData, type Monster, type Stats } from '../model'

/**
 * Mục nâng được ở Tượng Lực: mọi chỉ số + tốc độ làm việc (như Statue of Power của Palworld có Work
 * Speed; docs/rules/dwelling.md). Tốc độ làm việc lưu ở `Monster.workSoulLevel`.
 */
export const SOUL_LEVEL_KEYS = [...STAT_NAMES, 'workSpeed'] as const

export type SoulLevelKey = (typeof SOUL_LEVEL_KEYS)[number]

/** Cấp hiện tại của một mục hồn tinh. */
export const soulLevelOf = (monster: Monster, key: SoulLevelKey): number =>
  key === 'workSpeed' ? monster.workSoulLevel : monster.soulLevels[key]

/** Quái với cấp mới của một mục hồn tinh. */
export const withSoulLevel = (monster: Monster, key: SoulLevelKey, level: number): Monster =>
  key === 'workSpeed'
    ? { ...monster, workSoulLevel: level }
    : { ...monster, soulLevels: { ...monster.soulLevels, [key]: level } }

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

/** Tổng điểm hồn tinh đã dùng trên quái (mọi chỉ số và tốc độ làm việc). */
export function soulPointsSpent(monster: Monster): number {
  return SOUL_LEVEL_KEYS.reduce(
    (sum, key) => sum + pointsSpentForLevel(soulLevelOf(monster, key)),
    0
  )
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

/** Theo mục: chỉ số (% chỉ số đó) và `workSpeed` (% tốc độ làm việc). */
export type SoulLevelView = Record<SoulLevelKey, SoulLevelStatView>

/** Hồn tinh của quái theo từng mục (MonsterView). */
export function soulLevelView(data: GameData, monster: Monster): SoulLevelView {
  const { percentPerLevel } = data.config.soulLevels
  const { soulWorkSpeedPercentPerLevel } = data.config.dwelling
  const entry = (key: SoulLevelKey): SoulLevelStatView => {
    const level = soulLevelOf(monster, key)
    const per = key === 'workSpeed' ? soulWorkSpeedPercentPerLevel : percentPerLevel
    return { level, percent: level * per, next: soulLevelCost(data, level) }
  }
  // Gán đủ mọi mục ngay bên dưới (như mapStats).
  const view = {} as SoulLevelView
  for (const key of SOUL_LEVEL_KEYS) view[key] = entry(key)
  return view
}
