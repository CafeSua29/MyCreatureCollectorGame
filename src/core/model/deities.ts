// Thần linh và ân sủng (docs/rules/deities.md): mỗi map do một thần cai quản (Biome.deityId); hoạt
// động trong map tăng ân sủng với thần đó, bậc ân sủng mở chúc phúc chỉ tác dụng trong map của thần.

/**
 * Loại hiệu ứng chúc phúc (registry BLESSING_EFFECTS ở registries/blessings.ts). `elementStatPercent`
 * cộng % chỉ số trong trận cho quái ta có hệ của thần (nguồn % `blessing`); loại còn lại nhân một kênh
 * phần thưởng / tỉ lệ của trận trong map của thần.
 */
export const BLESSING_EFFECT_TYPES = [
  'elementStatPercent',
  'expPercent',
  'moneyPercent',
  'dropRatePercent',
  'catchRatePercent',
  'recruitPercent',
  'shinyChancePercent'
] as const

export type BlessingEffectType = (typeof BLESSING_EFFECT_TYPES)[number]

/** Một hiệu ứng của chúc phúc: tham số theo loại (kiểm tra ở BLESSING_EFFECTS.validateParams). */
export interface BlessingEffectDef {
  type: BlessingEffectType
  params: unknown
}

/** Một chúc phúc: mọi hiệu ứng cùng mở ở một bậc. */
export interface BlessingDef {
  effects: BlessingEffectDef[]
}

/** Một món của cửa hàng thần: giá bằng tín vật của thần, mở từ bậc ân sủng `minRank`. */
export interface DeityShopEntry {
  itemId: string
  price: number
  minRank: number
}

/**
 * Một thần (src/data/deities.json; tên ở i18n): hệ của thần (chúc phúc chỉ số), tín vật (rơi trong
 * map của thần, tiền của cửa hàng thần), chúc phúc theo bậc, cửa hàng.
 */
export interface DeityDef {
  id: string
  elementId: string
  tokenItemId: string
  /**
   * Bậc k mở chúc phúc thứ ((k − 1) mod số chúc phúc): hết danh sách thì lặp lại từ đầu, cộng dồn
   * (ân sủng không trần).
   */
  blessings: BlessingDef[]
  shop: DeityShopEntry[]
}

/** config.deities (balance.json). */
export interface DeityConfig {
  /** Ân sủng mỗi trận thắng / thêm khi thắng trận boss / mỗi quái bắt hoặc thu phục. */
  favorPerWin: number
  favorPerBossWin: number
  favorPerCapture: number
  /** Hương nến: dâng ở Miếu, mỗi nén cộng favorPerIncense ân sủng. */
  incenseItemId: string
  favorPerIncense: number
  /** Ân sủng cần cho bậc r = rankBase × r^rankPower (đa thức, không trần). */
  rankBase: number
  rankPower: number
  /** % rơi tín vật mỗi quái hoang / boss bị hạ trong map của thần (× hệ số rơi). */
  tokenWildChance: number
  tokenBossChance: number
}
