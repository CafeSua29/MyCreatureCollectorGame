// Skill bị động (passive của Cassette Beasts, docs/rules/element-reactions.md): quái biết skill có
// `passive` thì được hook trait của nó (registries/traitHooks.ts, nguồn `passiveSkill`), chạy hiệu ứng
// `onEntry` khi vào sân và `turnEnd` cuối mỗi lượt lên chính nó. Skill bị động không dùng bằng lệnh
// trừ khi `usable` (chặn ở isSkillBlocked).

import { isFainted } from '../monster'
import { BIG_ZERO } from '../shared'
import { battleSkillIds, type EffectDef, type GameData, type Monster, type Skill } from '../model'
import { Draft, aliveOnField, recordOf } from './draft'
import { runSkillEffects } from './skillResults'

/** Skill chỉ có tác dụng bị động (không dùng bằng lệnh được). */
export const isPassiveOnly = (skill: Skill): boolean =>
  skill.passive !== undefined && skill.passive.usable !== true

/** Chạy hiệu ứng bị động theo thời điểm của mọi skill bị động quái biết, lên chính nó. */
function runPassives(
  data: GameData,
  d: Draft,
  monster: Monster,
  pick: (skill: Skill) => readonly EffectDef[] | undefined
): void {
  for (const skillId of battleSkillIds(monster)) {
    const effects = pick(data.skills[skillId])
    if (!effects || effects.length === 0 || isFainted(data, monster)) continue
    runSkillEffects(
      data,
      d,
      { user: monster, target: monster, damageDealt: BIG_ZERO, skillId, shielded: false },
      effects
    )
  }
}

/**
 * Quái vừa vào sân: hiệu ứng `onBattleStart` một lần mỗi trận (Camouflage: gốc tự dùng lúc đầu trận),
 * rồi `onEntry` mỗi lần vào sân (Spring-Load).
 */
export function passivesOnEntry(data: GameData, d: Draft, monsters: readonly Monster[]): void {
  for (const monster of monsters) {
    const record = recordOf(d, monster.id)
    if (!record.battleStartPassivesDone) {
      record.battleStartPassivesDone = true
      runPassives(data, d, monster, (skill) => skill.passive?.onBattleStart)
    }
    runPassives(data, d, monster, (skill) => skill.passive?.onEntry)
  }
}

/** Cuối lượt: hiệu ứng `turnEnd` của mọi quái còn sống trên sân (Prismatic). */
export function passivesAtTurnEnd(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      runPassives(data, d, monster, (skill) => skill.passive?.turnEnd)
    }
  }
}
