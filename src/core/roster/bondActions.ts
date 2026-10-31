// Kết / đổi bản mệnh thú (docs/rules/tamer.md mục "Bản mệnh thú"): ở thị trấn, ngoài trận, quái đủ
// thân mật. Lần đầu miễn phí; đổi sang quái khác tốn tiền theo cảnh giới, bản mệnh cũ mất thân mật,
// phải chờ rebindCooldownDays ngày kể từ lần kết trước.

import { ActionError, spendMoney, toBig, type Decimal } from '../shared'
import { changeAffinity } from '../registries'
import { assertNotBusy } from '../monster'
import { dayOf, type GameData, type GameState, type Monster } from '../model'
import { locateOwned } from './owned'

/** Bản mệnh thú đang có (đội hoặc kho); null nếu chưa có. */
export function bondMonsterOf(state: GameState): Monster | null {
  return [...state.party, ...state.storage].find((monster) => monster.bond) ?? null
}

/** Giá đổi bản mệnh ở cảnh giới hiện tại. */
export const rebindCost = (data: GameData, state: GameState): Decimal =>
  toBig(data.config.bond.rebindCostPerRealm).times(state.tamer.realm + 1)

/** Đặt cờ bản mệnh cho một quái trong đội / kho (danh sách mới, không sửa cũ). */
function setBondFlag(
  state: GameState,
  monsterId: string,
  update: (m: Monster) => Monster
): GameState {
  const map = (list: Monster[]): Monster[] => list.map((m) => (m.id === monsterId ? update(m) : m))
  return { ...state, party: map(state.party), storage: map(state.storage) }
}

/**
 * Kết bản mệnh với quái `monsterId`: thân mật ≥ minAffinity. Đã có bản mệnh khác (còn sống): tốn
 * rebindCost, bản mệnh cũ − rebindAffinityLoss thân mật và hết là bản mệnh. Đã từng kết thì phải
 * chờ rebindCooldownDays ngày kể từ lần kết trước (kể cả khi bản mệnh cũ đã chết).
 */
export function bindBond(data: GameData, state: GameState, monsterId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const { monster } = locateOwned(state, monsterId)
  assertNotBusy(monster)
  // Bản mệnh phải là quái đã khế ước (docs/rules/tamer.md mục "Khế ước").
  if (monster.contractRealm === null) throw new ActionError('notContracted', { monsterId })
  if (monster.bond) throw new ActionError('bondAlreadyBound', { monsterId })
  const config = data.config.bond
  if (monster.affinity < config.minAffinity) {
    throw new ActionError('bondAffinityTooLow', {
      monsterId,
      need: config.minAffinity,
      have: monster.affinity
    })
  }
  const today = dayOf(state.time)
  const { bondDay } = state.tamer
  if (bondDay !== null && today < bondDay + config.rebindCooldownDays) {
    throw new ActionError('bondCooldown', { readyDay: bondDay + config.rebindCooldownDays })
  }
  const old = bondMonsterOf(state)
  let next = old ? spendMoney(state, rebindCost(data, state)) : state
  if (old) {
    next = setBondFlag(next, old.id, (m) => ({
      ...changeAffinity(data, m, -config.rebindAffinityLoss),
      bond: false
    }))
  }
  next = setBondFlag(next, monsterId, (m) => ({ ...m, bond: true }))
  return { ...next, tamer: { ...next.tamer, bondDay: today } }
}
