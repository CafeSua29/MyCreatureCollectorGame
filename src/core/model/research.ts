// Nghiên cứu loài (docs/rules/species-research.md): như Research Tasks của Pokémon Legends: Arceus,
// mỗi loài có nhiệm vụ nghiên cứu; điểm cộng dồn thành cấp, cấp mở thông tin và lợi ích riêng loài đó.

import type { ItemReward } from './trainers'

/**
 * Loại việc nhiệm vụ đếm (bộ đếm theo loài trong GameState.research). Thêm loại = thêm vào đây + gọi
 * recordResearch ở chỗ phát sinh.
 */
export const RESEARCH_TASK_KINDS = [
  'caught',
  'defeated',
  'mainElementSkillSeen',
  'evolvedInto',
  'hatched',
  'caughtWithStatus',
  'caughtShiny'
] as const

export type ResearchTaskKind = (typeof RESEARCH_TASK_KINDS)[number]

/** Loài nào nhận mẫu nhiệm vụ (registry RESEARCH_TASK_SCOPES ở registries/research.ts). */
export const RESEARCH_TASK_SCOPES = ['all', 'evolvedForm'] as const

export type ResearchTaskScope = (typeof RESEARCH_TASK_SCOPES)[number]

/** Một nhiệm vụ: mỗi mốc `thresholds` bộ đếm đạt tới cho `points` điểm. */
export interface ResearchTask {
  kind: ResearchTaskKind
  /** Mốc bộ đếm, nguyên ≥ 1, tăng ngặt. */
  thresholds: number[]
  points: number
}

/** Mẫu nhiệm vụ áp cho mọi loài thuộc `scope` (bỏ trống = mọi loài). */
export interface ResearchTaskTemplate extends ResearchTask {
  scope?: ResearchTaskScope
}

/** Lợi ích chỉ để UI mở thông tin trang Dex (và điểm yếu cho AI). */
export const RESEARCH_REVEAL_TYPES = [
  'revealProfile',
  'revealLearnset',
  'revealWeakPoints'
] as const

/** Lợi ích là kênh % của riêng loài đó. */
export const RESEARCH_PERCENT_TYPES = [
  'catchRatePercent',
  'expPercent',
  'shinyChancePercent'
] as const

export type ResearchRevealType = (typeof RESEARCH_REVEAL_TYPES)[number]
export type ResearchPercentType = (typeof RESEARCH_PERCENT_TYPES)[number]

/** Lợi ích có từ cấp `level` của loài đó. */
export type ResearchBenefit =
  | { level: number; type: ResearchRevealType }
  | { level: number; type: ResearchPercentType; percent: number }

/** Thưởng vật phẩm khi loài đạt cấp `level` (nhận bằng claimResearchReward). */
export interface ResearchLevelReward {
  level: number
  items: ItemReward[]
}

/** config.research (balance.json). */
export interface ResearchConfig {
  /** Điểm cần cho cấp 1, 2... (tăng ngặt); cấp cuối = Hoàn thành. */
  levelPoints: number[]
  tasks: ResearchTaskTemplate[]
  /** Nhiệm vụ riêng thêm cho từng loài (id loài thuộc Dex). */
  speciesTasks: Record<string, ResearchTask[]>
  benefits: ResearchBenefit[]
  levelRewards: ResearchLevelReward[]
}

/** Nghiên cứu một loài trong save: bộ đếm theo loại việc, cấp cao nhất đã nhận thưởng. */
export interface SpeciesResearch {
  /** Bỏ trống = 0. */
  counters: Partial<Record<ResearchTaskKind, number>>
  /** 0 = chưa nhận thưởng cấp nào. */
  claimedLevel: number
}

/** GameState.research: chỉ loài đã tương tác (theo id loài thuộc Dex). */
export type ResearchState = Record<string, SpeciesResearch>
