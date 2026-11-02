// Tông môn (docs/rules/sects.md): dữ liệu tông, chức vị, tên NPC, state của người chơi trong tông
// và đồng môn NPC.

import type { ItemAmount } from './alchemy'
import type { TamerBonusDef } from './tamerTalents'

/**
 * Một món ở Tàng Bảo Các: vật phẩm gộp chồng hoặc sách kỹ năng (Bí kíp, `reusable` = Chân kinh);
 * giá cống hiến mỗi cái, chức vị tối thiểu để mua.
 */
export type SectShopEntry = { cost: number; minRank: number } & (
  { itemId: string } | { skillId: string; reusable: boolean }
)

/**
 * Một tông môn (src/data/sects.json; tên ở i18n): yêu cầu cảnh giới để gia nhập, buff theo chức vị
 * (kênh thưởng ngự thú sư × (chức vị + 1)), lớp NPC của đồng môn (đội theo hệ của lớp), Tàng Bảo
 * Các, tông đối địch (tông chiến).
 */
export interface SectDef {
  id: string
  minRealm: number
  rankBonuses: TamerBonusDef[]
  trainerClassIds: string[]
  shop: SectShopEntry[]
  rivalSectIds: string[]
}

/** Tên chức vị theo thứ tự (src/data/sectRanks.json; tên ở i18n); vượt tên cuối thì "tên cuối + n". */
export interface SectRankDef {
  id: string
}

/** Tên NPC dùng chung (src/data/npcNames.json; tên ở i18n): core chỉ giữ id. */
export interface NpcNameDef {
  id: string
}

/** Một vòng tông chiến: level NPC cộng thêm, hệ số tiền, cống hiến khi thắng vòng. */
export interface SectWarRound {
  levelOffset: number
  rewardMultiplier: number
  contribution: number
}

export interface SectConfig {
  /** Rời tông xong phải chờ ngần này ngày mới gia nhập lại (tông nào cũng vậy). */
  rejoinCooldownDays: number
  /** Cống hiến tổng cần cho chức vị r = rankBase × r^rankPower (r = 0 cần 0). */
  rankBase: number
  rankPower: number
  /** Đồng môn NPC: số người lúc gia nhập (kể cả tông chủ), trọng số chức vị ban đầu (theo chỉ số). */
  memberCount: number
  memberRankWeights: number[]
  /** Mỗi ngày mỗi đồng môn (trừ tông chủ) + cống hiến nguyên trong [min, max] × (chức vị + 1). */
  memberDailyContribution: { min: number; max: number }
  /** Tông chủ: chức vị = chức vị cao nhất của đồng môn + masterRankLead. */
  masterRankLead: number
  /** Nhiệm vụ tông: số nhiệm vụ, làm mới mỗi refreshDays ngày, cống hiến = contributionPerCount × số lần cần. */
  missions: {
    count: number
    refreshDays: number
    contributionPerCount: number
    /** % nhận thêm 1 điểm thiên phú ngự thú sư khi nộp nhiệm vụ. */
    talentPointChance: number
  }
  /** Luận võ với đồng môn: số trận mỗi ngày, level + levelPerRank × chức vị đối thủ, cống hiến × (chức vị + 1). */
  duel: { perDay: number; levelPerRank: number; contribution: number }
  /**
   * Thi thăng chức: đủ cống hiến tổng thì đấu giám khảo (đồng môn chức vị cao nhất), level + levelOffset +
   * levelPerRank × chức vị mới; thắng + talentPoints điểm thiên phú ngự thú sư.
   */
  promotion: { levelOffset: number; levelPerRank: number; talentPoints: number }
  /** Tông chiến: mỗi everyDays ngày một kỳ, các vòng, thưởng vô địch. */
  war: {
    everyDays: number
    rounds: SectWarRound[]
    championContribution: number
    championTalentPoints: number
    championRewards: ItemAmount[]
  }
}

/** Đồng môn NPC: tên, lớp NPC (đội), chức vị, cống hiến tổng; tông chủ đứng đầu, không lên chức. */
export interface SectMember {
  id: string
  nameId: string
  classId: string
  rank: number
  contribution: number
  isMaster: boolean
}

/** Tông chiến đang dự (round khác null), kỳ đã đăng ký gần nhất, tông đối địch của kỳ. */
export interface SectWarState {
  lastPeriod: number
  round: number | null
  rivalSectId: string | null
}

/**
 * Người chơi trong tông môn (GameState.sect). `sectId` null = chưa gia nhập; khi đó cống hiến, chức
 * vị, đồng môn rỗng. `leftDay` giữ cả khi chưa gia nhập (thời gian chờ).
 */
export interface SectState {
  sectId: string | null
  /** Cống hiến còn tiêu được ở Tàng Bảo Các. */
  contribution: number
  /** Cống hiến tổng từ lúc gia nhập (xét thăng chức; không giảm khi tiêu). */
  totalContribution: number
  rank: number
  joinedDay: number | null
  leftDay: number | null
  /** Ngày làm mới nhiệm vụ tông gần nhất. */
  missionDay: number
  members: SectMember[]
  nextMemberId: number
  /** Số trận luận võ đã đánh trong ngày `day`. */
  duels: { day: number; count: number }
  war: SectWarState
}
