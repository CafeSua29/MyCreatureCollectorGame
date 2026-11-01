// Khí linh và Khí giới bí cảnh (docs/rules/artifact-spirits.md): loại khí linh (src/data/
// artifactSpirits.json; tên ở i18n), khí linh trên món / trong kho / ở Linh trì, lượt đi Khí giới bí
// cảnh (GameState.trial loại itemWorld), config (balance.json khóa `artifactSpirits`).

import type { DropEntry, EquipmentRarity, NormalRarity, TraitHookDef, ValueRange } from './content'
import type { EquipmentInstance } from './state'
import type { ItemReward } from './trainers'

/**
 * Loại khí linh: `hooks` là hiệu ứng ở value 1 (hệ số hook = value hiệu lực), `awakenedHooks` thêm
 * khi phẩm cấp đạt `awakenGrade`. `softCap`: value hiệu lực giảm dần, tiến tới softCap khi value →
 * ∞ (hiệu ứng có trần tự nhiên như giảm sát thương, hồi máu; bỏ trống = tuyến tính).
 */
export interface ArtifactSpiritDef {
  id: string
  /** Trọng số khi tung loại (dã linh trên đồ rơi, Dẫn Hồn Châu, Khí giới bí cảnh). */
  weight: number
  hooks: TraitHookDef[]
  awakenedHooks: TraitHookDef[]
  softCap?: number
}

/**
 * Một khí linh: một loại, hoặc hai loại khác nhau (khí linh kép từ phối linh: hiệu ứng của cả hai).
 * Dã linh (`subdued` false) chỉ có wildPotencyPercent % hiệu lực; trong kho / Linh trì luôn đã thu
 * phục.
 */
export interface ArtifactSpirit {
  typeIds: string[]
  /** Nguyên ≥ 1, không trần (gộp cộng dồn). */
  value: number
  subdued: boolean
}

/** Một cặp khí linh đang phối ở Linh trì: xong từ ngày `readyDay`. */
export interface SpiritPool {
  first: ArtifactSpirit
  second: ArtifactSpirit
  readyDay: number
}

/** Chỗ của một khí linh: kho (theo vị trí) hoặc trên món trang bị (túi hoặc đang lắp). */
export type SpiritLocation =
  { kind: 'storage'; index: number } | { kind: 'equipment'; instanceId: string; index: number }

/** Nơi chuyển khí linh tới: kho, hoặc ô trống của một món. */
export type SpiritDestination = { kind: 'storage' } | { kind: 'equipment'; instanceId: string }

/** Thức ăn nuôi khí linh: yêu đan bất kỳ (nhóm feed.groupId) hoặc một hồn phách. */
export type SpiritFood = { kind: 'cores'; count: number } | { kind: 'soul'; soulId: string }

/**
 * Lượt đi Khí giới bí cảnh (GameState.trial): món được lấy khỏi túi trong lúc đi (không lắp, bán,
 * phân giải được), trả về túi khi rời / thua. `cleared` = số tầng đã qua trong lượt này.
 */
export interface ItemWorldRun {
  kind: 'itemWorld'
  instance: EquipmentInstance
  cleared: number
}

/** Dã linh trong trận Khí giới bí cảnh: quái địch `carrierId` mang khí linh ở vị trí `index` của món. */
export interface BattleSpirit {
  carrierId: string
  index: number
}

/** Boss của Khí giới bí cảnh (Khí Tướng, Khí Vương, Khí Thần): tầng chia hết cho `every`. */
export interface ItemWorldBossTier {
  id: string
  every: number
  /** Nhân vào bossMultiplier của boss. */
  multiplier: number
  /** Số lần thưởng Khí Tướng (thêm dòng phụ hoặc + value mọi khí linh). */
  bonusRolls: number
  rewards: ItemReward[]
}

export interface ItemWorldConfig {
  /** Tầng sức mạnh = rarityFloors[bậc] + ⌈floorsPerDepth × tầng + floorsPerLevel × (cấp − 1)⌉. */
  rarityFloors: Record<EquipmentRarity, number>
  floorsPerDepth: number
  floorsPerLevel: number
  /** % mỗi tầng gặp một dã linh của món (hoặc khí linh mới nếu còn ô). */
  spiritChance: number
  /** Value khí linh mới gặp × (1 + newSpiritDepthPercent × tầng / 100). */
  newSpiritDepthPercent: number
  /** % max HP cả đội hồi sau mỗi tầng thắng (kể cả quái đã gục). */
  healPercent: number
  /** Rời được khi số tầng đã qua của món chia hết cho leaveEvery (hoặc chưa qua tầng nào lượt này). */
  leaveEvery: number
  /** Phá Giới Phù: rời bất kỳ lúc nào giữa hai trận. */
  breakItemId: string
  floorRewards: ItemReward[]
  /** Boss theo tầng, bậc sau thắng bậc trước khi cùng chia hết (Khí Thần tầng 100 thay Khí Tướng). */
  bosses: ItemWorldBossTier[]
  bonus: {
    /** % một lần thưởng là thêm dòng phụ (không còn dòng phụ để thêm thì + value). */
    affixChance: number
    /** Value cộng cho mọi khí linh trên món. */
    spiritValue: number
  }
}

export interface ArtifactSpiritConfig {
  /** Số ô khí linh theo bậc món (hồn khí dùng soulRelicSlots), + 1 mỗi levelsPerSlot cấp món. */
  slots: Record<EquipmentRarity, number>
  soulRelicSlots: number
  levelsPerSlot: number
  /** % hiệu lực của dã linh. */
  wildPotencyPercent: number
  /** Value khí linh mới theo bậc (món rơi: bậc món; Dẫn Hồn Châu: bậc tung theo tầng). */
  valueRanges: Record<EquipmentRarity, ValueRange>
  /** Trọng số số dã linh trên đồ rơi: phần tử thứ i = trọng số có i dã linh. */
  dropSpiritWeights: number[]
  /** Ngưỡng value của các phẩm cấp sau Phàm (Linh, Bảo, Tiên, Thần), tăng dần. */
  gradeThresholds: number[]
  /** Sau phẩm cấp cuối: + 1 bậc "Thần + n" mỗi gradeStep value. */
  gradeStep: number
  /** Phẩm cấp từ đó thức tỉnh (0 = Phàm; 2 = Bảo). */
  awakenGrade: number
  /** Giá di dời = moveMoneyPerValue × value × tầng cao nhất. */
  moveMoneyPerValue: number
  feed: {
    groupId: string
    coreValue: number
    /** Value một hồn phách theo bậc hồn khí của nó (soulRelic.rarityByAptitude). */
    soulValue: Record<EquipmentRarity, number>
  }
  breed: { days: number }
  summon: {
    orbItemId: string
    rarityWeights: Partial<Record<NormalRarity, number>>
  }
  /** Dẫn Hồn Châu rơi từ boss (× hệ số rơi). */
  orbBossDrops: DropEntry[]
  itemWorld: ItemWorldConfig
}
