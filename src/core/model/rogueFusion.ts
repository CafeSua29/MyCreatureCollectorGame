// Rogue Fusion (docs/rules/rogue-fusion.md, Rogue Fusion của Cassette Beasts): trận gặp hai quái hoang
// đã hợp thể sẵn trên tầng, nguồn Bootleg và Fused Material. Kèm cách tạo Bootleg của gốc: Ritual
// Candle, Hacking Glove, nhà Bootleg, bảng nhiệm vụ.

/** Biến thể Rogue Fusion như gốc: thường, ngập (Flood), bầy (Swarm), quả cầu (Orb). */
export const ROGUE_FUSION_VARIANTS = ['standard', 'flood', 'swarm', 'orb'] as const
export type RogueFusionVariant = (typeof ROGUE_FUSION_VARIANTS)[number]

/** Điềm báo cho Rogue Fusion kế tiếp (Ritual Candle, Hacking Glove), hết khi trận Rogue Fusion mở. */
export interface RogueFusionOmen {
  /** Ritual Candle: quái đã hiến (loài, hệ đầu); null = không có. */
  candle: { speciesId: string; elementId: string | null } | null
  /** Hacking Glove: một thành phần thành Bootleg hệ ngẫu nhiên (đè nến, nến vẫn giữ). */
  hack: boolean
}

/** Phần save của Rogue Fusion và quà Bootleg. */
export interface RogueFusionState {
  omen: RogueFusionOmen
  /** Đã nhận quà Bootleg của nhà Bootleg ở thị trấn. */
  houseGiftClaimed: boolean
  /** Đã nhận quà Bootleg của bảng nhiệm vụ (loài khởi đầu không chọn). */
  questGiftClaimed: boolean
  /** Loài khởi đầu không được chọn lúc tạo game (quà bảng nhiệm vụ); rỗng = tung trong ô khởi đầu. */
  starterAlternatives: string[]
}

/** Đổi Fused Material lấy vật phẩm (như Ranger Wilma của gốc). */
export interface FusedMaterialOffer {
  itemId: string
  cost: number
}

/** Cấu hình Rogue Fusion (balance.json, khóa `rogueFusion`). */
export interface RogueFusionConfig {
  /** % trận hoang trên tầng thành trận Rogue Fusion. */
  chance: number
  variantWeights: Record<RogueFusionVariant, number>
  /** Orb Fusion chỉ xuất hiện từ tầng cao nhất này (gốc: mở sau bảng nhiệm vụ cấp 6). */
  orbUnlockFloor: number
  /** Hệ gây ngập (Flood Fusion): map có hệ này thì có Flood Fusion. */
  floodElementIds: string[]
  /** % mỗi thành phần đổi thành loài ngẫu nhiên đã gặp trong Dex. */
  seenSpeciesChance: number
  /** % mỗi thành phần là dạng tiến hóa kế tiếp ("remaster"); Swarm theo `swarmRemasterChance`. */
  remasterChance: number
  swarmRemasterChance: number
  /** % có một thành phần Bootleg theo biến thể. */
  bootlegChances: Record<RogueFusionVariant, number>
  /** Swarm: số quái bầy, hợp thể xuất hiện khi đã hạ ít nhất `swarmFusionAfter` con. */
  swarmSize: number
  swarmFusionAfter: number
  /** Orb: trạng thái quả cầu (Barrier + bị động) và % max HP của Barrier. */
  orbStatusId: string
  orbBarrierPercent: number
  /** Trạng thái chùn bước hai thành phần nhận khi hợp thể tan (gốc: Flinched lượt sau). */
  flinchStatusId: string
  /** Thưởng khi thắng: số Fused Material, % rơi Cyber Material theo biến thể. */
  fusedMaterial: Record<RogueFusionVariant, number>
  cyberChances: Record<RogueFusionVariant, number>
  /** Fused Material khi hạ boss (gốc: Archangel, trận tĩnh, đội trưởng Ranger). */
  bossFusedMaterial: number
  fusedMaterialItemId: string
  cyberMaterialItemId: string
  hackingGloveItemId: string
  ritualCandleItemId: string
  /** Ritual Candle: % thành phần Bootleg cùng loài quái đã hiến (còn lại: cùng hệ). */
  candleSpeciesPercent: number
  /** Hàng đổi bằng Fused Material. */
  exchange: FusedMaterialOffer[]
  /** Quà nhà Bootleg: level quái. */
  houseGiftLevel: number
  /** Quà bảng nhiệm vụ: số nhiệm vụ đã hoàn thành cần có (gốc: bảng Ranger cấp 5). */
  questGiftQuests: number
}
