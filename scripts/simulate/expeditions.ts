// Thám hiểm trong chơi liên tục (mục "Thám hiểm" ở simulation-features.md,
// docs/rules/expeditions.md): mỗi lần ở thị trấn, "người chơi" phái quái rảnh trong kho (trứng nở
// vào kho) đi các thám hiểm trên bảng khi còn ô: đội gồm quái level cao nhất, đủ số tối đa của yêu
// cầu teamSize (không có thì 4).

import {
  expeditionSlots,
  isFainted,
  unmetRequirement,
  type GameData,
  type GameState,
  type Monster
} from '@core'
import { simAct } from './events'

/** Số quái tối đa của đội theo yêu cầu teamSize (không có thì 4). */
function maxTeamSize(data: GameData, expeditionId: string): number {
  const size = data.expeditions[expeditionId].requirements.find((r) => r.type === 'teamSize')
  return typeof size?.max === 'number' ? size.max : 4
}

const isFree = (data: GameData, monster: Monster): boolean =>
  monster.assignment === null && monster.injuryBattlesLeft === 0 && !isFainted(data, monster)

/** Phái đi mọi đội được; trả state và số đội đã phái. */
export function sendExpeditions(
  data: GameData,
  state: GameState
): { state: GameState; sent: number } {
  let sent = 0
  for (const expeditionId of state.expeditions.board) {
    if (state.expeditions.active.length >= expeditionSlots(state)) break
    const free = state.storage
      .filter((m) => isFree(data, m))
      .sort((a, b) => b.level - a.level)
      .slice(0, maxTeamSize(data, expeditionId))
    if (free.length === 0) break
    if (unmetRequirement(data, data.expeditions[expeditionId], free) !== null) continue
    state = simAct(data, state, {
      type: 'startExpedition',
      expeditionId,
      monsterIds: free.map((m) => m.id)
    })
    sent++
  }
  return { state, sent }
}
