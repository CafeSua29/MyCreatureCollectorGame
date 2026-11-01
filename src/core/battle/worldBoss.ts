// Trận boss thế giới (docs/rules/world-boss.md): khiêu chiến ở thị trấn 1 lần mỗi ngày trong thời gian
// xuất hiện; boss HP vô hạn (Monster.endlessHp), trận tối đa config.worldBoss.turns lượt; hết trận (hết
// lượt, đội gục, rút lui) thì tổng sát thương lên boss cập nhật kỷ lục. Luật theo loại trận ở
// SPECIAL_BATTLE_RULES (specialBattles.ts).

import { ActionError, BIG_ZERO, maxBig } from '../shared'
import { dayOf, type GameData, type GameState } from '../model'
import { assertNoTournament, floorSite, generateWorldBoss } from '../world'
import { Draft, log } from './draft'
import { openBattle } from './openBattle'
import { assertReadyForBattle, requireTown } from './trainerBattles'

/**
 * Khiêu chiến boss thế giới đang xuất hiện: ở thị trấn (không trong bí cảnh, hiểm địa, giải đấu), chưa
 * khiêu chiến hôm nay.
 */
export function challengeWorldBoss(data: GameData, state: GameState): GameState {
  assertReadyForBattle(data, state)
  requireTown(state)
  assertNoTournament(state)
  const current = state.worldBoss.current
  if (!current) throw new ActionError('noWorldBoss')
  const day = dayOf(state.time)
  if (current.lastChallengeDay === day) throw new ActionError('worldBossChallengedToday', { day })
  const boss = generateWorldBoss(data, { source: current, id: `m${state.nextMonsterId}` })
  const worldBoss = { ...state.worldBoss, current: { ...current, lastChallengeDay: day } }
  return openBattle(
    data,
    { ...state, worldBoss },
    {
      site: floorSite(data, state, current.floor),
      encounter: {
        enemies: [boss],
        isBoss: true,
        rng: state.rng,
        nextMonsterId: state.nextMonsterId + 1
      },
      special: { kind: 'worldBoss' }
    }
  )
}

/** Hết trận boss thế giới: tổng sát thương lên quái HP vô hạn, cập nhật kỷ lục của lần xuất hiện. */
export function recordWorldBossDamage(d: Draft): void {
  const total = d.battle.enemies
    .filter((enemy) => enemy.endlessHp)
    .reduce((sum, enemy) => sum.plus(d.battle.records[enemy.id]?.damageTaken ?? BIG_ZERO), BIG_ZERO)
  const current = d.worldBoss.current
  const record = current !== null && total.gt(current.bestDamage)
  log(d, { type: 'worldBossDamage', total, record })
  if (!current) return
  d.worldBoss = {
    ...d.worldBoss,
    current: { ...current, bestDamage: maxBig(current.bestDamage, total) }
  }
}
