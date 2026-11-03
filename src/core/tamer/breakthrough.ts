// Đột phá cảnh giới ngự thú sư (docs/rules/tamer.md): ở thị trấn, ngoài trận; đủ EXP + tiền + Phá
// Cảnh Đan thì tung tỉ lệ. Thất bại mất đan và tiền, giữ EXP; thành công lên cảnh giới, trừ EXP cần
// (dư giữ lại), nâng cảnh giới khế ước của mọi quái đang sở hữu.

import { ActionError, rollPercent, spendMoney } from '../shared'
import { removeItems } from '../inventory'
import { tamerBonusMultiplier } from '../registries'
import { appendLog, type GameData, type GameState } from '../model'
import { raiseOwnedContracts } from './contract'
import { assertNotWounded } from './bond'
import {
  breakthroughChance,
  breakthroughCost,
  breakthroughItemCount,
  expToNextRealm
} from './realm'

/** Đột phá lên cảnh giới tiếp theo; kết quả ghi log ngoài trận `breakthrough`. */
export function tamerBreakthrough(data: GameData, state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  // Đạo thương (bản mệnh chết hẳn): không đột phá được (mục "Bản mệnh thú").
  assertNotWounded(state)
  const { realm, exp } = state.tamer
  const need = expToNextRealm(data, realm)
  if (exp.lt(need)) throw new ActionError('tamerExpTooLow', { need, have: exp })
  const cost = breakthroughCost(data, realm)
    .times(tamerBonusMultiplier(data, state, 'breakthroughCostPercent'))
    .ceil()
  const paid = spendMoney(state, cost)
  const { itemId } = data.config.tamer.breakthrough
  const inventory = removeItems(paid.inventory, itemId, breakthroughItemCount(realm))
  const [success, rng] = rollPercent(state.rng, breakthroughChance(data, realm))
  const next: GameState = { ...paid, inventory, rng }
  if (!success) return appendLog(next, { type: 'breakthrough', success, realm })
  const nextRealm = realm + 1
  const raised = raiseOwnedContracts(
    { ...next, tamer: { ...state.tamer, realm: nextRealm, exp: exp.minus(need) } },
    nextRealm
  )
  return appendLog(raised, { type: 'breakthrough', success, realm: nextRealm })
}
