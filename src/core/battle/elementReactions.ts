// Phản ứng hệ (docs/rules/element-reactions.md, từ Type Chemistry của Cassette Beasts): skill trúng
// mục tiêu thì mỗi hệ hiện tại của mục tiêu có thể ra một phản ứng, chạy sau đòn cuối của skill; và
// quái mang trạng thái dẫn hệ (Conductive) mất máu theo số mục tiêu bị skill hệ đó trúng.

import { getMaxHp, isFainted, percentOfMaxHp } from '../monster'
import { elementReactionsOn, hasTraitFlag, skillInField } from '../registries'
import { BIG_ZERO } from '../shared'
import type { EffectDef, GameData, Monster, Skill } from '../model'
import { Draft, aliveOnField, log, monsterBattleContext, userField } from './draft'
import { loseHp } from './hpChanges'
import { runSkillEffects } from './skillResults'
import { isShielded } from './volatiles'

/** Hệ thật của skill lúc dùng (đã tính chiêu đổi hệ); null nếu skill không hệ (Struggle, Bide). */
function reactingElementOf(data: GameData, d: Draft, user: Monster, skill: Skill): string | null {
  if (skill.typeless) return null
  return skillInField(data, userField(data, d, user), skill, user).elementId
}

/** Mục tiêu có hook chặn phản ứng của skill hệ này (Resistance của Cassette Beasts). */
const blocksReaction = (data: GameData, d: Draft, target: Monster, elementId: string): boolean =>
  hasTraitFlag(
    data,
    target,
    (handler, params) => handler.blocksElementReaction?.(params, elementId) ?? false,
    monsterBattleContext(data, d, target)
  )

const isOnField = (d: Draft, monsterId: string): boolean =>
  d.battle.playerSlots.includes(monsterId) || d.battle.enemySlots.includes(monsterId)

/** Quái mang trạng thái dẫn hệ `elementId` trên sân mất máu vì một mục tiêu vừa bị đánh trúng. */
function conductHit(data: GameData, d: Draft, user: Monster, elementId: string): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      for (const { statusId } of monster.statuses) {
        const rule = data.statuses[statusId]?.conductsElement
        if (rule?.elementId !== elementId) continue
        loseHp(
          data,
          d,
          monster,
          percentOfMaxHp(getMaxHp(data, monster), rule.percent),
          (amount) => ({ type: 'statusDamage', monsterId: monster.id, statusId, amount }),
          { kind: 'indirect', source: user, statusId }
        )
      }
    }
  }
}

/**
 * Sau khi skill trúng một mục tiêu (kể cả skill không gây sát thương, kể cả hệ số khắc hệ 0 như mọi
 * hiệu ứng khác của skill): chạy phản ứng theo từng hệ của mục tiêu lúc trúng. Quái tự dùng lên chính
 * nó không phản ứng; thế thân đỡ thì không phản ứng.
 */
export function runElementReactions(
  data: GameData,
  d: Draft,
  {
    user,
    skill,
    target,
    walled = false
  }: { user: Monster; skill: Skill; target: Monster; walled?: boolean }
): void {
  const attackElementId = reactingElementOf(data, d, user, skill)
  if (attackElementId === null) return
  if (skill.power > 0 && target.id !== user.id) conductHit(data, d, user, attackElementId)
  // Đòn có thể đã đẩy mục tiêu khỏi sân (Roar, Dragon Tail, trait bỏ chạy khi trúng đòn).
  if (target.id === user.id || !isOnField(d, target.id) || isShielded(d, user, target)) return
  if (walled || blocksReaction(data, d, target, attackElementId)) return
  // Lấy danh sách trước: biến hệ của phản ứng đầu không làm mất phản ứng của hệ còn lại.
  const hits = elementReactionsOn(data, attackElementId, [...target.elementIds])
  for (const { reaction, defenderElementId } of hits) {
    if (isFainted(data, target) || !isOnField(d, target.id)) return
    log(d, {
      type: 'elementReaction',
      monsterId: target.id,
      reactionId: reaction.id,
      attackElementId,
      defenderElementId
    })
    runSkillEffects(
      data,
      d,
      { user, target, damageDealt: BIG_ZERO, skillId: skill.id, shielded: false },
      reaction.effects
    )
  }
}

/** Hiệu ứng phản ứng hệ nếu skill trúng mục tiêu lúc này (AI chấm điểm). */
export function reactionEffectsOn(
  data: GameData,
  d: Draft,
  { user, skill, target }: { user: Monster; skill: Skill; target: Monster }
): EffectDef[] {
  const attackElementId = reactingElementOf(data, d, user, skill)
  if (attackElementId === null || target.id === user.id) return []
  if (blocksReaction(data, d, target, attackElementId)) return []
  return elementReactionsOn(data, attackElementId, target.elementIds).flatMap(
    ({ reaction }) => reaction.effects
  )
}
