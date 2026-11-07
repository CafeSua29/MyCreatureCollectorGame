// Sticker skill (docs/rules/skill-stickers.md, Sticker của Cassette Beasts): Bí kíp nhận được có thể
// là sticker uncommon / rare mang thuộc tính ngẫu nhiên; dán lên skill của quái thì thuộc tính chỉ
// áp cho đúng skill đó. Chỉ lưu nguyên liệu (thuộc tính, giá trị đã tung); hiệu lực tính lại khi cần.

import type { StatName } from './stats'
import type { TraitHookDef, ValueRange } from './content'

/** Độ hiếm của sticker riêng (bậc thường là Bí kíp gộp chồng như cũ). */
export const STICKER_RARITIES = ['uncommon', 'rare'] as const
export type StickerRarity = (typeof STICKER_RARITIES)[number]

/** Một thuộc tính đã tung trên sticker. */
export interface StickerRoll {
  attributeId: string
  /** Giá trị đã tung trong `range` của thuộc tính; thuộc tính không có khoảng thì không có. */
  value?: number
  /** Lựa chọn đã tung trong `choices` của thuộc tính (trạng thái của Buff User...). */
  choice?: string
}

/** Một sticker (món riêng trong túi hoặc đang dán trên skill của quái). */
export interface StickerInstance {
  /** Id "s<số>" từ GameState.nextItemId (chung bộ đếm với trang bị). */
  id: string
  skillId: string
  rarity: StickerRarity
  /** Thuộc tính theo thứ tự tung (uncommon trước, rare sau), không trùng thuộc tính. */
  rolls: StickerRoll[]
}

/**
 * Điều kiện skill để thuộc tính hợp với chiêu (gốc: thuộc tính phải "compatible with the move"):
 * gây sát thương, có kiểm tra chính xác, đánh một mục tiêu, có hiệu ứng phụ theo tỉ lệ, có gây trạng
 * thái, tốn thể lực.
 */
export const STICKER_REQUIREMENTS = [
  'damaging',
  'hasAccuracy',
  'singleTarget',
  'hasSecondary',
  'inflictsStatus',
  'costsStamina'
] as const
export type StickerRequirement = (typeof STICKER_REQUIREMENTS)[number]

/**
 * Loại hiệu ứng của thuộc tính (registry `STICKER_EFFECTS`, inventory/stickerEffects.ts). Loại cộng
 * số (`power`...) nhận `{ value }`; `trait` nhận `{ hooks }` là hook trait lên quái với chỗ giữ
 * `$skill` (skill mang sticker) / `$choice` (lựa chọn đã tung).
 */
export const STICKER_EFFECT_TYPES = [
  'power',
  'accuracy',
  'critChance',
  'critDamage',
  'effectChance',
  'splash',
  'priorityChance',
  'extraHits',
  'statusTurns',
  'heal',
  'exp',
  'repeatChance',
  'multitargetChance',
  'wallChance',
  'staminaRefund',
  'attackStat',
  'typeAdvantageCrit',
  'ignoresWalls',
  'destroysWalls',
  'compatibility',
  'extraSlot',
  'trait'
] as const
export type StickerEffectType = (typeof STICKER_EFFECT_TYPES)[number]

export interface StickerEffectDef {
  type: StickerEffectType
  params: unknown
}

/** Thuộc tính sticker (stickerAttributes.json). */
export interface StickerAttributeDef {
  id: string
  rarity: StickerRarity
  /** Trọng số khi tung trong các thuộc tính cùng độ hiếm hợp với skill (≥ 0; 0 = không tung). */
  weight: number
  effect: StickerEffectDef
  /**
   * Đường dẫn tham số nhận giá trị trong `effect.params` (như dòng trang bị, `lineParams`; danh sách =
   * ghi cùng giá trị vào nhiều chỗ).
   */
  valueParam?: string | string[]
  /** Khoảng giá trị nguyên (có `valueParam` thì bắt buộc). */
  range?: ValueRange
  /** Giá trị × số ô skill còn trống của quái (gốc "per empty slot"). */
  perEmptySlot?: true
  /** Danh sách lựa chọn (id trạng thái...), tung đều một cái lúc tạo sticker, thay `$choice`. */
  choices?: string[]
  /** Chỉ skill thuộc một trong các hệ này (trạng thái theo hệ skill của gốc: contact damage). */
  elementIds?: string[]
  /** Skill phải thỏa mọi điều kiện thì mới tung được thuộc tính này. */
  requires?: StickerRequirement[]
}

