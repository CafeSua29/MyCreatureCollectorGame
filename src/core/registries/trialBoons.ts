// Ân huệ trong lượt bí cảnh (docs/rules/trial-boons.md): mỗi loại hiệu ứng một handler (trường,
// kiểm tra, còn tác dụng với luật của bí cảnh không); tra tổng hiệu ứng theo cấp, tung lựa chọn.
// Nơi áp ân huệ hỏi qua các hàm dưới đây, không tự rẽ nhánh theo id.

import { checkNumber, pickWeighted, type RngState } from '../shared'
import {
  type BattleRewardChannel,
  type GameData,
  type SecretRealm,
  type TrialBoonDef,
  type TrialBoonEffect,
  type TrialBoonEffectType,
  type TrialBoonRarity,
  type TrialBoonStack,
  type TrialRule
} from '../model'
import { checkBattleOnlyHooks } from './traitHooks'
import { extraBoonChoiceCount, hasTrialRule } from './trialRules'

export interface TrialBoonEffectHandler {
  /** Trường của hiệu ứng (ngoài type). */
  fields: readonly string[]
  validate(effect: Readonly<Record<string, unknown>>, data: GameData): string[]
  /** Hiệu ứng còn tác dụng trong bí cảnh có các luật này không (không thì không tung ân huệ đó). */
  worksWith(data: GameData, rules: readonly TrialRule[]): boolean
}

const always = (): boolean => true

/** Hiệu ứng ân huệ theo loại; thêm loại = thêm một handler (TypeScript báo khi thiếu). */
export const TRIAL_BOON_EFFECTS: Readonly<Record<TrialBoonEffectType, TrialBoonEffectHandler>> = {
  // Hook chỉ trong trận cho mọi quái phe người chơi (như luật sideHooks), hệ số hook = cấp.
  hooks: {
    fields: ['hooks'],
    validate: (effect, data) => checkBattleOnlyHooks(effect.hooks, 'ân huệ', data),
    worksWith: always
  },
  // % thưởng của trận theo kênh (tiền + tỉ lệ đồ rơi / EXP).
  reward: {
    fields: ['channel', 'percent'],
    validate: (effect) => [
      ...(effect.channel === 'reward' || effect.channel === 'exp'
        ? []
        : ['channel phải là reward / exp']),
      ...checkNumber(effect.percent, 'percent', 0)
    ],
    worksWith: always
  },
  // Hồi thêm % max HP sau mỗi trận thắng: luật noHealing tắt hồi máu nên không có tác dụng.
  heal: {
    fields: ['percent'],
    validate: (effect) => checkNumber(effect.percent, 'percent', 0),
    worksWith: (data, rules) => !hasTrialRule(data, rules, 'noHealing')
  },
  // Lượt tung món thêm của rương bí cảnh.
  chest: {
    fields: ['rolls'],
    validate: (effect) => checkNumber(effect.rolls, 'rolls', 0),
    worksWith: always
  },
  // Boss của trận bí cảnh vào trận đã mất % max HP (mọi bí cảnh đều có boss cuối).
  bossWeaken: {
    fields: ['percent'],
    validate: (effect) => checkNumber(effect.percent, 'percent', 0, 100),
    worksWith: always
  }
}

/** Tổng `value(effect) × cấp` của mọi hiệu ứng loại `type` trên các ân huệ đã chọn. */
function sumBoonEffects<T extends TrialBoonEffectType>(
  data: GameData,
  boons: readonly TrialBoonStack[],
  { type, value }: { type: T; value: (effect: Extract<TrialBoonEffect, { type: T }>) => number }
): number {
  let total = 0
  for (const { boonId, stacks } of boons) {
    for (const effect of data.trialBoons[boonId].effects) {
      // Ép kiểu vì đã lọc đúng loại ngay trên.
      if (effect.type === type)
        total += value(effect as Extract<TrialBoonEffect, { type: T }>) * stacks
    }
  }
  return total
}

