// Nâng thiên phú quái (docs/rules/monster-talents.md): ngoài trận, ở đâu cũng được.

import { rankedNodeError, talentBlocker } from '../registries'
import { ActionError } from '../shared'
import type { GameData, GameState } from '../model'
import { locateOwned } from './owned'

/** Nâng nút thiên phú `nodeId` của quái (đội hoặc kho) thêm một cấp. */
export function allocateTalent(
  data: GameData,
  state: GameState,
  monsterId: string,
  nodeId: string
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (!Object.hasOwn(data.talents, nodeId)) throw new ActionError('unknownTalent', { nodeId })
  const { monster, replace } = locateOwned(state, monsterId)
  const blocker = talentBlocker(data, monster, nodeId)
  if (blocker?.kind === 'branchClosed') {
    throw new ActionError('talentBranchClosed', { nodeId, raceId: monster.raceId })
  }
  if (blocker) throw rankedNodeError(nodeId, blocker)
  const rank = (monster.talentRanks[nodeId] ?? 0) + 1
  return replace({ ...monster, talentRanks: { ...monster.talentRanks, [nodeId]: rank } })
}
