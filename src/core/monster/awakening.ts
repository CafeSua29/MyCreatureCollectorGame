// Thức tỉnh trên một quái (docs/rules/awakening.md): hệ số chỉ số theo tầng (thọ nguyên: mục
// `awakening` của LIFESPAN_MODIFIERS, trọng thương: nguồn % `injury`), tầng mốc
// và phần thưởng, trần ô trait, thần thông, điều kiện tầng kế tiếp. Tầng không có trần nên hệ số
// tính bằng Decimal và số mốc đếm bằng công thức (không lặp qua từng tầng).

import { toBig, type Decimal } from '../shared'
import type {
  AwakeningConfig,
  AwakeningMilestone,
  AwakeningReward,
  GameData,
  Monster
} from '../model'

/** Hệ số chỉ số của tầng thức tỉnh: (1 + statStepPercent / 100) ^ tầng (bước gốc của computeStats). */
export const awakeningStatMultiplier = (config: AwakeningConfig, tier: number): Decimal =>
  toBig(config.statStepPercent).div(100).plus(1).pow(tier)

const otherReward = (reward: AwakeningReward): AwakeningReward =>
  reward === 'skill' ? 'traitSlot' : 'skill'

/**
 * Phần thưởng của tầng `tier` (null nếu không phải tầng mốc): mốc liệt kê trong config, sau mốc cuối
 * mỗi repeatEvery tầng một mốc, loại xen kẽ bắt đầu bằng loại khác mốc cuối.
 */
export function awakeningRewardAt(config: AwakeningConfig, tier: number): AwakeningReward | null {
  const listed = config.milestones.find((milestone) => milestone.tier === tier)
  if (listed) return listed.reward
  const last = config.milestones.at(-1)
  if (!last || tier <= last.tier || (tier - last.tier) % config.repeatEvery !== 0) return null
  const step = (tier - last.tier) / config.repeatEvery
  return step % 2 === 1 ? otherReward(last.reward) : last.reward
}

/** Tầng mốc kế tiếp sau tầng `tier` (null nếu config không có mốc nào). */
export function nextAwakeningMilestone(
  config: AwakeningConfig,
  tier: number
): AwakeningMilestone | null {
  const listed = config.milestones.find((milestone) => milestone.tier > tier)
  if (listed) return listed
  const last = config.milestones.at(-1)
  if (!last) return null
  const steps = Math.floor((tier - last.tier) / config.repeatEvery) + 1
  const next = last.tier + steps * config.repeatEvery
  const reward = awakeningRewardAt(config, next)
  return reward ? { tier: next, reward } : null
}

/** Số mốc loại `reward` từ tầng 1 tới `tier` (kể cả tầng `tier`). */
export function countAwakeningRewards(
  config: AwakeningConfig,
  tier: number,
  reward: AwakeningReward
): number {
  const listed = config.milestones.filter((m) => m.tier <= tier && m.reward === reward).length
  const last = config.milestones.at(-1)
  if (!last || tier <= last.tier) return listed
  const steps = Math.floor((tier - last.tier) / config.repeatEvery)
  // Bước lẻ là loại khác mốc cuối, bước chẵn là loại của mốc cuối.
  const repeated = reward === last.reward ? Math.floor(steps / 2) : Math.ceil(steps / 2)
  return listed + repeated
}

/** Trần ô trait của quái: config.traitSlots.max + số mốc ô trait thức tỉnh đã đạt. */
export const traitSlotCap = (data: GameData, monster: Monster): number =>
  data.config.traitSlots.max +
  countAwakeningRewards(data.config.awakening, monster.awakening, 'traitSlot')

/**
 * Thần thông của mốc thần thông thứ `index` (từ 1): mốc lẻ theo hệ đầu, mốc chẵn theo hệ thứ hai;
 * quái một hệ thì mốc chẵn lấy skill thứ hai của hệ đó. Hệ không có thần thông thì null.
 */
export function divineSkillId(data: GameData, monster: Monster, index: number): string | null {
  const { elementIds } = monster
  const second = (index - 1) % 2 === 1
  const elementId = second && elementIds.length > 1 ? elementIds[1] : elementIds[0]
  const skills = data.config.awakening.divineSkills[elementId]
  if (!skills) return null
  return (second && elementIds.length === 1 ? skills[1] : skills[0]) ?? null
}

export interface AwakeningRequirements {
  /** Tầng sẽ lên. */
  tier: number
  level: number
  money: Decimal
  pills: number
}

/** Điều kiện lên tầng kế tiếp của quái đang ở tầng `current`. */
/**
 * Thức tỉnh đan dùng được cho quái: đan của các hệ quái đang mang (thứ tự hệ, bỏ hệ không có đan,
 * không lặp).
 */
export function awakeningPillIds(config: AwakeningConfig, monster: Monster): string[] {
  const ids = monster.elementIds.flatMap((elementId) =>
    Object.hasOwn(config.pillItemIds, elementId) ? [config.pillItemIds[elementId]] : []
  )
  return [...new Set(ids)]
}

export function awakeningRequirements(
  config: AwakeningConfig,
  current: number
): AwakeningRequirements {
  const tier = current + 1
  return {
    tier,
    level: config.levelPerTier * tier,
    money: toBig(config.costBase).times(tier).times(tier),
    pills: config.pillsPerTier * tier
  }
}
