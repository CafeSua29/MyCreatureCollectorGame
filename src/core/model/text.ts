// Chữ nội dung game theo ngôn ngữ (mục "Đa ngôn ngữ" trong docs/rules/data.md). JSON nội dung chỉ
// giữ id và số; tên hiển thị nằm trong src/data/i18n/<ngôn ngữ>/<loại>.json, tra theo id.

/** Các loại nội dung có chữ. Thêm loại mới = thêm vào đây + file i18n cho mọi ngôn ngữ. */
export const CONTENT_KINDS = [
  'elements',
  'raceGroups',
  'races',
  'species',
  'traits',
  'skills',
  'items',
  'biomes',
  'statuses',
  'minions',
  'fieldEffects',
  'tamerSkills',
  'tamerRealms',
  'affinityTiers',
  'talentBranches',
  'talents',
  'synergies',
  'formations',
  'natures',
  'bodyParts',
  'aptitudeTiers',
  'speciesRanks',
  'bloodlines',
  'partnerSkills',
  'quests',
  'expeditions',
  'trainers',
  'trialRules',
  'events',
  'eventModifiers',
  'zones',
  'serumEffects',
  'deities',
  'artifactSpirits'
] as const

export type ContentKind = (typeof CONTENT_KINDS)[number]

/** Mã ngôn ngữ = tên folder trong src/data/i18n (ví dụ "vi", "en"). */
export type LanguageCode = string

/** Chữ nội dung của một ngôn ngữ: theo loại nội dung, id → tên. */
export type ContentText = Record<ContentKind, Record<string, string>>

/**
 * Chữ thông tin loài cho trang Bộ sưu tập (docs/rules/dex.md): phân loại ("Mouse Pokémon") và mô tả.
 * Không bắt buộc đủ mọi loài / mọi ngôn ngữ (chỉ có khi nguồn có); file
 * src/data/i18n/<ngôn ngữ>/speciesInfo/<loại>.json.
 */
export const SPECIES_INFO_KINDS = ['category', 'flavor'] as const

export type SpeciesInfoKind = (typeof SPECIES_INFO_KINDS)[number]

export interface LanguagePack {
  /** Tên ngôn ngữ viết bằng chính ngôn ngữ đó (ví dụ "Tiếng Việt"), cho màn chọn ngôn ngữ. */
  name: string
  content: ContentText
  /** Thông tin loài theo loại: id loài → chữ (thiếu file = không có). */
  speciesInfo?: Partial<Record<SpeciesInfoKind, Record<string, string>>>
}

export interface TextData {
  /** Ngôn ngữ mặc định (src/data/i18n/config.json). */
  defaultLanguage: LanguageCode
  languages: Record<LanguageCode, LanguagePack>
}
