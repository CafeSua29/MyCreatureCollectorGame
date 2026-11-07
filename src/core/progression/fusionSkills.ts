// Kế thừa skill khi fuse (mục Fusing, như hợp thể quỷ của Shin Megami Tensei): người chơi chọn tối
// đa config.fusion.inheritSkills skill đang biết của quái phụ để quái gốc giữ lại. Chỉ áp khi fuse
// thành công. Skill kế thừa ghi vào extraSkillIds (dùng chung với sách kỹ năng) để NPC học lại.

import { ActionError, malformedAction } from '../shared'
import { isBookableSkill } from '../inventory'
import {
  assertSlotsFit,
  detachOrphanStickers,
  lockedSkillIds,
  masteryExpForLevel,
  masteryOf,
  skillCapacity,
  withExtraSkill
} from '../monster'
import type { GameData, Monster, SkillMastery } from '../model'

/** Skill chọn kế thừa và skill quên để học ngay khi quái gốc đủ ô. */
export interface SkillInheritance {
  inheritSkillIds: readonly string[]
  /** Quên lần lượt cho các skill kế thừa không còn ô; thiếu thì skill còn lại vào chờ học. */
  forgetSkillIds: readonly string[]
}

export const NO_SKILL_INHERITANCE: SkillInheritance = { inheritSkillIds: [], forgetSkillIds: [] }

/**
 * Skill của quái phụ quái gốc kế thừa được: đang biết, quái gốc chưa biết, có sách (cùng luật
 * isBookableSkill: chiêu Max / G-Max / Max Guard và hợp kích kỹ không kế thừa), không ở ô nhân hình
 * đang khóa (quái phụ không ở nhân hình; docs/rules/human-form.md).
 */
export function inheritableSkillIds(data: GameData, base: Monster, sub: Monster): string[] {
  const locked = lockedSkillIds(data, sub)
  return sub.skillIds.filter(
    (skillId) =>
      !base.skillIds.includes(skillId) &&
      !locked.includes(skillId) &&
      isBookableSkill(data, data.skills[skillId])
  )
}

/** Mảng id chuỗi không trùng; bỏ trống = rỗng. */
function parseIdList(value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    throw malformedAction(`${field} phải là mảng id`)
  }
  if (new Set(value).size !== value.length) throw malformedAction(`${field} bị trùng`)
  return value
}

/** Đọc và kiểm tra lựa chọn kế thừa của lệnh fuse (trước khi tung, lỗi thì state giữ nguyên). */
export function parseSkillInheritance(
  data: GameData,
  base: Monster,
  sub: Monster,
  order: { inheritSkillIds?: unknown; forgetSkillIds?: unknown }
): SkillInheritance {
  const inheritSkillIds = parseIdList(order.inheritSkillIds, 'inheritSkillIds')
  const forgetSkillIds = parseIdList(order.forgetSkillIds, 'forgetSkillIds')
  const max = data.config.fusion.inheritSkills
  if (inheritSkillIds.length > max) throw new ActionError('tooManyInheritedSkills', { max })
  const allowed = inheritableSkillIds(data, base, sub)
  for (const skillId of inheritSkillIds) {
    if (allowed.includes(skillId)) continue
    const reason = !sub.skillIds.includes(skillId)
      ? 'notKnownBySub'
      : base.skillIds.includes(skillId)
        ? 'known'
        : 'notInheritable'
    throw new ActionError('cannotInheritSkill', { skillId, reason })
  }
  for (const skillId of forgetSkillIds) {
    if (!base.skillIds.includes(skillId)) {
      throw new ActionError('skillNotKnown', { monsterId: base.id, skillId })
    }
  }
  const freeSlots = Math.max(0, skillCapacity(data, base) - base.skillIds.length)
  if (forgetSkillIds.length > Math.max(0, inheritSkillIds.length - freeSlots)) {
    throw new ActionError('skillSlotFree')
  }
  return { inheritSkillIds, forgetSkillIds }
}

/**
 * Thuần thục chuyển theo ½ cấp của quái phụ (làm tròn xuống, tối thiểu 1); quái gốc đã có cấp
 * cao hơn (từng biết rồi quên) thì giữ của mình. Exp nâng lên đủ cấp mới để cấp khớp tổng exp.
 */
function inheritedMastery(
  data: GameData,
  base: Monster,
  sub: Monster,
  skillId: string
): SkillMastery | null {
  const level = Math.max(1, Math.floor(masteryOf(sub, skillId).level / 2))
  const own = masteryOf(base, skillId)
  if (level <= own.level) return null
  const needed = masteryExpForLevel(data, level)
  return { level, exp: own.exp.gt(needed) ? own.exp : needed }
}

/**
 * Áp kế thừa lên quái gốc sau fuse: còn ô thì học ngay, hết ô thì thay lần lượt skill trong
 * forgetSkillIds, còn lại vào skill chờ học. Skill đang chờ học mà được kế thừa thì rời danh sách
 * chờ khi học ngay. Lựa chọn đã qua parseSkillInheritance.
 */
export function applySkillInheritance(
  data: GameData,
  fused: Monster,
  sub: Monster,
  { inheritSkillIds, forgetSkillIds }: SkillInheritance
): Monster {
  const skillIds = [...fused.skillIds]
  let pendingSkillIds = [...fused.pendingSkillIds]
  const skillMastery = { ...fused.skillMastery }
  const forgets = [...forgetSkillIds]
  let result = fused
  for (const skillId of inheritSkillIds) {
    if (skillIds.length < skillCapacity(data, fused)) skillIds.push(skillId)
    else {
      const forgetSkillId = forgets.shift()
      if (forgetSkillId === undefined) {
        if (!pendingSkillIds.includes(skillId)) pendingSkillIds.push(skillId)
        continue
      }
      skillIds[skillIds.indexOf(forgetSkillId)] = skillId
    }
    pendingSkillIds = pendingSkillIds.filter((id) => id !== skillId)
  }
  for (const skillId of inheritSkillIds) {
    const mastery = inheritedMastery(data, fused, sub, skillId)
    if (mastery) skillMastery[skillId] = mastery
    result = withExtraSkill(result, skillId)
  }
  return { ...result, skillIds, pendingSkillIds, skillMastery }
}

/**
 * Skill quên khi kế thừa mang sticker Extra Slots mà quái gốc còn đủ skill: ném stickerSlotInUse
 * trước khi tung (docs/rules/skill-stickers.md).
 */
export function assertInheritanceKeepsSlots(
  data: GameData,
  base: Monster,
  sub: Monster,
  inheritance: SkillInheritance
): void {
  const learned = applySkillInheritance(data, base, sub, inheritance)
  const detached = detachOrphanStickers(learned).monster
  for (const skillId of inheritance.forgetSkillIds) assertSlotsFit(data, detached, skillId)
}
