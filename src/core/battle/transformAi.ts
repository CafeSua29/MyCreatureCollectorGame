// AI biến hình của phe người chơi (mục "Boss và AI" ở transformation.md; gợi ý lệnh, script mô
// phỏng, tự động đánh sau này): lợi của một loại = (điểm lệnh tốt nhất sau biến hình − trước) +
// phần sát thương dự kiến phải nhận giảm đi (theo tỉ lệ máu còn). Chỉ biến khi lợi ≥
// config.ai.transformMinGain; Mega luôn dùng ngay vì không tốn gì. Mỗi loại một quái, mỗi quái một
// loại, chọn theo lợi lớn nhất trước.

import { getCurrentHp } from '../monster'
import { BIG_ZERO, maxBig, minBig, runReadOnlyScope, type Decimal } from '../shared'
import {
  TRANSFORM_KINDS,
  battleSkillIds,
  type BattleCommand,
  type BattleSide,
  type GameData,
  type Monster,
  type TransformKind
} from '../model'
import { expectedDamage } from './damage'
import { Draft, aliveOnField, damageArena, findMonster, opponentOf, slotsOf } from './draft'
import { aiStatsMemo, bestCandidateScore } from './ai'
import { battleSkill, previewTransform } from './transform'
import { TRANSFORMS } from './transformHandlers'

interface TransformOption {
  slot: number
  kind: TransformKind
  gain: number
  formSpeciesId?: string
}

/** Thêm biến hình có lợi vào lệnh skill của phe người chơi (không đổi skill đã chọn). */
export function withSuggestedTransforms(
  data: GameData,
  d: Draft,
  commands: readonly BattleCommand[]
): BattleCommand[] {
  // Chỉ đọc draft (xem trước biến hình trên bản sao quái) nên nhớ được phần đã tính (readOnlyScope).
  return runReadOnlyScope(() => suggestTransforms(data, d, commands))
}

function suggestTransforms(
  data: GameData,
  d: Draft,
  commands: readonly BattleCommand[]
): BattleCommand[] {
  const options: TransformOption[] = []
  for (const command of commands) {
    if (command.kind !== 'skill') continue
    const monster = findMonster(d, slotsOf(d.battle, 'player')[command.slot] as string)
    for (const kind of TRANSFORM_KINDS) {
      // Hợp thể đi qua kỹ năng ngự thú sư (AI ở tamerSkills.ts).
      if (!TRANSFORMS[kind].bySkillCommand) continue
      // Quái đã chọn Z-Move thì không Dynamax (docs/rules/z-moves.md).
      if (kind === 'dynamax' && command.zMove) continue
      const preview = previewTransform(data, d, { side: 'player', monster, kind })
      if (!preview) continue
      const gain =
        kind === 'mega'
          ? Infinity
          : transformGain(data, d, { slot: command.slot, before: monster, after: preview.monster })
      if (gain < data.config.ai.transformMinGain) continue
      options.push({ slot: command.slot, kind, gain, formSpeciesId: preview.formSpeciesId })
    }
  }
  options.sort((a, b) => b.gain - a.gain)
  const chosen = new Map<number, TransformOption>()
  for (const option of options) {
    const kindTaken = [...chosen.values()].some((entry) => entry.kind === option.kind)
    if (!chosen.has(option.slot) && !kindTaken) chosen.set(option.slot, option)
  }
  return commands.map((command) => {
    const option = chosen.get(command.slot)
    if (command.kind !== 'skill' || !option) return command
    // Dynamax dùng chiêu Max, không có thế (docs/rules/move-styles.md).
    const { style, ...rest } = command
    return {
      ...(option.kind === 'dynamax' || style === undefined ? rest : { ...rest, style }),
      transform: option.kind,
      ...(option.formSpeciesId ? { formSpeciesId: option.formSpeciesId } : {})
    }
  })
}

/** Lợi của biến hình: điểm tấn công tăng thêm + tỉ lệ máu đỡ được trước đòn mạnh nhất của địch. */
function transformGain(
  data: GameData,
  d: Draft,
  { slot, before, after }: { slot: number; before: Monster; after: Monster }
): number {
  const offense =
    bestCandidateScore(data, d, { side: 'player', slot, user: after }) -
    bestCandidateScore(data, d, { side: 'player', slot, user: before })
  return (
    offense + incomingShare(data, d, 'player', before) - incomingShare(data, d, 'player', after)
  )
}

/**
 * Tổng tỉ lệ máu còn lại mà mỗi địch trên sân (của phe `side`) lấy được bằng đòn mạnh nhất (mỗi địch
 * tối đa 1).
 */
export function incomingShare(data: GameData, d: Draft, side: BattleSide, target: Monster): number {
  const hp = getCurrentHp(data, target)
  if (hp.lte(0)) return 0
  let share = 0
  for (const { monster: foe } of aliveOnField(data, d, opponentOf(side))) {
    let best: Decimal = BIG_ZERO
    for (const skillId of battleSkillIds(foe)) {
      const skill = battleSkill(data, d, foe, data.skills[skillId])
      if (skill.power <= 0) continue
      const damage = expectedDamage({
        data,
        attacker: foe,
        defender: target,
        skill,
        attackerStages: d.battle.stages[foe.id],
        defenderStages: d.battle.stages[target.id],
        spread: false,
        arena: damageArena(data, d, { attacker: foe, defender: target }),
        statsMemo: aiStatsMemo(data, d)
      })
      best = maxBig(best, damage)
    }
    share += minBig(best, hp).div(hp).toNumber()
  }
  return share
}
