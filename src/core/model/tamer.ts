// Ngự thú sư và khế ước (docs/rules/tamer.md): state của ngự thú sư, kỹ năng ngự thú sư trong
// trận, tên cảnh giới.

import type { Decimal } from '../shared'
import type { EffectDef } from './content'

/** Ngự thú sư của người chơi (được lưu vào save). */
export interface TamerState {
  /** Cảnh giới hiện tại, nguyên ≥ 0, không trần; chỉ tăng bằng đột phá. */
  realm: number
  /** EXP đang có (≥ 0); đột phá thành công trừ phần cần, dư giữ lại. */
  exp: Decimal
  /** Ngày kết bản mệnh gần nhất (docs/rules/tamer.md mục "Bản mệnh thú"); null = chưa từng kết. */
  bondDay: number | null
  /** Đạo thương tới hết ngày này (bản mệnh chết hẳn); null = không. */
  woundUntilDay: number | null
}

/** Bản mệnh thú (balance.json khóa `bond`; docs/rules/tamer.md mục "Bản mệnh thú"). */
export interface BondConfig {
  /** Thân mật tối thiểu để kết bản mệnh. */
  minAffinity: number
  /** Cộng hưởng khế ước của bản mệnh × số này. */
  resonanceMultiplier: number
  /** Thọ nguyên của bản mệnh × số này. */
  lifespanMultiplier: number
  /** Bản mệnh còn sống trên sân: kỹ năng ngự thú sư tốn % linh lực này (làm tròn lên). */
  manaCostPercent: number
  /** Đổi bản mệnh: tiền rebindCostPerRealm × (cảnh giới + 1), bản mệnh cũ − rebindAffinityLoss. */
  rebindCostPerRealm: number
  rebindAffinityLoss: number
  /** Kết bản mệnh lại sau ít nhất số ngày này kể từ lần kết trước. */
  rebindCooldownDays: number
  /** Đạo thương: số ngày (tính cả ngày bản mệnh chết), linh lực tối đa trong trận còn % này. */
  woundDays: number
  woundManaPercent: number
}

/**
 * Mục tiêu của kỹ năng ngự thú sư, quyết định registry của `effects`:
 * - `ally`: một quái trong đội (kể cả dự bị, đã gục), hiệu ứng vật phẩm (ITEM_EFFECTS);
 * - `allyOnField`: một quái ta còn sống trên sân, hiệu ứng skill (SKILL_EFFECTS) như chính nó dùng;
 * - `field`: không chọn mục tiêu, hiệu ứng skill loại perSkill (theo phe, cả phe);
 * - `wildFoe`: Thị Uy (docs/rules/recruit.md) lên một quái hoang trên sân, không có `effects` (số ở
 *   config.recruit.intimidate);
 * - `merge`: Song thú hợp thể (docs/rules/battle-merge.md) hai quái ta trên sân, không có `effects`
 *   (số ở config.transform.merge).
 */
/**
 * Khế ước (docs/rules/tamer.md mục "Khế ước"): bước riêng sau khi có quái, không gắn với cách có
 * quái. Tỉ lệ % = kẹp(base − levelPenalty × level / giới hạn level − rankPenalty × thứ hạng phẩm cấp
 * loài − bossPenalty (quái mang hệ số boss) + affinityBonus × thân mật / thân mật tối đa, min, max).
 */
