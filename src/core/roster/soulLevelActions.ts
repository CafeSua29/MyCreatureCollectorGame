// NPC Tượng Lực ở thị trấn (docs/rules/soul-levels.md): nâng cấp hồn tinh một chỉ số của quái.

import { assertNotBusy, soulLevelCost } from '../monster'
import { spendSoulCrystalPoints } from '../inventory'
import { ActionError, malformedAction, spendMoney } from '../shared'
import { STAT_NAMES, type GameData, type GameState, type StatName } from '../model'
import { locateOwned } from './owned'

/** Nâng cấp hồn tinh `stat` của quái (đội hoặc kho) thêm 1: tốn điểm hồn tinh và tiền. */
export function upgradeSoulLevel(
  data: GameData,
  state: GameState,
  monsterId: string,
  stat: StatName
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  if (!(STAT_NAMES as readonly unknown[]).includes(stat)) {
    throw malformedAction(`chỉ số lạ: ${String(stat)}`)
  }
  const { monster } = locateOwned(state, monsterId)
  assertNotBusy(monster)
  const level = monster.soulLevels[stat]
  const cost = soulLevelCost(data, level)
  const inventory = spendSoulCrystalPoints(data, state.inventory, cost.points)
  const paid = spendMoney({ ...state, inventory }, cost.money)
  const upgraded = { ...monster, soulLevels: { ...monster.soulLevels, [stat]: level + 1 } }
  return locateOwned(paid, monsterId).replace(upgraded)
}
