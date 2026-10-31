// Tra chữ nội dung cho UI (tên loài, trait, vật phẩm...). Tạm dùng ngôn ngữ mặc định của dữ liệu;
// chọn ngôn ngữ trong Cài đặt làm ở bước UI (mục "Đa ngôn ngữ").

import {
  contentName,
  monsterName,
  type ContentKind,
  type GameData,
  type LanguageCode,
  type MonsterView,
  type SaveSummary
} from '@core'
import { floorLabel, TOWN_LABEL } from './labels'

/** Ngôn ngữ đang hiển thị. */
export function uiLanguage(data: GameData): LanguageCode {
  return data.text.defaultLanguage
}

/** Tên hiển thị của một nội dung theo ngôn ngữ đang dùng. */
export function nameOf(data: GameData, kind: ContentKind, id: string): string {
  return contentName(data, uiLanguage(data), kind, id)
}

/** Tên hiển thị của quái: biệt danh, không có thì tên loài. */
export function monsterNameOf(
  data: GameData,
  monster: Pick<MonsterView, 'nickname' | 'speciesId'>
): string {
  return monsterName(data, uiLanguage(data), monster)
}

/** Tên quái đầu đội trong tóm tắt save: biệt danh, không có thì tên loài. */
export function summaryLeaderName(data: GameData, summary: SaveSummary): string {
  if (summary.leaderNickname !== null) return summary.leaderNickname
  return summary.leaderSpeciesId === null ? '?' : nameOf(data, 'species', summary.leaderSpeciesId)
}

/** Dòng tiêu đề của một game trong màn Tải game: "tên quái đầu đội · tên loài". */
export function summaryLeaderLabel(data: GameData, summary: SaveSummary): string {
  const name = summaryLeaderName(data, summary)
  if (summary.leaderSpeciesId === null) return name
  return `${name} · ${nameOf(data, 'species', summary.leaderSpeciesId)}`
}

/** Vị trí trong tóm tắt save: "Thị trấn" hoặc "Tầng N · tên biome". */
export function summaryLocationLabel(data: GameData, summary: SaveSummary): string {
  const { location } = summary
  if (location.type === 'town') return TOWN_LABEL
  return `${floorLabel(location.floor)} · ${nameOf(data, 'biomes', location.biomeId)}`
}
