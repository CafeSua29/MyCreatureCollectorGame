// "Người chơi" luân hồi quái đội mẫu ở thị trấn (mục "Luân hồi" ở simulation-features.md,
// docs/rules/rebirth.md): quái đủ level, đủ Luân Hồi Đan, giá ≤ spendFraction tiền thì luân hồi.
// Mỗi lúc chỉ một quái đang "luyện lại" (level < recoverRatio × level cao nhất từng đạt) để đội không
// tụt hết cùng lúc.

import {
  getItemCount,
  rebirthRequirements,
  type GameData,
  type GameState,
  type Monster
} from '@core'
import { simAct } from './events'

export const REBIRTH_POLICY = {
  /** Chỉ luân hồi khi giá ≤ phần này của tiền. */
  spendFraction: 0.3,
  /** Quái đã luân hồi còn dưới phần này của level cao nhất từng đạt thì đang luyện lại. */
  recoverRatio: 0.5
} as const

/** Quái đội mẫu (đội / kho). */
const teamMonsters = (state: GameState, teamIds: ReadonlySet<string>): Monster[] =>
  [...state.party, ...state.storage].filter((m) => teamIds.has(m.id))

const isRecovering = (monster: Monster): boolean =>
  monster.rebirths > 0 && monster.level < monster.maxLevelReached * REBIRTH_POLICY.recoverRatio

/** Quái luân hồi được ngay (level, đan, tiền theo chính sách, rảnh). */
function canRebirth(data: GameData, state: GameState, monster: Monster): boolean {
  const config = data.config.rebirth
  const need = rebirthRequirements(config, monster.rebirths)
  return (
    monster.assignment === null &&
    monster.level >= need.level &&
    getItemCount(state.inventory, config.pillItemId) >= need.pills &&
    need.money.lte(state.money.times(REBIRTH_POLICY.spendFraction))
  )
}

/** Ở thị trấn: luân hồi tối đa một quái đội mẫu (level cao nhất trước). Trả state và số lần. */
export function rebirthWhenPossible(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; rebirths: number } {
  if (state.location.type !== 'town' || state.battle) return { state, rebirths: 0 }
  const team = teamMonsters(state, teamIds)
  if (team.some(isRecovering)) return { state, rebirths: 0 }
  const candidate = team
    .filter((m) => canRebirth(data, state, m))
    .sort((a, b) => b.level - a.level)[0]
  if (!candidate) return { state, rebirths: 0 }
  return {
    state: simAct(data, state, { type: 'rebirthMonster', monsterId: candidate.id }),
    rebirths: 1
  }
}
