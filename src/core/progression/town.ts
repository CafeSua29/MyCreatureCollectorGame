// Việc ở thị trấn (NPC luyện đan / Thợ rèn / Đầu bếp, động phủ): kiểm tra chung.

import { ActionError } from '../shared'
import type { GameState } from '../model'

/** Việc ở thị trấn (luyện, nấu, hồn phách, động phủ): ở thị trấn, ngoài trận. */
export const requireTown = (state: GameState): void => {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
}
