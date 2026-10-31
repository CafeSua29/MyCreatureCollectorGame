// Điểm AI của trait khi trúng đòn / hạ gục (mục "AI trận đấu" ở battle.md) cho một đòn dự kiến lên
// một địch: dùng lại trọng số có sẵn (healWeight như drain, koBonus, statusWeights như applyStatus)
// để không thêm số cân bằng mới. Phản đòn và kẻ đánh dính trạng thái tính như hồi máu / gây trạng
// thái ngược dấu. Chiêu đánh nhiều lần tính như một đòn.

import { getCurrentHp, getMaxHp, percentOfMaxHp } from '../monster'
import {
  isIndirectDamageImmune,
  statusAiValue,
  traitAttackStatuses,
  traitExecuteThreshold,
  traitHitStatuses,
  traitKnockedOutRetaliation,
  traitKnockoutHeal,
  traitLethalSurvivals,
  traitLifesteal,
  traitRetaliation,
  traitRevive,
  type TraitStatusChance
} from '../registries'
import { minBig, type Decimal } from '../shared'
import type { BattleSide, GameData, Monster, Skill } from '../model'
import { Draft, hasUsedOnce, opponentOf } from './draft'
import { hazardDamageFactor } from './statuses'

/** Điểm hồi `amount` máu cho quái (chỉ máu đã mất mới hồi được), như drain. */
function healScore(data: GameData, monster: Monster, amount: Decimal): number {
  const healed = minBig(amount, monster.damageTaken)
  return healed.div(getMaxHp(data, monster)).toNumber() * data.config.ai.healWeight
}

/**
 * Điểm mất `percent`% max HP (phản đòn), ngược dấu với hồi máu; không quá máu còn lại. Quái miễn
 * sát thương gián tiếp (kiểu Magic Guard) thì 0.
 */
function hpLossScore(
  data: GameData,
  d: Draft,
  { monster, side }: { monster: Monster; side: BattleSide },
  percent: number
): number {
  if (isIndirectDamageImmune(data, monster)) return 0
  const maxHp = getMaxHp(data, monster)
  const lost = minBig(
    percentOfMaxHp(maxHp.times(hazardDamageFactor(data, d, side)), percent),
    getCurrentHp(data, monster)
  )
  return -lost.div(maxHp).toNumber() * data.config.ai.healWeight
}

/** Kỳ vọng điểm trạng thái: tung theo thứ tự, trúng đầu tiên thì dừng (như lúc đánh thật). */
function statusesScore(
  data: GameData,
  d: Draft,
  victim: { monster: Monster; side: BattleSide },
  chances: readonly TraitStatusChance[]
): number {
  let notYet = 1
  let score = 0
  for (const { statusId, chance } of chances) {
    const value = statusAiValue(data, d.battle.field, victim, statusId)
    if (value === 0) continue
    score += notYet * (chance / 100) * value
    notYet *= 1 - chance / 100
  }
  return score
}

/** Hệ số giá trị hạ gục mục tiêu bằng hồi sinh: 1 − % máu sống lại (0 khi đã dùng / không có). */
function reviveFactor(data: GameData, d: Draft, target: Monster): number {
  if (hasUsedOnce(d, target.id, 'revive')) return 1
  const revive = traitRevive(data, target)
  return revive === null ? 1 : 1 - revive.hpPercent / 100
}

/**
 * Hệ số nhân koBonus khi đòn skill dự kiến đủ hạ mục tiêu (mục "Trait sống sót"): × xác suất mục
 * tiêu không trụ lại được (trait surviveLethal; `fullHp`: mục tiêu đầy máu trước đòn) × hệ số hồi
 * sinh. Không thêm trọng số mới.
 */
export function knockoutValueFactor(
  data: GameData,
  d: Draft,
  { target, fullHp }: { target: Monster; fullHp: boolean }
): number {
  let survives = 0
  if (getCurrentHp(data, target).gt(1)) {
    let fails = 1
    for (const { chance, oncePerBattle } of traitLethalSurvivals(data, target, { fullHp })) {
      if (oncePerBattle && hasUsedOnce(d, target.id, 'surviveLethal')) continue
      fails *= 1 - chance / 100
    }
    survives = 1 - fails
  }
  return (1 - survives) * reviveFactor(data, d, target)
}

export interface ExpectedStrike {
  user: Monster
  target: Monster
  skill: Skill
  /** Phe của user. */
  side: BattleSide
  /** Sát thương dự kiến lên target (đã giới hạn bởi máu còn) và máu còn của target. */
  dealt: Decimal
  remaining: Decimal
}

/** Điểm trait khi trúng đòn / hạ gục của cả hai bên cho một đòn dự kiến lên địch. */
export function hitTraitScore(data: GameData, d: Draft, strike: ExpectedStrike): number {
  const { user, target, skill, side, dealt, remaining } = strike
  if (dealt.lte(0)) return 0
  const foeSide = opponentOf(side)
  const { koBonus } = data.config.ai
  const knocksOut = dealt.gte(remaining)
  let score = healScore(data, user, dealt.times(traitLifesteal(data, user).percent).div(100))
  const threshold = traitExecuteThreshold(data, user)
  if (!knocksOut && threshold !== null) {
    const ratio = remaining.minus(dealt).div(getMaxHp(data, target)).toNumber()
    const factor = hazardDamageFactor(data, d, foeSide)
    // Hạ ngay là trait, không phải đòn skill: trụ lại không chặn, chỉ hồi sinh.
    if (ratio * 100 <= threshold.percent * factor) score += koBonus * reviveFactor(data, d, target)
  }
  if (knocksOut) {
    const healPercent = traitKnockoutHeal(data, user).percent
    score += healScore(data, user, percentOfMaxHp(getMaxHp(data, user), healPercent))
    const curse = traitKnockedOutRetaliation(data, target).percent
    if (curse > 0) score += hpLossScore(data, d, { monster: user, side }, curse)
  } else {
    const chances = traitAttackStatuses(data, user, skill.category)
    score += statusesScore(data, d, { monster: target, side: foeSide }, chances)
  }
  const retaliation = traitRetaliation(data, target, skill.category).percent
  if (retaliation > 0) score += hpLossScore(data, d, { monster: user, side }, retaliation)
  const hitChances = traitHitStatuses(data, target, skill.category)
  return score - statusesScore(data, d, { monster: user, side }, hitChances)
}
