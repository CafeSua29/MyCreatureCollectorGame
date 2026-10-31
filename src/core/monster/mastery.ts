// Độ thuần thục skill (docs/rules/skill-mastery.md): exp tích lũy theo lần dùng trong trận, cấp
// không trần tính ngược từ tổng exp; hiệu lực (power, accuracy, mốc) tính lại từ cấp, không lưu.

import {
  BIG_ZERO,
  asObject,
  checkBig,
  checkInteger,
  levelEffectScale,
  type BigValue,
  type Decimal,
  curveExpForLevel,
  curveLevelFromExp,
  type LevelCurve
} from '../shared'
import {
  isBattleOnlyMove,
  mergePartnerOf,
  type GameData,
  type MasteryMilestone,
  type Monster,
  type Skill,
  type SkillMastery
} from '../model'

/** Accuracy gốc tối đa sau khi cộng thuần thục (mục "Hiệu lực"). */
const MAX_BASE_ACCURACY = 100

/**
 * Thuần thục của skill trên quái; chưa có mục là cấp 1, exp 0. Thực thể hợp thể dùng thuần thục của
 * quái phụ cho skill chỉ quái phụ biết (docs/rules/battle-merge.md).
 */
export function masteryOf(monster: Monster, skillId: string): SkillMastery {
  if (Object.hasOwn(monster.skillMastery, skillId)) return monster.skillMastery[skillId]
  const partner = mergePartnerOf(monster)
  if (partner && !monster.skillIds.includes(skillId)) return masteryOf(partner, skillId)
  return { level: 1, exp: BIG_ZERO }
}

/**
 * Tổng exp để đạt cấp `level`: ⌈baseExp × (level − 1)^expPower⌉ (cấp 1 = 0). Đa thức như EXP của
 * quái (quy tắc 7), nên tính ngược được ra cấp (masteryLevelFromExp) mà không lặp từng cấp.
 */
export function masteryExpForLevel(data: GameData, level: number): Decimal {
  return curveExpForLevel(masteryCurve(data), level)
}

const masteryCurve = (data: GameData): LevelCurve => ({
  base: data.config.mastery.baseExp,
  power: data.config.mastery.expPower
})

/**
 * Cấp cao nhất có masteryExpForLevel(cấp) ≤ exp, tối thiểu 1. Cấp giữ kiểu number như level quái
 * (docs/rules/big-numbers.md): vượt số nguyên an toàn thì là dữ liệu hỏng, ném DataError.
 */
export function masteryLevelFromExp(data: GameData, exp: Decimal): number {
  return curveLevelFromExp(masteryCurve(data), exp, 'thuần thục')
}

/**
 * Cộng exp thuần thục cho một skill (exp là tổng tích lũy); trả về skillMastery mới, cấp trước và
 * sau. Cấp tính ngược từ tổng exp nên lượng exp lớn tùy ý vẫn tính một lần; cấp không bao giờ hạ
 * (đổi config sau này không làm tụt cấp đã đạt).
 */
export function addMasteryExp(
  data: GameData,
  monster: Monster,
  { skillId, amount }: { skillId: string; amount: BigValue }
): { skillMastery: Record<string, SkillMastery>; levelBefore: number; level: number } {
  const before = masteryOf(monster, skillId)
  const exp = before.exp.plus(amount)
  // Đa số lần cộng chưa đủ lên cấp: so một mốc thay vì tính căn (pow của Decimal tốn).
  const level = exp.lt(masteryExpForLevel(data, before.level + 1))
    ? before.level
    : Math.max(before.level, masteryLevelFromExp(data, exp))
  return {
    skillMastery: { ...monster.skillMastery, [skillId]: { level, exp } },
    levelBefore: before.level,
    level
  }
}

/** Hiệu lực thuần thục của một cấp. */
export interface MasteryBonus {
  /** Hệ số nhân power. */
  powerMultiplier: number
  /** Accuracy cộng thêm (accuracy gốc kẹp tối đa 100). */
  accuracyBonus: number
  /** Hệ số nhân tỉ lệ hiệu ứng phụ. */
  secondaryChanceMultiplier: number
  /** Số đòn tối thiểu cộng thêm của skill đánh nhiều lần. */
  minHitsBonus: number
}

const NO_BONUS: MasteryBonus = {
  powerMultiplier: 1,
  accuracyBonus: 0,
  secondaryChanceMultiplier: 1,
  minHitsBonus: 0
}

/** Hiệu lực ở cấp `level`: power và accuracy theo cấp, thưởng các mốc đã đạt cộng dồn. */
export function masteryBonusAt(data: GameData, level: number): MasteryBonus {
  if (level <= 1) return NO_BONUS
  const { powerStep, accuracyPerLevel, milestones } = data.config.mastery
  let chancePercent = 0
  let minHitsBonus = 0
  for (const milestone of milestones) {
    if (milestone.level > level) continue
    chancePercent += milestone.secondaryChancePercent ?? 0
    minHitsBonus += milestone.minHitsBonus ?? 0
  }
  return {
    powerMultiplier: levelEffectScale(powerStep, level),
    accuracyBonus: accuracyPerLevel * (level - 1),
    secondaryChanceMultiplier: 1 + chancePercent / 100,
    minHitsBonus
  }
}

/**
 * Hiệu lực thuần thục khi quái dùng skill này. Chiêu Max / Z-Move không áp (skill thật khác skill gốc); hợp
 * kích kỹ không có mục thuần thục (không nằm trong skill của quái) nên cũng không áp.
 */
export function skillMasteryBonus(data: GameData, monster: Monster, skill: Skill): MasteryBonus {
  if (isBattleOnlyMove(skill)) return NO_BONUS
  return masteryBonusAt(data, masteryOf(monster, skill.id).level)
}

/** Accuracy gốc của skill sau khi cộng thuần thục, kẹp 100. */
export function masteredAccuracy(base: number, bonus: MasteryBonus): number {
  return Math.min(MAX_BASE_ACCURACY, base + bonus.accuracyBonus)
}

/** Mốc kế tiếp chưa đạt (null nếu đã qua mọi mốc). */
export function nextMasteryMilestone(data: GameData, level: number): MasteryMilestone | null {
  return data.config.mastery.milestones.find((milestone) => milestone.level > level) ?? null
}

/** Kiểm tra skillMastery của quái trong save: object, id skill tồn tại, cấp nguyên ≥ 1, exp ≥ 0. */
export function validateSkillMastery(data: GameData, value: unknown, where: string): string[] {
  const record = asObject(value)
  if (!record) return [`${where} phải là object`]
  const issues: string[] = []
  for (const [skillId, raw] of Object.entries(record)) {
    const at = `${where}.${skillId}`
    if (!Object.hasOwn(data.skills, skillId)) issues.push(`${at}: skill không tồn tại`)
    const entry = asObject(raw)
    if (!entry) {
      issues.push(`${at} phải là object`)
      continue
    }
    for (const key of Object.keys(entry)) {
      if (key !== 'level' && key !== 'exp') issues.push(`${at}: trường lạ "${key}"`)
    }
    issues.push(...checkInteger(entry.level, `${at}.level`, 1))
    issues.push(...checkBig(entry.exp, `${at}.exp`, 0))
  }
  return issues
}
