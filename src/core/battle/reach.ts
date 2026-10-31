// Tầm chiêu (docs/rules/hit-locations.md): skill cận chiến của quái đứng trên đất không với tới quái
// đang bay; quái đang bay đánh cận chiến xuống quái đứng trên đất thì phải sà xuống (với tới được
// tới hết lượt sau). Điểm duy nhất hỏi "với tới không" cho trận và AI.

import { isGrounded } from '../monster'
import { monsterSize } from '../registries'
import type { GameData, Monster, Skill, SkillReach } from '../model'
import { Draft, effectiveField, log } from './draft'

/** Tầm của skill: ghi `reach` thì theo đó, không thì đòn tiếp xúc là cận chiến, còn lại tầm xa. */
export const skillReach = (skill: Skill): SkillReach =>
  skill.reach ?? (skill.contact ? 'melee' : 'ranged')

/** Quái đang bay đã sà xuống và còn trong lượt với tới được. */
const isSwooping = (d: Draft, monster: Monster): boolean =>
  (d.battle.volatiles[monster.id]?.swoopedUntilTurn ?? 0) >= d.battle.turn

/**
 * Skill của `user` với tới `target` không. Chỉ cận chiến mới có thể không với tới: quái dùng đứng trên
 * đất, mục tiêu đang bay (không đứng trên đất, chưa sà xuống) và cả hai không phải quái lớn (quái lớn
 * cao tới / thân to với tới được). Skill trúng được quái bay lên trời (Sky Uppercut) luôn với tới.
 */
export function canReach(
  data: GameData,
  d: Draft,
  { user, skill, target }: { user: Monster; skill: Skill; target: Monster }
): boolean {
  if (skillReach(skill) === 'ranged') return true
  if ((skill.hitsInvulnerable ?? []).some((entry) => entry.kind === 'air')) return true
  const field = effectiveField(data, d)
  if (!isGrounded(data, user, field) || isGrounded(data, target, field)) return true
  if (monsterSize(data, user) === 'large' || monsterSize(data, target) === 'large') return true
  return isSwooping(d, target)
}

/**
 * Quái đang bay dùng skill cận chiến lên quái đứng trên đất thì sà xuống: tới hết lượt hiện tại +
 * swoopTurns quái đứng trên đất đánh cận chiến được nó (log `swooped`).
 */
export function markSwoop(
  data: GameData,
  d: Draft,
  { user, skill, targets }: { user: Monster; skill: Skill; targets: readonly Monster[] }
): void {
  if (skillReach(skill) !== 'melee') return
  const volatile = d.battle.volatiles[user.id]
  const field = effectiveField(data, d)
  if (!volatile || isGrounded(data, user, field)) return
  if (!targets.some((target) => isGrounded(data, target, field))) return
  const untilTurn = d.battle.turn + data.config.hitLocations.swoopTurns
  volatile.swoopedUntilTurn = Math.max(volatile.swoopedUntilTurn ?? 0, untilTurn)
  log(d, { type: 'swooped', monsterId: user.id, untilTurn })
}
