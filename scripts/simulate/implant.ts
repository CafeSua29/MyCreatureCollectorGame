// "Người chơi" dùng Phòng Thí Nghiệm (mục "Cấy ghép" ở simulation-features.md, docs/rules/implant.md):
// ở thị trấn, mỗi quái đội mẫu trong đội cấy huyết thanh hiệu ứng (cấp nhiều nhất) tới khi đủ
// effectLevelsWanted cấp hiệu ứng dương, còn lại huyết thanh cộng chỉ số tổng cao nhất; chỉ bậc giá
// gốc ≥ minTierPrice, còn trong ngân sách (spendFraction tiền lúc đến, cho cả lượt), khi tỉ lệ lần
// tới ≥ minChance. Không bao giờ liều mạng: dừng khi lần thất bại kế tiếp sẽ mất quái (người chơi
// thật load lại được).

import {
  BIG_ZERO,
  STAT_NAMES,
  awakeningStatMultiplier,
  computeStats,
  implantChance,
  implantCost,
  toBig,
  type Decimal,
  type GameData,
  type GameState,
  type Monster,
  type Serum
} from '@core'
import { simAct } from './events'

export const IMPLANT_POLICY = {
  /** Tổng giá cấy mỗi lần về thị trấn ≤ phần này của tiền lúc đến (không cạn tiền đột phá / fuse). */
  spendFraction: 0.3,
  /** Chỉ cấy khi tỉ lệ thành công lần tới (%) ≥ ngần này. */
  minChance: 50,
  /** Cấy huyết thanh hiệu ứng tới khi tổng cấp hiệu ứng dương của quái đạt ngần này. */
  effectLevelsWanted: 3,
  /**
   * Chỉ cấy bậc có giá gốc ≥ ngần này: số lần cấy an toàn ít (tỉ lệ giảm theo số lần), nên không
   * dùng lượt vào bậc yếu (common / uncommon).
   */
  minTierPrice: 800
} as const

export interface ImplantCount {
  succeeded: number
  failed: number
  /** Số lần cấy là huyết thanh hiệu ứng (gồm cả thất bại). */
  effectSerums: number
}

/** Tổng lượng cộng chỉ số của huyết thanh (0 nếu chỉ có hiệu ứng). */
const flatTotal = (serum: Serum): Decimal =>
  serum.effects.reduce(
    (sum, effect) => (effect.kind === 'flatStat' ? sum.plus(effect.amount) : sum),
    BIG_ZERO
  )

/** Tổng cấp hiệu ứng của huyết thanh (0 nếu chỉ cộng chỉ số). */
const effectLevels = (serum: Serum): number =>
  serum.effects.reduce((sum, effect) => sum + (effect.kind === 'hookEffect' ? effect.levels : 0), 0)

const serumTierPrice = (data: GameData, serum: Serum): number =>
  data.config.implant.tiers.find((tier) => tier.id === serum.tierId)?.price ?? 0

/** Tổng cấp hiệu ứng dương của quái (hiệu ứng ngược không tính). */
const positiveEffectLevels = (monster: Monster): number =>
  Object.values(monster.implantEffects).reduce((sum, level) => sum + Math.max(0, level), 0)

/**
 * Huyết thanh tốt nhất trong số giá ≤ budget theo `score` (> 0; bằng nhau thì con đứng trước); null =
 * không có món nào.
 */
function bestAffordable(
  data: GameData,
  state: GameState,
  budget: Decimal,
  score: (serum: Serum) => Decimal
): number | null {
  let best: number | null = null
  let bestScore = BIG_ZERO
  state.lab.stock.forEach((serum, i) => {
    if (implantCost(data, state.highestFloor, serum).gt(budget)) return
    if (serumTierPrice(data, serum) < IMPLANT_POLICY.minTierPrice) return
    const value = score(serum)
    if (value.gt(bestScore)) [best, bestScore] = [i, value]
  })
  return best
}

/** Món sẽ cấy: hiệu ứng khi quái còn muốn và mua được, không thì cộng chỉ số. */
function chooseSerum(
  data: GameData,
  state: GameState,
  monster: Monster,
  budget: Decimal
): number | null {
  if (positiveEffectLevels(monster) < IMPLANT_POLICY.effectLevelsWanted) {
    const effect = bestAffordable(data, state, budget, (serum) => toBig(effectLevels(serum)))
    if (effect !== null) return effect
  }
  return bestAffordable(data, state, budget, flatTotal)
}

/** Quái còn cấy theo chính sách: tỉ lệ đủ cao, lần thất bại kế tiếp chưa mất quái. */
const wantsImplant = (data: GameData, monster: Monster): boolean =>
  monster.assignment === null &&
  monster.implantFails + 1 < data.config.implant.maxFails &&
  implantChance(data, monster) >= IMPLANT_POLICY.minChance

/** Ở thị trấn: cấy cho quái đội mẫu trong đội tới khi hết muốn / hết tiền. */
export function implantTeam(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; count: ImplantCount } {
  const count: ImplantCount = { succeeded: 0, failed: 0, effectSerums: 0 }
  if (state.location.type !== 'town' || state.battle) return { state, count }
  let budget = state.money.times(IMPLANT_POLICY.spendFraction)
  for (const id of teamIds) {
    for (;;) {
      const monster = state.party.find((m) => m.id === id)
      if (!monster || !wantsImplant(data, monster)) break
      const serumIndex = chooseSerum(data, state, monster, budget)
      if (serumIndex === null) break
      const serum = state.lab.stock[serumIndex]
      budget = budget.minus(implantCost(data, state.highestFloor, serum))
      if (effectLevels(serum) > 0) count.effectSerums++
      state = simAct(data, state, { type: 'implant', monsterId: id, serumIndex })
      const after = state.party.find((m) => m.id === id)
      if (after && after.implantFails > monster.implantFails) count.failed++
      else count.succeeded++
    }
  }
  return { state, count }
}

/**
 * Tỉ trọng cấy ghép trong bước gốc của đội mẫu (%): tổng cấy ghép / tổng (gốc loài + gen ×
 * geneWeight) trước khi cộng cấy ghép, mọi chỉ số, mọi quái đội mẫu trong đội. Âm khi thất bại nhiều.
 */
export function implantSharePercent(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): number {
  let implanted = BIG_ZERO
  let before = BIG_ZERO
  for (const monster of state.party) {
    if (!teamIds.has(monster.id)) continue
    const plain = { ...monster, implantBonusStats: { ...monster.implantBonusStats } }
    for (const stat of STAT_NAMES) plain.implantBonusStats[stat] = BIG_ZERO
    const race = data.races[monster.raceId]
    const base = computeStats(data, plain).base
    for (const stat of STAT_NAMES) {
      implanted = implanted.plus(monster.implantBonusStats[stat])
      // Bước gốc đã nhân race / boss / thức tỉnh: chia lại để so cùng đơn vị với cấy ghép.
      const scale = awakeningStatMultiplier(data.config.awakening, monster.awakening).times(
        race.statBias[stat] * monster.bossMultiplier
      )
      before = before.plus(base[stat].div(scale))
    }
  }
  return before.gt(0) ? implanted.div(before).times(100).toNumber() : 0
}
