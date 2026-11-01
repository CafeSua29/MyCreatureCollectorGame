// NPC Tượng Lực ở thị trấn (docs/rules/soul-levels.md): nâng cấp hồn tinh một chỉ số của quái.

import {
  SOUL_LEVEL_KEYS,
  assertNotBusy,
  soulLevelCost,
  soulLevelOf,
  withSoulLevel,
  type SoulLevelKey
} from '../monster'
import { spendSoulCrystalPoints } from '../inventory'
import { ActionError, malformedAction, spendMoney } from '../shared'
import type { GameData, GameState } from '../model'
import { locateOwned } from './owned'

/** Nâng cấp hồn tinh mục `stat` (chỉ số hoặc tốc độ làm việc) của quái thêm 1: tốn điểm và tiền. */
export function upgradeSoulLevel(
  data: GameData,
  state: GameState,
  monsterId: string,
  stat: SoulLevelKey
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  if (!(SOUL_LEVEL_KEYS as readonly unknown[]).includes(stat)) {
    throw malformedAction(`chỉ số lạ: ${String(stat)}`)
  }
  const { monster } = locateOwned(state, monsterId)
  assertNotBusy(monster)
  const level = soulLevelOf(monster, stat)
  const cost = soulLevelCost(data, level)
  const inventory = spendSoulCrystalPoints(data, state.inventory, cost.points)
  const paid = spendMoney({ ...state, inventory }, cost.money)
  const upgraded = withSoulLevel(monster, stat, level + 1)
  return locateOwned(paid, monsterId).replace(upgraded)
}
