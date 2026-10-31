// Bộ sưu tập (docs/rules/dex.md): loài đã gặp / đã sở hữu, thưởng theo mốc, thưởng sưu tập.

/** Phần Dex trong save: id loài đã gặp / đã sở hữu (không trùng; đã sở hữu thì cũng đã gặp). */
export interface DexState {
  seen: string[]
  owned: string[]
  /** Id loài đã sở hữu bản shiny (⊆ owned). */
  shinyOwned: string[]
  /** Id mốc thưởng đã nhận. */
  claimedMilestones: string[]
  /** Id map đã nhận thưởng hoàn thành Dex của map. */
  claimedRegions: string[]
  /**
   * Bộ phận đã đánh trúng bằng đòn nhắm, theo id loài (docs/rules/hit-locations.md mục "Khám phá điểm
   * yếu"): bộ phận đã trúng thì người chơi biết nó có phải điểm yếu không (tra dữ liệu loài).
   */
  hitParts: Record<string, string[]>
}

/** Thưởng hoàn thành Dex của một map (sở hữu mọi loài của map): tiền × highestFloor, vật phẩm. */
export interface DexRegionalReward {
  moneyPerFloor: number
  items: Record<string, number>
}

/** Mốc thưởng: sở hữu đủ `percent` % loài của Dex thì nhận được (tiền × highestFloor, vật phẩm). */
export interface DexMilestone {
  id: string
  percent: number
  moneyPerFloor: number
  items: Record<string, number>
}

/** config.dex (balance.json). */
export interface DexConfig {
  milestones: DexMilestone[]
  /** Mỗi `collectionStep` loài đã sở hữu: mọi quái người chơi + collectionStatPercent % mọi chỉ số trong trận. */
  collectionStep: number
  collectionStatPercent: number
  regionalReward: DexRegionalReward
}

/** Hệ số bắt chí mạng theo % loài đã sở hữu (như Pokémon theo số loài đã bắt). */
export interface CriticalTier {
  ownedPercent: number
  multiplier: number
}
