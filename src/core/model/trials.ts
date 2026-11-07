// Bí cảnh và tháp thí luyện (docs/rules/trials.md): luật bí cảnh (src/data/trialRules.json; tên ở
// i18n), bí cảnh đang đi trong GameState, tháp, trận thuộc bí cảnh / tháp trong BattleState, config.

import type { DropEntry, NormalRarity, TraitHookDef } from './content'
import type { ItemReward } from './trainers'
import type { BattleSpirit, ItemWorldRun } from './artifactSpirits'

/**
 * Loại luật (registry TRIAL_RULES ở registries/trialRules.ts): cấm vật phẩm, chỉ quái một hệ, môi
 * trường cố định, mọi trận là boss, cấm biến hình, cấm kỹ năng ngự thú sư, địch mạnh hơn, không hồi
 * máu giữa các trận, hook trait cho một phe, quái địch thêm trait, quái hoang là quái fuse, quái từ
 * map khác (độ bất ổn tầng, docs/rules/instability.md, dùng chung registry), khóa ân huệ, thêm lựa
 * chọn ân huệ (docs/rules/trial-boons.md).
 */
export const TRIAL_RULE_TYPES = [
  'noItems',
  'monoElement',
  'fixedField',
  'bossOnly',
  'noTransforms',
  'noTamerSkills',
  'enemyMultiplier',
  'noHealing',
  'sideHooks',
  'extraEnemyTraits',
  'fusedEnemies',
  'foreignSpecies',
  'noBoons',
  'boonChoices'
] as const

export type TrialRuleType = (typeof TRIAL_RULE_TYPES)[number]

/** Một luật trong trialRules.json: tham số theo loại, trọng số khi tung luật. */
export interface TrialRuleDef {
  id: string
  type: TrialRuleType
  params: Record<string, unknown>
  /** Trọng số ở bí cảnh / tháp (0 = không tung). */
  weight: number
  /** Là thuộc tính bất ổn tầng (docs/rules/instability.md); bỏ trống = không. */
  instability?: InstabilityRuleDef
}

/** Phần thuộc tính bất ổn của một luật: trọng số khi tung, % thưởng cộng thêm (luật khó hơn). */
export interface InstabilityRuleDef {
  weight: number
  rewardPercent: number
}

/** Luật đã tung cho một bí cảnh / tầng tháp; `elementId` chỉ có ở luật monoElement. */
export interface TrialRule {
  ruleId: string
  elementId: string | null
}

/** Bí cảnh đang đi (GameState.trial): mỗi trận sinh lúc bắt đầu trận, tất định theo RNG của save. */
export interface SecretRealm {
  kind: 'realm'
  /** Tầng sức mạnh của quái (level, gen, bậc trang bị): tầng cao nhất lúc vào + floorOffset (≥ 1). */
  floor: number
  /** Map chủ đề: bảng gặp, NPC, boss cuối, đồ rơi, môi trường tự nhiên. */
  biomeId: string
  rules: TrialRule[]
  battleCount: number
  /** Số trận đã thắng (trận kế tiếp là trận thứ cleared + 1; trận cuối là boss). */
  cleared: number
  /** Ân huệ đã chọn trong lượt (docs/rules/trial-boons.md); hết lượt thì mất. */
  boons: TrialBoonStack[]
  /** Ân huệ đang chờ chọn sau trận thắng (rỗng = không chờ; còn chờ thì chưa đánh trận kế). */
  boonChoices: string[]
}

/** Bậc hiếm của ân huệ: quyết định trọng số khi tung (config.trials.boons.rarityWeights) và màu UI. */
export const TRIAL_BOON_RARITIES = ['common', 'rare', 'epic'] as const

export type TrialBoonRarity = (typeof TRIAL_BOON_RARITIES)[number]

/**
 * Loại hiệu ứng của ân huệ (registry TRIAL_BOON_EFFECTS ở registries/trialBoons.ts): hook trait
 * trong trận cho mọi quái phe người chơi, % thưởng trận, hồi máu thêm sau trận thắng, lượt tung
 * thêm của rương, boss mất máu đầu trận.
 */
export const TRIAL_BOON_EFFECT_TYPES = ['hooks', 'reward', 'heal', 'chest', 'bossWeaken'] as const

export type TrialBoonEffectType = (typeof TRIAL_BOON_EFFECT_TYPES)[number]

/** Kênh % thưởng của trận: `reward` = tiền và tỉ lệ đồ rơi, `exp` = EXP (như độ khó / bất ổn). */
export type BattleRewardChannel = 'reward' | 'exp'