/** % thưởng của các ân huệ theo kênh. */
export const trialBoonRewardPercent = (
  data: GameData,
  boons: readonly TrialBoonStack[],
  channel: BattleRewardChannel
): number =>
  sumBoonEffects(data, boons, {
    type: 'reward',
    value: (effect) => (effect.channel === channel ? effect.percent : 0)
  })

/** % max HP hồi thêm sau mỗi trận thắng của các ân huệ. */
export const trialBoonHealPercent = (data: GameData, boons: readonly TrialBoonStack[]): number =>
  sumBoonEffects(data, boons, { type: 'heal', value: (effect) => effect.percent })

/** Số lượt tung món thêm của rương (làm tròn xuống). */
export const trialBoonChestRolls = (data: GameData, boons: readonly TrialBoonStack[]): number =>
  Math.floor(sumBoonEffects(data, boons, { type: 'chest', value: (effect) => effect.rolls }))

/** % max HP boss mất đầu trận của các ân huệ (kẹp config bossWeakenCapPercent). */
export const trialBoonBossWeakenPercent = (
  data: GameData,
  boons: readonly TrialBoonStack[]
): number =>
  Math.min(
    data.config.trials.boons.bossWeakenCapPercent,
    sumBoonEffects(data, boons, { type: 'bossWeaken', value: (effect) => effect.percent })
  )

/** Cấp hiện có của ân huệ trong lượt (0 = chưa có). */
export const trialBoonStacks = (realm: Pick<SecretRealm, 'boons'>, boonId: string): number =>
  realm.boons.find((boon) => boon.boonId === boonId)?.stacks ?? 0

/**
 * Ân huệ tung được: chưa tới maxStacks, trọng số bậc hiếm > 0, có ít nhất một hiệu ứng còn tác dụng
 * với luật của bí cảnh.
 */
function isOfferable(data: GameData, realm: SecretRealm, def: TrialBoonDef): boolean {
  if (def.maxStacks !== undefined && trialBoonStacks(realm, def.id) >= def.maxStacks) return false
  if (data.config.trials.boons.rarityWeights[def.rarity] <= 0) return false
  return def.effects.some((effect) => TRIAL_BOON_EFFECTS[effect.type].worksWith(data, realm.rules))
}

/**
 * Trọng số tung của bậc hiếm ở mức độ bất ổn `instabilityLevel`: gốc × (1 + mức ×
 * instabilityRarityPercent / 100).
 */
export function trialBoonRarityWeight(
  data: GameData,
  rarity: TrialBoonRarity,
  instabilityLevel: number
): number {
  const { rarityWeights, instabilityRarityPercent } = data.config.trials.boons
  return rarityWeights[rarity] * (1 + (instabilityLevel * instabilityRarityPercent[rarity]) / 100)
}

/**
 * Tung lựa chọn ân huệ sau trận thắng: choiceCount + luật boonChoices ân huệ khác nhau theo trọng
 * số bậc hiếm (độ bất ổn tầng nâng bậc hiếm cao); hết ân huệ tung được thì ít hơn; luật noBoons thì
 * không có. Không tốn RNG khi rỗng.
 */
export function rollTrialBoonChoices(
  data: GameData,
  rng: RngState,
  { realm, instabilityLevel }: { realm: SecretRealm; instabilityLevel: number }
): [string[], RngState] {
  if (hasTrialRule(data, realm.rules, 'noBoons')) return [[], rng]
  const count = data.config.trials.boons.choiceCount + extraBoonChoiceCount(data, realm.rules)
  let candidates = Object.values(data.trialBoons).filter((def) => isOfferable(data, realm, def))
  const chosen: string[] = []
  while (chosen.length < count && candidates.length > 0) {
    let def: TrialBoonDef
    ;[def, rng] = pickWeighted(rng, candidates, (candidate) =>
      trialBoonRarityWeight(data, candidate.rarity, instabilityLevel)
    )
    chosen.push(def.id)
    candidates = candidates.filter((candidate) => candidate.id !== def.id)
  }
  return [chosen, rng]
}
