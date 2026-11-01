// Nhãn hiển thị tiếng Việt cho các khái niệm cố định trong code (tên loài, skill... lấy từ JSON).

import type { Gender, StatName, TraitKind } from '@core'

/** Tên game (màn tiêu đề). Tiêu đề cửa sổ nằm trong src/renderer/index.html, phải khớp. */
export const GAME_TITLE = 'My creature collector game'

export const STAT_LABELS: Record<StatName, string> = {
  hp: 'HP',
  attack: 'Công',
  defense: 'Thủ',
  spAttack: 'Công ĐB',
  spDefense: 'Thủ ĐB',
  speed: 'Tốc độ'
}

export const GENDER_LABELS: Record<Gender, string> = {
  male: '♂ Đực',
  female: '♀ Cái',
  none: 'Không giới tính'
}

export const TRAIT_KIND_LABELS: Record<TraitKind, string> = {
  positive: 'Có lợi',
  negative: 'Bất lợi',
  rare: 'Hiếm',
  shiny: 'Shiny',
  boss: 'Boss',
  race: 'Chủng tộc',
  bloodline: 'Huyết mạch',
  polarity: 'Cực tính'
}

/** Vị trí trong tóm tắt save (màn Tải game). */
export const TOWN_LABEL = 'Thị trấn'
export const floorLabel = (floor: number): string => `Tầng ${floor}`

/** Thông báo mở khóa loài khởi đầu mới (tên loài đã tra sẵn). */
export const starterUnlockedMessage = (names: readonly string[]): string =>
  `Mở khóa quái khởi đầu mới: ${names.join(', ')}`
