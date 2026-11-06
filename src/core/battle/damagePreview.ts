// Xem trước sát thương cho UI (như thanh máu dự kiến của WILDERLOCKE, docs/rules/battle.md mục "Xem
// trước sát thương"): chỉ là ước lượng, game có dao động, chí mạng, né nên trả về khoảng và tỉ lệ.
// Hàm thuần, không tốn RNG, không đổi state.

import { getCurrentHp } from '../monster'
import { withHitsByHp } from './multiHit'
import { ActionError, type Decimal } from '../shared'
import type { GameData, GameState } from '../model'
import { hpRatioOf, traitDodgeChance } from '../registries'
import { damageRange } from './damage'
import { cloneDraft, damageArena, findMonster, monsterBattleContext, userField } from './draft'
import { skillAccuracy } from './environment'
import { canReach } from './reach'

export interface SkillDamagePreview {
  /** Tổng sát thương cả các đòn nếu trúng hết; khoảng không chí mạng. */
  min: Decimal
  max: Decimal
  /** Cao nhất khi mọi đòn chí mạng. */
  critMax: Decimal
  critPercent: number
  /** % trúng (0 = không với tới mục tiêu). */
  hitPercent: number
  effectiveness: number
  /** Đòn hạ được mục tiêu theo máu hiện tại: chắc chắn (min), có thể (max). */
  knocksOutAtMin: boolean
  knocksOutAtMax: boolean
}

/** Ước lượng sát thương của một skill lên một mục tiêu trong trận đang đánh. */
export function previewSkillDamage(
  data: GameData,
  state: GameState,
  { userId, skillId, targetId }: { userId: string; skillId: string; targetId: string }
): SkillDamagePreview {
  if (!state.battle) throw new ActionError('noBattle')
  const d = cloneDraft(state)
  const user = findMonster(d, userId)
  const target = findMonster(d, targetId)
  const skill = data.skills[skillId]
  if (!skill) throw new ActionError('unknownSkill', { skillId })
  const range = damageRange({
    data,
    attacker: user,
    defender: target,
    skill,
    spread: false,
    attackerStages: d.battle.stages[user.id],
    defenderStages: d.battle.stages[target.id],
    arena: damageArena(data, d, { attacker: user, defender: target })
  })
  const hitSkill = withHitsByHp(skill, hpRatioOf(data, user) * 100)
  const hitsMin = hitSkill.hits?.min ?? 1
  const hitsMax = hitSkill.hits?.max ?? 1
  const min = range.min.times(hitsMin)
  const max = range.max.times(hitsMax)
  const reachable = canReach(data, d, { user, skill, target })
  const accuracy = skillAccuracy(data, userField(data, d, user), skill, {
    user,
    target,
    userCtx: monsterBattleContext(data, d, user),
    targetCtx: monsterBattleContext(data, d, target),
    stages: d.battle.stages
  })
  const dodge =
    skill.power <= 0
      ? 0
      : traitDodgeChance({
          data,
          attacker: user,
          defender: target,
          attackerCtx: monsterBattleContext(data, d, user),
          defenderCtx: monsterBattleContext(data, d, target),
          skill
        })
  const hp = getCurrentHp(data, target)
  return {
    min,
    max,
    critMax: range.critMax.times(hitsMax),
    critPercent: range.critPercent,
    hitPercent: reachable ? (accuracy * (100 - dodge)) / 100 : 0,
    effectiveness: range.effectiveness,
    knocksOutAtMin: min.gte(hp),
    knocksOutAtMax: max.gte(hp)
  }
}
