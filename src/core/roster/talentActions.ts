// Nâng thiên phú quái (docs/rules/monster-talents.md): ngoài trận, ở đâu cũng được.

import { talentBlocker, type TalentBlocker } from '../registries'
import { ActionError, assertNever } from '../shared'
import type { GameData, GameState, Monster } from '../model'
import { locateOwned } from './owned'

/** Lỗi action theo lý do không nâng được. */
function talentError(monster: Monster, nodeId: string, blocker: TalentBlocker): ActionError {
  switch (blocker.kind) {
    case 'branchClosed':
      return new ActionError('talentBranchClosed', { nodeId, raceId: monster.raceId })
    case 'maxRank':
      return new ActionError('talentMaxRank', { nodeId, maxRank: blocker.maxRank })
    case 'requires':
      return new ActionError('talentRequires', {
        nodeId,
        requiredId: blocker.nodeId,
        rank: blocker.rank
      })
    case 'points':
      return new ActionError('notEnoughTalentPoints', { need: blocker.need, have: blocker.have })
    default:
      return assertNever(blocker, 'lý do không nâng được thiên phú')
  }
}

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
  if (blocker) throw talentError(monster, nodeId, blocker)
  const rank = (monster.talentRanks[nodeId] ?? 0) + 1
  return replace({ ...monster, talentRanks: { ...monster.talentRanks, [nodeId]: rank } })
}
