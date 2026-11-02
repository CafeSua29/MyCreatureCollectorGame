// Tông môn (docs/rules/sects.md): ngưỡng cống hiến của chức vị, tên chức vị, buff theo chức vị (kênh
// thưởng ngự thú sư). Hàm thuần theo dữ liệu, dùng cho action, kênh thưởng, UI và mô phỏng.

import type { GameData, SectState, TamerBonusDef } from '../model'

/** Cống hiến tổng cần cho chức vị `rank` = rankBase × rank^rankPower (kẹp MAX_SAFE_INTEGER). */
export function sectRankThreshold(data: GameData, rank: number): number {
  const { rankBase, rankPower } = data.config.sects
  if (rank <= 0) return 0
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(rankBase * rank ** rankPower))
}

/** Chức vị cao nhất có ngưỡng ≤ cống hiến tổng (đồng môn NPC lên chức theo cống hiến). */
export function sectRankForContribution(data: GameData, contribution: number): number {
  const { rankBase, rankPower } = data.config.sects
  if (contribution <= 0 || rankBase <= 0) return 0
  let rank = Math.max(0, Math.floor((contribution / rankBase) ** (1 / rankPower)))
  // Chỉnh lệch làm tròn số thực: rank là số lớn nhất có ngưỡng ≤ cống hiến.
  while (rank > 0 && sectRankThreshold(data, rank) > contribution) rank--
  while (sectRankThreshold(data, rank + 1) <= contribution && rank < Number.MAX_SAFE_INTEGER) rank++
  return rank
}

/**
 * Tên chức vị: id trong sectRanks.json và phần "+ n" khi vượt tên cuối (như tên cảnh giới). UI ghép
 * chữ theo ngôn ngữ (contentName 'sectRanks').
 */
export function sectRankTitle(data: GameData, rank: number): { rankId: string; plus: number } {
  const ids = Object.keys(data.sectRanks)
  const last = ids.length - 1
  return rank <= last ? { rankId: ids[rank], plus: 0 } : { rankId: ids[last], plus: rank - last }
}

/** Buff của tông đang ở: hiệu ứng của tông kèm hệ số = chức vị + 1; chưa gia nhập thì rỗng. */
export function sectBonusScales(
  data: GameData,
  sect: Pick<SectState, 'sectId' | 'rank'>
): { effects: readonly TamerBonusDef[]; scale: number } | null {
  if (sect.sectId === null || !Object.hasOwn(data.sects, sect.sectId)) return null
  return { effects: data.sects[sect.sectId].rankBonuses, scale: sect.rank + 1 }
}

/** + cống hiến (tiêu được và tổng), kẹp MAX_SAFE_INTEGER; số ≤ 0 thì giữ nguyên. */
export function addSectContribution(sect: SectState, amount: number): SectState {
  if (amount <= 0) return sect
  const add = (value: number): number => Math.min(Number.MAX_SAFE_INTEGER, value + amount)
  return {
    ...sect,
    contribution: add(sect.contribution),
    totalContribution: add(sect.totalContribution)
  }
}

/** + điểm thiên phú ngự thú sư thưởng (tông môn), kẹp MAX_SAFE_INTEGER. */
export function addBonusTalentPoints<T extends { bonusTalentPoints: number }>(
  tamer: T,
  amount: number
): T {
  if (amount <= 0) return tamer
  return {
    ...tamer,
    bonusTalentPoints: Math.min(Number.MAX_SAFE_INTEGER, tamer.bonusTalentPoints + amount)
  }
}
