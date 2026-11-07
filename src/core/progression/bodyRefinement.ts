// Luyện thể (docs/rules/body-refinement.md): lắp / đổi / gỡ kiểu luyện thể của một bộ phận ở NPC thị
// trấn. Hook và thưởng bộ ở registries/bodyRefinement.ts.

import { ActionError, levelCost, spendMoney, type Decimal } from '../shared'
import { findIdleOwned } from '../roster'
import { monsterBodyPlan } from '../registries'
import type { BodyRefinementDef, GameData, GameState, Monster } from '../model'

// UI xem thưởng bộ qua '@core' (registries không phải API công khai).
export { activeRefinementBonuses, refinementTagCounts } from '../registries'

/** Giá luyện kiểu `refinement` cho quái: costPerLevel × level × costMultiplier. */
export function refinementCost(
  data: GameData,
  monster: Monster,
  refinement: BodyRefinementDef
): Decimal {
  return levelCost(data.config.bodyRefinement.costPerLevel, monster.level).times(
    refinement.costMultiplier
  )
}

/** Kiểu luyện thể quái lắp được: bộ phận của kiểu là bộ phận quái có (hit-locations.md). */
export function availableRefinements(data: GameData, monster: Monster): BodyRefinementDef[] {
  const { parts } = monsterBodyPlan(data, monster)
  return Object.values(data.bodyRefinements).filter((entry) => parts.includes(entry.partId))
}

function replaceMonster(state: GameState, monster: Monster): GameState {
  const swap = (list: Monster[]): Monster[] => list.map((m) => (m.id === monster.id ? monster : m))
  return { ...state, party: swap(state.party), storage: swap(state.storage) }
}

function assertTown(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
}

/**
 * Luyện một bộ phận (thị trấn, ngoài trận): kiểu phải thuộc bộ phận quái có; bộ phận đang lắp kiểu
 * khác thì thay (trả giá kiểu mới). Lắp lại đúng kiểu đang có thì refinementAlreadyApplied.
 */
export function refineBody(
  data: GameData,
  state: GameState,
  { monsterId, refinementId }: { monsterId: string; refinementId: string }
): GameState {
  assertTown(state)
  const monster = findIdleOwned(state, monsterId)
  const refinement = data.bodyRefinements[refinementId]
  if (!refinement) throw new ActionError('unknownRefinement', { refinementId })
  if (!monsterBodyPlan(data, monster).parts.includes(refinement.partId)) {
    throw new ActionError('noSuchBodyPart', { monsterId, partId: refinement.partId })
  }
  if (monster.refinements[refinement.partId] === refinementId) {
    throw new ActionError('refinementAlreadyApplied', { monsterId, refinementId })
  }
  const paid = spendMoney(state, refinementCost(data, monster, refinement))
  const refined: Monster = {
    ...monster,
    refinements: { ...monster.refinements, [refinement.partId]: refinementId }
  }
  return replaceMonster(paid, refined)
}

/** Gỡ kiểu luyện thể của một bộ phận: trả removeCostPercent % giá luyện của kiểu đó. */
export function removeRefinement(
  data: GameData,
  state: GameState,
  { monsterId, partId }: { monsterId: string; partId: string }
): GameState {
  assertTown(state)
  const monster = findIdleOwned(state, monsterId)
  const refinementId = monster.refinements[partId]
  if (refinementId === undefined) throw new ActionError('noRefinement', { monsterId, partId })
  const refinement = data.bodyRefinements[refinementId]
  const cost = refinementCost(data, monster, refinement)
    .times(data.config.bodyRefinement.removeCostPercent)
    .div(100)
    .floor()
  const paid = spendMoney(state, cost)
  const { [partId]: _removed, ...rest } = monster.refinements
  return replaceMonster(paid, { ...monster, refinements: rest })
}
