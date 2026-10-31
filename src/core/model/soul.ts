// Hồn phách và hồn khí (docs/rules/soul-relics.md): quái chết hẳn để lại hồn phách trong túi; hồn
// phách ấp thành trứng truyền thừa hoặc luyện thành hồn khí (trang bị mang trait của quái).

import type { EquipmentRarity, TraitInstance } from './content'
import type { MonsterHistory } from './history'
import type { BigStats } from './stats'

/**
 * Kiểu chết vĩnh viễn để lại hồn phách. Mục sau có kiểu chết mới (cấy ghép thất bại, implant.md)
 * thêm vào đây.
 */
export const DEATH_CAUSES = ['oldAge', 'tribulation'] as const

export type DeathCause = (typeof DEATH_CAUSES)[number]

/**
 * Hồn phách: ảnh chụp lúc chết những gì trứng truyền thừa và hồn khí cần (không gộp chồng). Id bằng
 * id của quái đã chết (id quái không bao giờ dùng lại).
 */
export interface SoulRemnant {
  id: string
  /** Loài lúc chết (hiển thị). */
  speciesId: string
  /**
   * Loài gốc lúc chết (Monster.baseSpeciesId): trứng truyền thừa nở dạng đầu tiên của loài này;
   * chỉ số gốc của loài này là trọng số chọn dòng chính của hồn khí.
   */
  baseSpeciesId: string
  raceId: string
  nickname: string | null
  level: number
  genes: BigStats
  /** Trait chiếm ô của quái (giữ cấp); trait shiny / boss / race không giữ. */
  traits: TraitInstance[]
  shinyStacks: number
  contractRealm: number | null
  /** Bậc tư chất lúc chết (so với tầng cao nhất lúc đó): bậc của hồn khí. */
  aptitudeTierId: string
  /** Bản sao lý lịch (đã có mốc `died`); null nếu quái không có lý lịch. */
  history: MonsterHistory | null
}

/** Phần "hồn" của một món hồn khí: quái đã luyện thành món này (hiển thị, giới hạn lắp theo race). */
export interface SoulImprint {
  speciesId: string
  raceId: string
  nickname: string | null
  /** Trait của dòng hồn (cấp là giá trị dòng `soul`); null = quái không có trait chiếm ô. */
  traitId: string | null
  history: MonsterHistory | null
}

/** Cấu hình hồn phách / hồn khí (balance.json, khóa `soulRelic`). */
export interface SoulRelicConfig {
  /** Giá luyện hồn khí = forgeCostPerLevel × level của quái lúc chết. */
  forgeCostPerLevel: number
  /** Bậc hồn khí theo bậc tư chất lúc chết: đủ mọi bậc tư chất (aptitudeTiers.json). */
  rarityByAptitude: Record<string, EquipmentRarity>
}
