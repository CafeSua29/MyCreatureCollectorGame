// Nguồn % chỉ số (mục "Thứ tự tính chỉ số" ở stats-traits.md): mọi nguồn tăng / giảm chỉ số theo %
// cộng vào cùng một tổng ở bước áp trait của computeStats, không nhân giữa các nhóm. Mỗi nguồn
// đăng ký một mục ở đây để computeStats không phải sửa khi thêm nguồn, MonsterView liệt kê % theo
// từng nguồn và script mô phỏng báo tổng % theo nguồn. Thêm nguồn mới: thêm id vào
// STAT_PERCENT_SOURCE_IDS (model/stats.ts) + một mục ở STAT_PERCENT_SOURCES; nguồn đi qua hook trait
// thì gán loại nguồn hook vào HOOK_SOURCE_GROUPS.

import {
  NON_HP_STATS,
  STAT_NAMES,
  imprintPercent,
  isHumanShape,
  type GameData,
  type Monster,
  type PartialStats,
  type StatPercentSourceId
} from '../model'
import { ageStatPercent } from './lifespan'
import { polarityStatPercent } from './polarity'
import { soulLinkTier } from './soulLink'
import type { HookSourceKind } from './traitHooks'

/** Mọi chỉ số (kể cả hp) cùng một %; 0 thì không có mục nào. */
export function uniformPercent(percent: number): PartialStats {
  if (percent === 0) return {}
  return Object.fromEntries(STAT_NAMES.map((stat) => [stat, percent]))
}

export interface StatPercentSourceDef {
  /**
   * % chỉ số của nguồn không đi qua hook trait (tính cách, hiến tế, thân mật...); bỏ trống = nguồn
   * chỉ gồm hook trait (gom theo HOOK_SOURCE_GROUPS).
   */
  percent?(data: GameData, monster: Monster): PartialStats
}

/**
 * Mọi nguồn % chỉ số hiện có (cộng hưởng khế ước, giai đoạn tuổi tính thẳng từ quái, còn lại đi qua
 * hook trait).
 */
export const STAT_PERCENT_SOURCES: Readonly<Record<StatPercentSourceId, StatPercentSourceDef>> = {
  traits: {},
  statuses: {},
  minions: {},
  auras: {},
  equipment: {},
  // Mức thân mật (hook của mức, docs/rules/affinity.md).
  affinity: {},
  // Cộng hưởng đội và trận pháp (chỉ trong trận, docs/rules/team.md).
  synergy: {},
  formation: {},
  // Kỹ năng đồng hành của quái đầu đội (chỉ trong trận, docs/rules/partner-skills.md).
  partner: {},
  // Cộng hưởng khế ước (docs/rules/tamer.md): quái đã khế ước được phần gốc + phần theo cảnh giới
  // khế ước; bản mệnh thú × resonanceMultiplier (mục "Bản mệnh thú"); cộng mức tâm linh tương thông
  // (không nhân bản mệnh). Chưa khế ước: 0.
  contract: {
    percent: (data, monster) =>
      uniformPercent(
        monster.contractRealm === null
          ? 0
          : (data.config.tamer.contract.baseStatPercent +
              monster.contractRealm * data.config.tamer.statPercentPerRealm) *
              (monster.bond ? data.config.bond.resonanceMultiplier : 1) +
              (soulLinkTier(data, monster)?.statPercent ?? 0)
      )
  },
  // Giai đoạn tuổi (mục "Tuổi và thọ nguyên"): mọi chỉ số kể cả max HP.
  age: { percent: (data, monster) => uniformPercent(ageStatPercent(data, monster)) },
  // Dưỡng dục đã xong (docs/rules/imprinting.md): mọi chỉ số theo % dưỡng dục, vĩnh viễn.
  imprint: { percent: (data, monster) => uniformPercent(imprintStatPercent(data, monster)) },
  // Trọng thương sau độ kiếp thua (docs/rules/awakening.md): mọi chỉ số kể cả max HP.
  injury: {
    percent: (data, monster) =>
      uniformPercent(monster.injuryBattlesLeft > 0 ? data.config.awakening.injuryStatPercent : 0)
  },
  // Nhân hình (docs/rules/human-form.md): % theo chỉ số khi đang mang hình người.
  humanForm: {
    percent: (data, monster) =>
      isHumanShape(monster) ? { ...data.config.humanForm.statPercents } : {}
  },
  // Hiện nguyên hình (trong trận): mọi chỉ số trừ HP + base + mỗi tầng thức tỉnh.
  trueForm: { percent: trueFormStatPercent },
  // Tính cách (docs/rules/natures.md): +% chỉ số up, −% chỉ số down; trung tính không có mục nào.
  nature: { percent: natureStatPercent },
  // Hồn tinh (docs/rules/soul-levels.md): mỗi chỉ số + cấp × percentPerLevel, kể cả max HP.
  soulLevel: { percent: soulLevelStatPercent },
  // Điểm nỗ lực (docs/rules/effort-values.md): mỗi chỉ số + điểm × percentPerPoint, kể cả max HP.
  effort: { percent: effortStatPercent },
  // Thiên phú (hook của nút đã nâng, docs/rules/monster-talents.md).
  talent: {},
  // Cuồng bạo (chỉ trong trận, docs/rules/frenzy.md): công / đặc công qua bối cảnh trận.
  frenzy: {},
  // Thưởng sưu tập (chỉ trong trận, phe người chơi, docs/rules/dex.md): mọi chỉ số qua bối cảnh trận.
  collection: {},
  // Linh thực (chỉ trong trận, phe người chơi, docs/rules/cooking.md): % của món ăn qua bối cảnh trận.
  meal: {},
  // Âm / Dương (docs/rules/polarity.md): % theo cực (trait cực tính đi qua hook, nhóm `traits`).
  polarity: { percent: polarityStatPercent },
  // Hiến tế (docs/rules/sacrifice.md): mọi chỉ số kể cả max HP, stack × statPercentPerStack.
  sacrifice: { percent: (data, monster) => uniformPercent(sacrificeStatPercent(data, monster)) },
  // Hiệu ứng cấy ghép có hook % chỉ số (docs/rules/implant.md; đi qua hook, nguồn hook `implant`).
  implant: {}
}