/** Trọng số số thuộc tính (số lượng → trọng số). */
export interface StickerCountWeight {
  count: number
  weight: number
}

/** Cấu hình sticker (balance.json, khóa `stickers`). */
export interface StickerConfig {
  /** % một Bí kíp nhận được thành sticker theo độ hiếm (tung rare trước, rồi uncommon). */
  rarityChances: Record<StickerRarity, number>
  /** Số thuộc tính uncommon theo độ hiếm của sticker. */
  uncommonCounts: Record<StickerRarity, StickerCountWeight[]>
  /** Số thuộc tính rare theo độ hiếm của sticker. */
  rareCounts: Record<StickerRarity, number>
  /** Số thuộc tính tối đa trên một sticker (gốc 3). */
  maxAttributes: number
  /** Ô skill tối đa khi cộng ô từ sticker Extra Slots (gốc 16). */
  maxSkillSlots: number
  /** Tẩy luyện sticker ở Thợ rèn: × (1 + số thuộc tính khóa); tiền nhân highestFloor. */
  reroll: StickerRerollConfig
}

/** Giá tẩy luyện một sticker theo độ hiếm (docs/rules/skill-stickers.md mục "Tẩy luyện"). */
export interface StickerRerollConfig {
  stones: Record<StickerRarity, number>
  moneyPerFloor: Record<StickerRarity, number>
}

/** Hiệu lực sticker lên một skill (gộp mọi thuộc tính của sticker trên skill đó). */
export interface StickerSkillBonus {
  /** % power cộng thêm (nhân power). */
  powerPercent: number
  /** % chính xác cộng thêm (nhân tỉ lệ trúng). */
  accuracyPercent: number
  /** Điểm % chí mạng cộng thẳng. */
  critChancePercent: number
  /** Điểm % sát thương chí mạng cộng thẳng vào hệ số chí mạng. */
  critDamagePercent: number
  /** % tỉ lệ hiệu ứng phụ cộng thêm (nhân tỉ lệ). */
  effectChancePercent: number
  /** % sát thương đòn lan sang đồng đội của mục tiêu. */
  splashPercent: number
  /** % được +1 priority lượt này. */
  priorityChance: number
  extraHits: number
  /** Lượt cộng thêm cho trạng thái skill gây ra. */
  statusTurns: number
  /** % max HP quái dùng hồi sau khi dùng skill. */
  healPercent: number
  /** % EXP quái nhận khi thắng nếu skill này được dùng / kích hoạt trong trận. */
  expPercent: number
  /** % dùng skill thêm một lần. */
  repeatChance: number
  /** % skill đơn mục tiêu nhắm cả phe. */
  multitargetChance: number
  /** % dựng tường theo hệ skill lên quái dùng. */
  wallChance: number
  /** Hoàn thể lực sau khi dùng: `amount` điểm hoặc toàn bộ giá skill (`all`). */
  staminaRefunds: { chance: number; amount: number | 'all' }[]
  /** Chỉ số dùng làm công nếu cao hơn chỉ số công thường. */
  attackStats: StatName[]
  typeAdvantageCrit: boolean
  ignoresWalls: boolean
  destroysWalls: boolean
}

/** Hook trait lên quái từ sticker (đã thay chỗ giữ), kèm id sticker làm nguồn. */
export interface StickerTraitHook {
  hook: TraitHookDef
  stickerId: string
}
