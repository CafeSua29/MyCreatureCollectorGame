// Lượt chờ của skill có hold (docs/rules/skill-synergy-hold.md): tính từ trạng thái tạm của quái
// trên sân. Đặt ở monster/ để cả trận đấu lẫn hiệu ứng skill (registries, AI) dùng chung.

import type { BattleState, GameData, Monster, Skill } from '../model'
import { activeTransform } from './stats'

/** Phần trận cần để tính lượt chờ. */
export type HoldScene = Pick<BattleState, 'turn' | 'volatiles'>

/**
 * Số lượt còn phải chờ trước khi dùng được skill có hold (0 = dùng được). Quái đang Dynamax dùng
 * skill thành chiêu Max nên không phải chờ. Quái không trên sân: 0.
 */
export function holdTurnsLeft(battle: HoldScene, user: Monster, skill: Skill): number {
  if (skill.hold === undefined || activeTransform(user)?.kind === 'dynamax') return 0
  const volatile = battle.volatiles[user.id]
  if (!volatile) return 0
  const ready = volatile.holdReadyTurns?.[skill.id] ?? volatile.firstTurn + skill.hold
  return Math.max(0, ready - battle.turn)
}

/** Skill đang chờ của quái (kể cả skill tạm trong trận) và số lượt còn chờ. */
export function heldSkills(
  data: GameData,
  battle: HoldScene,
  monster: Monster
): { skillId: string; turnsLeft: number }[] {
  const tempSkillIds = battle.volatiles[monster.id]?.tempSkillIds ?? []
  return [...new Set([...monster.skillIds, ...tempSkillIds])].flatMap((skillId) => {
    const turnsLeft = holdTurnsLeft(battle, monster, data.skills[skillId])
    return turnsLeft > 0 ? [{ skillId, turnsLeft }] : []
  })
}