/** % mọi chỉ số quái đang được cộng từ hiến tế (tuyến tính theo stack). */
export function sacrificeStatPercent(data: GameData, monster: Monster): number {
  return monster.sacrificeStacks * data.config.sacrifice.statPercentPerStack
}

/** % chỉ số của hồn tinh: bỏ chỉ số cấp 0. */
function soulLevelStatPercent(data: GameData, monster: Monster): PartialStats {
  const { percentPerLevel } = data.config.soulLevels
  const percents: PartialStats = {}
  for (const stat of STAT_NAMES) {
    const level = monster.soulLevels[stat]
    if (level > 0) percents[stat] = level * percentPerLevel
  }
  return percents
}

/** % chỉ số của điểm nỗ lực: bỏ chỉ số 0 điểm. */
export function effortStatPercent(data: GameData, monster: Monster): PartialStats {
  const { percentPerPoint } = data.config.effort
  const percents: PartialStats = {}
  for (const stat of STAT_NAMES) {
    const points = monster.effortValues[stat]
    if (points > 0) percents[stat] = points * percentPerPoint
  }
  return percents
}

/** % chỉ số của tính cách quái (không bao giờ đổi HP: kiểm tra dữ liệu cấm up / down là hp). */
function natureStatPercent(data: GameData, monster: Monster): PartialStats {
  const { up, down } = data.natures[monster.natureId]
  if (up === undefined || down === undefined) return {}
  const { percent } = data.config.nature
  return { [up]: percent, [down]: -percent }
}

/** % mọi chỉ số trừ HP khi đang Hiện nguyên hình (docs/rules/human-form.md). */
function trueFormStatPercent(data: GameData, monster: Monster): PartialStats {
  if (monster.battleTransform?.kind !== 'trueForm') return {}
  const { statPercentBase, statPercentPerAwakening } = data.config.humanForm.trueForm
  const percent = statPercentBase + statPercentPerAwakening * monster.awakening
  return Object.fromEntries(NON_HP_STATS.map((stat) => [stat, percent]))
}

/** Buff % mọi chỉ số của dưỡng dục: chỉ có khi đã hết thời gian dưỡng dục. */
function imprintStatPercent(data: GameData, monster: Monster): number {
  const { imprint } = monster
  if (imprint?.phase !== 'done') return 0
  return (data.config.imprint.maxStatPercent * imprintPercent(imprint)) / 100
}

/** Hook trait thuộc nguồn % nào, theo loại nguồn hook (thiếu loại thì TypeScript báo lỗi). */
export const HOOK_SOURCE_GROUPS: Readonly<Record<HookSourceKind, StatPercentSourceId>> = {
  trait: 'traits',
  race: 'traits',
  bloodline: 'traits',
  polarity: 'traits',
  ability: 'traits',
  gained: 'traits',
  status: 'statuses',
  minion: 'minions',
  aura: 'auras',
  equipment: 'equipment',
  held: 'equipment',
  affinity: 'affinity',
  talent: 'talent',
  synergy: 'synergy',
  formation: 'formation',
  partner: 'partner',
  frenzy: 'frenzy',
  collection: 'collection',
  meal: 'meal',
  implant: 'implant'
}
