// Boss thế giới (docs/rules/world-boss.md): Thiên Ngoại Tà Thú xuất hiện theo chu kỳ ngày, HP vô hạn,
// khiêu chiến 1 lần mỗi ngày ở thị trấn, thưởng theo kỷ lục tổng sát thương qua bậc ngưỡng. Số ở
// balance.json khóa `worldBoss`.

import type { Decimal } from '../shared'
import type { ItemReward } from './trainers'

/**
 * Một bậc thưởng (thứ tự tăng dần trong config.worldBoss.tiers): đạt khi kỷ lục ≥ `minHpMultiple` ×
 * máu thường của boss (bossMultiplier 1). Tiền = rewards.moneyPerLevel × level boss × moneyMultiple.
 */
export interface WorldBossTier {
  id: string
  minHpMultiple: number
  moneyMultiple: number
  items: ItemReward[]
  /** Số sách kỹ năng trong learnset của loài boss. */
  skillBooks: number
  /** % nhận một trứng loài boss. */
  eggChance: number
}

export interface WorldBossConfig {
  /** Độ dài một chu kỳ (ngày); boss xuất hiện ở activeDays ngày cuối của mỗi chu kỳ. */
  everyDays: number
  activeDays: number
  /** Số lượt tối đa của một lần khiêu chiến. */
  turns: number
  /** Level boss = level boss tầng của tầng cao nhất + levelOffset (tối thiểu 1). */
  levelOffset: number
  bossMultiplier: number
  /** Trọng số loài theo thứ hạng phẩm cấp loài (vượt danh sách lấy số cuối). */
  rankWeights: number[]
  /** Hệ số trọng số của loài lớn (docs/rules/monster-size.md). */
  largeWeight: number
  tiers: WorldBossTier[]
}

/** Lần xuất hiện đang diễn ra. */
export interface WorldBossAppearance {
  /** Chu kỳ (⌊ngày / everyDays⌋) của lần xuất hiện. */
  cycle: number
  /** Ngày cuối còn khiêu chiến được. */
  endDay: number
  speciesId: string
  /** Tầng tham chiếu lúc xuất hiện (map, level, gen); boss mọi lần khiêu chiến sinh từ `seed`. */
  floor: number
  level: number
  seed: number
  /** Máu thường của boss (bossMultiplier 1): đơn vị của ngưỡng bậc thưởng. */
  hpUnit: Decimal
  /** Kỷ lục tổng sát thương của lần xuất hiện này. */
  bestDamage: Decimal
  /** Ngày khiêu chiến gần nhất; null = chưa khiêu chiến. */
  lastChallengeDay: number | null
}

/** Thưởng chờ nhận ở thị trấn của một lần xuất hiện đã hết (đạt ít nhất bậc đầu). */
export interface WorldBossReward {
  speciesId: string
  floor: number
  level: number
  tierId: string
  bestDamage: Decimal
}

export interface WorldBossState {
  current: WorldBossAppearance | null
  rewards: WorldBossReward[]
}
