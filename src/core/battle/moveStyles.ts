// Thế mạnh / thế nhanh (docs/rules/move-styles.md): số của thế (chung + ghi đè theo skill), điều
// kiện dùng (skill có `styles`, đủ thuần thục), skill khi dùng thế (priority, hiệu ứng qua hook
// `styled` của registry hiệu ứng skill), hệ số power trong công thức sát thương, số lượt trạng thái
// cộng thêm, tốc độ xếp thứ tự ở lượt sau. Dùng chung cho đánh thật, xếp thứ tự và AI.

import { masteryOf } from '../monster'
import { ALLY_TARGETS, SKILL_EFFECTS, type EffectStyleMod } from '../registries'
import {
  isBattleOnlyMove,
  MOVE_STYLES,
  type GameData,
  type Monster,
  type MoveStyle,
  type MoveStyleNumbers,
  type Skill
} from '../model'
import type { Draft } from './draft'

/** Số của thế cho skill: số chung, ghi đè bởi số riêng của skill (nếu có). */
export function styleNumbers(data: GameData, skill: Skill, style: MoveStyle): MoveStyleNumbers {
  const base = data.config.moveStyles[style]
  const overrides = typeof skill.styles === 'object' ? skill.styles[style] : undefined
  return overrides ? { ...base, ...overrides } : base
}

/** Thế có tác dụng với skill không (skill không có `styles`, kể cả chiêu Max: không). */
const styleApplies = (skill: Skill, style: MoveStyle | undefined): style is MoveStyle =>
  style !== undefined && skill.styles !== undefined

/**
 * Lý do quái chưa dùng được thế của skill: skill không có thế (`noStyles`), chưa đủ cấp thuần thục
 * (`locked`); null = dùng được.
 */
export function styleBlockReason(
  data: GameData,
  monster: Monster,
  skill: Skill
): 'noStyles' | 'locked' | null {
  if (skill.styles === undefined || isBattleOnlyMove(skill)) return 'noStyles'
  const need = data.config.moveStyles.unlockMastery
  return masteryOf(monster, skill.id).level >= need ? null : 'locked'
}

/** Các thế quái dùng được với skill (AI chấm từng thế như một ứng viên). */
export const usableStyles = (data: GameData, monster: Monster, skill: Skill): MoveStyle[] =>
  styleBlockReason(data, monster, skill) === null ? [...MOVE_STYLES] : []

/**
 * Skill khi dùng thế: priority cộng theo thế; hiệu ứng đổi theo hook `styled` (tỉ lệ hiệu ứng phụ
 * chỉ với skill gây sát thương, bậc +N). Power nhân ở công thức sát thương (stylePowerMultiplier),
 * số lượt trạng thái ở lúc gây (styleStatusTurnsBonus). Không có thế thì giữ nguyên.
 */
export function styledSkill(data: GameData, skill: Skill, style: MoveStyle | undefined): Skill {
  if (!styleApplies(skill, style)) return skill
  const numbers = styleNumbers(data, skill, style)
  const mod: EffectStyleMod = {
    // Skill trạng thái: thế nhanh chỉ đổi priority / tốc độ, thế mạnh chỉ tăng bậc và số lượt.
    chanceShift: skill.power > 0 ? numbers.secondaryChanceShift : 0,
    stageBonus: numbers.stageBonus,
    targetsAlly: ALLY_TARGETS.includes(skill.target)
  }
  return {
    ...skill,
    priority: skill.priority + numbers.priorityShift,
    effects: skill.effects.map((effect) => {
      const styled = SKILL_EFFECTS[effect.type].styled
      return styled ? { ...effect, params: styled(effect.params, mod) } : effect
    })
  }
}

/** Hệ số power của thế trong công thức sát thương (1 khi không có thế). */
export const stylePowerMultiplier = (
  data: GameData,
  skill: Skill,
  style: MoveStyle | undefined
): number => (styleApplies(skill, style) ? styleNumbers(data, skill, style).powerMultiplier : 1)

/** Số lượt cộng thêm cho trạng thái do skill gây (chỉ skill trạng thái; 0 khi không có thế). */
export const styleStatusTurnsBonus = (
  data: GameData,
  skill: Skill,
  style: MoveStyle | undefined
): number =>
  styleApplies(skill, style) && skill.category === 'status'
    ? styleNumbers(data, skill, style).statusTurnsBonus
    : 0

/** Ghi thế quái vừa dùng: lượt sau tốc độ xếp thứ tự theo thế (mất khi rời sân). */
export function markStyleUsed(d: Draft, user: Monster, skill: Skill, style: MoveStyle): void {
  const volatile = d.battle.volatiles[user.id]
  if (volatile) volatile.styleSpeed = { turn: d.battle.turn + 1, skillId: skill.id, style }
}

/** Hệ số tốc độ xếp thứ tự của quái ở lượt hiện tại theo thế đã dùng ở lượt trước (1 khi không có). */
export function styleSpeedMultiplier(data: GameData, d: Draft, monster: Monster): number {
  const styleSpeed = d.battle.volatiles[monster.id]?.styleSpeed
  if (!styleSpeed || styleSpeed.turn !== d.battle.turn) return 1
  const { skillId, style } = styleSpeed
  return styleNumbers(data, data.skills[skillId], style).nextTurnSpeedMultiplier
}