export interface ContractConfig {
  /** Giới hạn level: chỉ khế ước quái level ≤ levelBase + levelPerRealm × cảnh giới. */
  levelBase: number
  levelPerRealm: number
  /** Số quái khế ước tối đa = slotsBase + slotsPerRealm × cảnh giới. */
  slotsBase: number
  slotsPerRealm: number
  /** Cộng hưởng khi đã khế ước (thêm vào phần theo cảnh giới khế ước): % mọi chỉ số, % thọ nguyên. */
  baseStatPercent: number
  baseLifespanPercent: number
  chance: {
    base: number
    levelPenalty: number
    rankPenalty: number
    bossPenalty: number
    affinityBonus: number
    min: number
    max: number
  }
  /** Thất bại (phản phệ): quái mất thân mật, ngự thú sư bị thương N ngày, quái có thể bỏ trốn. */
  failure: {
    affinityLoss: number
    backlashDays: number
    /** % bỏ trốn = escapeChance × (1 − thân mật / thân mật tối đa). */
    escapeChance: number
  }
  /** Giải trừ khế ước: quái mất ngần này thân mật, ngự thú sư bị thương ngần này ngày (phản phệ). */
  dissolveAffinityLoss: number
  dissolveBacklashDays: number
  /**
   * Tâm linh tương thông: mức theo số ngày đã khế ước và thân mật (tăng dần theo `days`); mức cao nhất
   * đạt được: + % mọi chỉ số, giảm % linh lực kỹ năng ngự thú sư khi quái còn sống trên sân.
   */
  soulLinkTiers: SoulLinkTier[]
  /**
   * Quái chưa khế ước không nghe lệnh skill (bỏ lượt): % = min(max, base + levelScale × min(r, 1) +
   * overLimitScale × max(0, r − 1)) × (1 − affinityReduction × thân mật / tối đa), r = level / giới
   * hạn level khế ước của cảnh giới hiện tại.
   */
  disobey: {
    base: number
    levelScale: number
    overLimitScale: number
    max: number
    affinityReduction: number
  }
}

/** Một mức tâm linh tương thông (id để UI tra tên). */
export interface SoulLinkTier {
  id: string
  days: number
  minAffinity: number
  statPercent: number
  manaCostReduction: number
}

export const TAMER_SKILL_TARGETS = ['ally', 'allyOnField', 'field', 'wildFoe', 'merge'] as const

export type TamerSkillTarget = (typeof TAMER_SKILL_TARGETS)[number]

/** Phần chung của kỹ năng ngự thú sư (src/data/tamerSkills.json); tên ở i18n. */
interface TamerSkillBase {
  id: string
  /** Mở khi cảnh giới ≥ số này. */
  unlockRealm: number
  /** Linh lực tốn mỗi lần dùng (≥ 0). */
  manaCost: number
  /** Số lượt phải chờ sau khi dùng (0 = dùng lại ngay lượt sau). */
  cooldown: number
  /** Số lần tối đa mỗi trận; bỏ trống = không giới hạn. */
  usesPerBattle?: number
}

/** Kỹ năng chạy danh sách hiệu ứng (vật phẩm hoặc skill, theo mục tiêu). */
export interface EffectTamerSkill extends TamerSkillBase {
  target: Exclude<TamerSkillTarget, 'wildFoe' | 'merge'>
  effects: EffectDef[]
}

/** Thị Uy (docs/rules/recruit.md): chỉ lượt đầu trận quái hoang thường. */
export interface IntimidateTamerSkill extends TamerSkillBase {
  target: 'wildFoe'
}

/** Song thú hợp thể (docs/rules/battle-merge.md): hai quái ta trên sân, quái ô đầu là quái chính. */
export interface MergeTamerSkill extends TamerSkillBase {
  target: 'merge'
}

export type TamerSkill = EffectTamerSkill | IntimidateTamerSkill | MergeTamerSkill

/** Tên một cảnh giới (src/data/tamerRealms.json, theo thứ tự cảnh giới 0, 1, 2...); tên ở i18n. */
export interface TamerRealmDef {
  id: string
}

/** Ngự thú sư của một phe trong trận: linh lực, hồi chiêu, số lần đã dùng. */
export interface BattleTamer {
  /** Cảnh giới lúc vào trận (mở kỹ năng, linh lực tối đa). */
  realm: number
  /** Linh lực còn lại, nguyên ≥ 0. */
  mana: number
  /** Số lượt còn chờ theo id kỹ năng (mỗi số ≥ 1; hết chờ thì xóa key). */
  cooldowns: Record<string, number>
  /** Số lần đã dùng trong trận theo id kỹ năng (mỗi số ≥ 1). */
  uses: Record<string, number>
  /** Kỹ năng được dùng (ngự thú sư NPC, docs/rules/trainers.md); null = mọi kỹ năng đã mở. */
  skillIds: string[] | null
}

/** Lệnh ngự thú sư của một lượt (tối đa một, không chiếm lượt quái). */
export interface TamerCommand {
  skillId: string
  /**
   * Id quái mục tiêu (bắt buộc với `ally` / `allyOnField` / `wildFoe`, không ghi với `field` /
   * `merge`).
   */
  targetId?: string
}
