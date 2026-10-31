// Bí cảnh và tháp thí luyện (docs/rules/trials.md): luật bí cảnh (src/data/trialRules.json; tên ở
// i18n), bí cảnh đang đi trong GameState, tháp, trận thuộc bí cảnh / tháp trong BattleState, config.

import type { DropEntry } from './content'
import type { ItemReward } from './trainers'
import type { NormalRarity } from './content'

/**
 * Loại luật (registry TRIAL_RULES ở registries/trialRules.ts): cấm vật phẩm, chỉ quái một hệ, môi
 * trường cố định, mọi trận là boss, cấm biến hình, cấm kỹ năng ngự thú sư, địch mạnh hơn, không hồi
 * máu giữa các trận.
 */
export const TRIAL_RULE_TYPES = [
  'noItems',
  'monoElement',
  'fixedField',
  'bossOnly',
  'noTransforms',
  'noTamerSkills',
  'enemyMultiplier',
  'noHealing'
] as const

export type TrialRuleType = (typeof TRIAL_RULE_TYPES)[number]

/** Một luật trong trialRules.json: tham số theo loại, trọng số khi tung luật. */
export interface TrialRuleDef {
  id: string
  type: TrialRuleType
  params: Record<string, unknown>
  weight: number
}

/** Luật đã tung cho một bí cảnh / tầng tháp; `elementId` chỉ có ở luật monoElement. */
export interface TrialRule {
  ruleId: string
  elementId: string | null
}

/** Bí cảnh đang đi (GameState.trial): mỗi trận sinh lúc bắt đầu trận, tất định theo RNG của save. */
export interface SecretRealm {
  /** Tầng sức mạnh của quái (level, gen, bậc trang bị): tầng cao nhất lúc vào + floorOffset (≥ 1). */
  floor: number
  /** Map chủ đề: bảng gặp, NPC, boss cuối, đồ rơi, môi trường tự nhiên. */
  biomeId: string
  rules: TrialRule[]
  battleCount: number
  /** Số trận đã thắng (trận kế tiếp là trận thứ cleared + 1; trận cuối là boss). */
  cleared: number
}

export interface TowerState {
  /** Tầng tháp cao nhất đã thắng (0 = chưa). */
  highest: number
}

/** Trận trong bí cảnh / tháp (BattleState.trial): map và luật của trận. */
export type BattleTrial =
  | { kind: 'realm'; biomeId: string; rules: TrialRule[] }
  | { kind: 'tower'; biomeId: string; rules: TrialRule[]; towerFloor: number }

export type TrialKind = BattleTrial['kind']

/** Một món trong rương bí cảnh: trọng số khi tung, số lượng đều trong [min, max]. */
export interface ChestItemEntry {
  itemId: string
  weight: number
  min: number
  max: number
}

export interface TrialConfig {
  /** Bí Cảnh Lệnh: tiêu một cái để vào bí cảnh. */
  tokenItemId: string
  /** Bí Cảnh Lệnh rơi từ boss (× hệ số rơi). */
  tokenBossDrops: DropEntry[]
  realm: {
    /** Tầng sức mạnh = tầng cao nhất + floorOffset (có thể âm), tối thiểu 1. */
    floorOffset: number
    battleCount: { min: number; max: number }
    ruleCount: { min: number; max: number }
    /** % trận (trừ trận cuối) là ngự thú sư NPC thay vì quái hoang. */
    trainerChance: number
    /** % max HP hồi sau mỗi trận thắng (không hồi quái đã gục; luật noHealing tắt). */
    healPercent: number
    chest: {
      /** Số lượt tung món = itemRolls + itemRollsPerBattle × số trận. */
      itemRolls: number
      itemRollsPerBattle: number
      items: ChestItemEntry[]
      /** Trang bị theo danh sách rơi của map chủ đề, bậc theo bảng này (rare trở lên). */
      equipmentCount: number
      equipmentRarityWeights: Partial<Record<NormalRarity, number>>
      /** Sách kỹ năng: skill trong learnset loài của map chủ đề; reusableChance % là Chân kinh. */
      skillBookCount: number
      reusableBookChance: number
    }
  }
  tower: {
    ruleCount: { min: number; max: number }
    /** Tầng sức mạnh = ⌈tầng tháp × floorScale⌉. */
    floorScale: number
    /** Level cộng thêm cho đội địch. */
    levelOffset: number
    /** Mỗi bossEvery tầng tháp là trận boss (boss tầng của map). */
    bossEvery: number
    /** Thắng một tầng tháp (lần đầu, mỗi tầng chỉ thắng một lần). */
    floorRewards: ItemReward[]
    milestoneEvery: number
    milestoneRewards: ItemReward[]
  }
}
