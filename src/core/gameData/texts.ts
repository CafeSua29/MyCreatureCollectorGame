// Tra chữ nội dung theo ngôn ngữ (mục "Đa ngôn ngữ"). Điểm duy nhất để lấy tên hiển thị của
// loài, race, hệ, trait, skill, vật phẩm, biome.

import type { ContentKind, GameData, LanguageCode, SpeciesInfoKind } from '../model'

/** Mọi id của một loại nội dung, theo thứ tự trong dữ liệu. */
export function contentIds(data: GameData, kind: ContentKind): string[] {
  return Object.keys(data[kind])
}

/** Các ngôn ngữ có trong dữ liệu. */
export function languageCodes(data: GameData): LanguageCode[] {
  return Object.keys(data.text.languages)
}

/**
 * Tên hiển thị của một nội dung. Ngôn ngữ không có thì dùng ngôn ngữ mặc định; id không có chữ
 * (dữ liệu đã kiểm tra nên chỉ gặp với id lạ, ví dụ save cũ) thì trả lại chính id.
 */
export function contentName(
  data: GameData,
  language: LanguageCode,
  kind: ContentKind,
  id: string
): string {
  const pack = data.text.languages[language] ?? data.text.languages[data.text.defaultLanguage]
  return pack?.content[kind]?.[id] ?? id
}

/**
 * Chữ thông tin loài (phân loại, mô tả; docs/rules/dex.md) theo ngôn ngữ: thiếu thì lấy ngôn ngữ mặc
 * định rồi ngôn ngữ khác có chữ; dạng khác (`formOf`) không có thì lấy của loài gốc. Không có = null.
 */
export function speciesInfoText(
  data: GameData,
  language: LanguageCode,
  kind: SpeciesInfoKind,
  speciesId: string
): string | null {
  const order = [language, data.text.defaultLanguage, ...languageCodes(data)]
  const species = data.species[speciesId]
  const ids = [speciesId, ...(species?.kind === 'normal' && species.formOf ? [species.formOf] : [])]
  for (const id of ids) {
    for (const code of order) {
      const text = data.text.languages[code]?.speciesInfo?.[kind]?.[id]
      if (text) return text
    }
  }
  return null
}