/** Một hiệu ứng của ân huệ; mọi số nhân số cấp (stacks) của ân huệ. */
export type TrialBoonEffect =
  /** Hook trait chỉ trong trận cho mọi quái phe người chơi (như luật sideHooks; hệ số = cấp). */
  | { type: 'hooks'; hooks: TraitHookDef[] }
  /** % thưởng của trận bí cảnh theo kênh (cộng với % độ khó). */
  | { type: 'reward'; channel: BattleRewardChannel; percent: number }
  /** % max HP hồi thêm cho cả đội sau mỗi trận thắng (cộng healPercent; luật noHealing tắt). */
  | { type: 'heal'; percent: number }
  /** Lượt tung món thêm của rương bí cảnh. */
  | { type: 'chest'; rolls: number }
  /** Quái địch của trận boss bí cảnh vào trận đã mất % max HP (tổng kẹp bossWeakenCapPercent). */
  | { type: 'bossWeaken'; percent: number }

/** Ân huệ trong trialBoons.json (tên ở i18n trialBoons). */
export interface TrialBoonDef {
  id: string
  rarity: TrialBoonRarity
  effects: TrialBoonEffect[]
  /** Cấp tối đa (chọn lại thì + 1 cấp); bỏ trống = không trần. */
  maxStacks?: number
}

/** Ân huệ đã chọn trong lượt bí cảnh và cấp của nó (≥ 1). */
export interface TrialBoonStack {
  boonId: string
  stacks: number
}

export interface TowerState {
  /** Tầng tháp cao nhất đã thắng (0 = chưa). */
  highest: number
}

/**
 * Phó bản chuỗi trận đang đi (GameState.trial): bí cảnh hoặc Khí giới bí cảnh
 * (docs/rules/artifact-spirits.md). Chỉ đi một phó bản một lúc.
 */
export type TrialRun = SecretRealm | ItemWorldRun

/**
 * Trận trong bí cảnh / tháp / Khí giới bí cảnh (BattleState.trial): map và luật của trận. Khí giới bí
 * cảnh không có luật (`rules` rỗng): tầng đang đánh, bậc boss (null = trận thường), dã linh trong trận.
 */
export type BattleTrial =
  | { kind: 'realm'; biomeId: string; rules: TrialRule[] }
  | { kind: 'tower'; biomeId: string; rules: TrialRule[]; towerFloor: number }
  | {
      kind: 'itemWorld'
      biomeId: string
      rules: TrialRule[]
      depth: number
      bossTierId: string | null
      spirit: BattleSpirit | null
    }

export type TrialKind = BattleTrial['kind']

/** Một thuộc tính bất ổn đã tung (GameState.instability); ẩn thì lộ khi rời thị trấn ra tầng. */
export interface InstabilityProperty {
  ruleId: string
  hidden: boolean
}

/** Độ bất ổn tầng người chơi đặt ở Đền dịch chuyển (0 = tắt; mỗi mức 2 thuộc tính). */
export interface InstabilityState {
  level: number
  properties: InstabilityProperty[]
}

/** Độ bất ổn áp cho một trận quái hoang / boss trên tầng (BattleState.instability), chụp lúc mở. */
export interface BattleInstability {
  level: number
  ruleIds: string[]
}

export interface InstabilityConfig {
  /** Mức tối đa = ⌊tầng cao nhất từng đạt / floorsPerLevel⌋. */
  floorsPerLevel: number
  /** Số thuộc tính hiện / ẩn thêm mỗi mức. */
  visiblePerLevel: number
  hiddenPerLevel: number
  /** % tiền, EXP, tỉ lệ đồ rơi cộng mỗi mức (cộng với rewardPercent của thuộc tính). */
  rewardPercentPerLevel: number
  /** Giá đổi thuộc tính = rerollCostPerLevel × mức. */
  rerollCostPerLevel: number
}

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
  /** Ân huệ trong lượt bí cảnh (docs/rules/trial-boons.md). */
  boons: {
    /** Số ân huệ khác nhau tung sau mỗi trận thắng (trừ trận cuối); 0 = tắt. */
    choiceCount: number
    rarityWeights: Record<TrialBoonRarity, number>
    /**
     * % trọng số gốc cộng thêm mỗi mức độ bất ổn tầng (docs/rules/instability.md): trọng số = gốc ×
     * (1 + mức × % / 100); bậc hiếm cao cộng nhiều hơn nên bất ổn càng cao ân huệ càng hiếm.
     */
    instabilityRarityPercent: Record<TrialBoonRarity, number>
    /** Trần tổng % máu boss mất đầu trận của các ân huệ bossWeaken (boss không gục vì ân huệ). */
    bossWeakenCapPercent: number
    /** Bỏ lựa chọn: tiền = moneyPerLevel × level tối đa của tầng sức mạnh × skipMoneyPercent %. */
    skipMoneyPercent: number
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
