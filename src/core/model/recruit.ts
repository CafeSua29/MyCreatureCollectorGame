// Thu phục (docs/rules/recruit.md): quái hoang bị hạ xin theo, boss quy phục, Thị Uy, mồi dụ.

/**
 * Cách quái về tay người chơi khi thu phục (lý lịch `recruit`): xin theo sau trận thắng, Thị Uy
 * ngay trong trận, boss quy phục sau khi bị hạ.
 */
export const RECRUIT_METHODS = ['afterBattle', 'intimidate', 'bossSubmit'] as const

export type RecruitMethod = (typeof RECRUIT_METHODS)[number]

/** Mồi dụ đang dùng: id vật phẩm (category `bait`) và số trận còn tác dụng (≥ 1). */
export interface ActiveBait {
  itemId: string
  battlesLeft: number
}

/** Phần thu phục trong save. */
export interface RecruitState {
  /** Mồi dụ đang dùng; null = không. */
  bait: ActiveBait | null
}

/** Số của Thị Uy: tỉ lệ = kẹp(slope × (tổng chỉ số quái ta / tổng chỉ số quái hoang) + offset). */
export interface IntimidateConfig {
  slope: number
  offset: number
  /** Tỉ lệ tối đa (0–1), sau khi nhân % thu phục. */
  maxChance: number
  /** Thất bại: quái hoang tăng các bậc này (ví dụ attack +1, spAttack +1). */
  failStages: Partial<Record<'attack' | 'spAttack', number>>
}

/** config.recruit (balance.json). */
export interface RecruitConfig {
  /** % gốc mỗi quái bị hạ xin theo, nhân catchRate / 100 của loài (catchRate thang 0–100). */
  baseChance: number
  /** % boss quy phục sau khi bị hạ (không nhân catchRate, không nhân phẩm cấp loài). */
  bossChance: number
  /** Hệ số theo phẩm cấp loài: rankFalloff ^ thứ hạng bậc (bậc thấp nhất = 1). */
  rankFalloff: number
  /** Mồi có khẩu vị đúng quái: % mồi × số này với quái đó. */
  baitFavoriteMultiplier: number
  intimidate: IntimidateConfig
}
