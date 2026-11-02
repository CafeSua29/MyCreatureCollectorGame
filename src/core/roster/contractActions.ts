// Khế ước / giải trừ khế ước (docs/rules/tamer.md mục "Khế ước"): bước riêng như fuse, breed, không
// gắn với cách có quái. Ở thị trấn, ngoài trận, quái rảnh. Thất bại thì phản phệ (như truyện ngự
// thú): quái mất thân mật, ngự thú sư bị thương (không khế ước / đột phá được), quái có thể bỏ trốn.

import { ActionError, rollPercent } from '../shared'
import { changeAffinity } from '../registries'
import { addMilestone, assertNotBusy } from '../monster'
import { returnEquipment } from '../inventory'
import {
  assertNotBond,
  assertNotWounded,
  contractChance,
  contractEscapeChance,
  contractLevelPercent,
  contractedCount,
  isContracted,
  maxContracts,
  playerContractLevelLimit,
  realmToContract
} from '../tamer'
import { dayOf, type GameData, type GameState, type Monster } from '../model'
import { locateOwned } from './owned'

/** Kết quả một lần khế ước, UI so state trước / sau (như breakthroughOutcome). */
export type ContractOutcome = 'success' | 'failed' | 'escaped'

function requireTownIdle(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
}

/**
 * Lý do quái `monster` chưa khế ước được (đã khế ước, quá giới hạn level, hết ô, ngự thú sư đang bị
 * thương); ném ActionError. Dùng cho action và UI (thử trước khi hiện nút).
 */
export function assertCanContract(data: GameData, state: GameState, monster: Monster): void {
  if (isContracted(monster)) throw new ActionError('alreadyContracted', { monsterId: monster.id })
  const { realm } = state.tamer
  if (monster.level > playerContractLevelLimit(data, state)) {
    const needRealm = realmToContract(data, monster.level, contractLevelPercent(data, state))
    throw new ActionError('tamerRealmTooLow', { monsterId: monster.id, needRealm })
  }
  const max = maxContracts(data, realm)
  if (contractedCount(state) >= max) throw new ActionError('contractSlotsFull', { max })
  assertNotWounded(state)
}

/** Phản phệ: ngự thú sư bị thương tới hết ngày hôm nay + days − 1 (không rút ngắn vết cũ). */
function backlash(state: GameState, backlashDays: number): GameState['tamer'] {
  if (backlashDays <= 0) return state.tamer
  const until = dayOf(state.time) + backlashDays - 1
  const woundUntilDay = Math.max(state.tamer.woundUntilDay ?? until, until)
  return { ...state.tamer, woundUntilDay }
}

/** Quái bỏ trốn: rời đội / kho, trả đồ đang lắp về túi (như thả). */
function escape(state: GameState, monster: Monster): GameState {
  return {
    ...state,
    party: state.party.filter((m) => m.id !== monster.id),
    storage: state.storage.filter((m) => m.id !== monster.id),
    inventory: returnEquipment(state.inventory, monster)
  }
}

/** Đội chỉ còn quái này thì nó không bỏ trốn được (đội không bao giờ trống). */
const canEscape = (state: GameState, monster: Monster): boolean =>
  !(state.party.length <= 1 && state.party.some((m) => m.id === monster.id))

/**
 * Khế ước quái `monsterId` (đội hoặc kho): tung `contractChance`. Thành công: cảnh giới khế ước =
 * cảnh giới ngự thú sư, mốc lý lịch `contracted`. Thất bại: quái − affinityLoss thân mật, ngự thú sư
 * bị phản phệ backlashDays ngày, rồi tung `contractEscapeChance` quái bỏ trốn.
 */
export function formContract(data: GameData, state: GameState, monsterId: string): GameState {
  requireTownIdle(state)
  const { monster, replace } = locateOwned(state, monsterId)
  assertNotBusy(monster)
  assertCanContract(data, state, monster)
  const { realm } = state.tamer
  const [success, rng] = rollPercent(
    state.rng,
    contractChance(data, monster, playerContractLevelLimit(data, state))
  )
  if (success) {
    const contracted = addMilestone(
      data,
      { ...monster, contractRealm: realm, contractDays: 0 },
      { day: dayOf(state.time), kind: 'contracted', realm }
    )
    return { ...replace(contracted), rng }
  }
  const { affinityLoss } = data.config.tamer.contract.failure
  const hurt = changeAffinity(data, monster, -affinityLoss)
  const days = data.config.tamer.contract.failure.backlashDays
  const failed: GameState = { ...replace(hurt), rng, tamer: backlash(state, days) }
  if (!canEscape(state, monster)) return failed
  const [escaped, afterEscape] = rollPercent(rng, contractEscapeChance(data, hurt))
  const next = { ...failed, rng: afterEscape }
  return escaped ? escape(next, hurt) : next
}

/**
 * Giải trừ khế ước quái `monsterId`: hết khế ước (mất tâm linh tương thông), quái mất
 * dissolveAffinityLoss thân mật, ngự thú sư bị phản phệ dissolveBacklashDays ngày. Bản mệnh không
 * giải trừ được.
 */
export function dissolveContract(data: GameData, state: GameState, monsterId: string): GameState {
  requireTownIdle(state)
  const { monster, replace } = locateOwned(state, monsterId)
  assertNotBusy(monster)
  if (!isContracted(monster)) throw new ActionError('notContracted', { monsterId })
  assertNotBond(monster)
  const { dissolveAffinityLoss, dissolveBacklashDays } = data.config.tamer.contract
  const freed = {
    ...changeAffinity(data, monster, -dissolveAffinityLoss),
    contractRealm: null,
    contractDays: 0
  }
  return { ...replace(freed), tamer: backlash(state, dissolveBacklashDays) }
}

/** Kết quả lần khế ước `monsterId` từ state trước sang state sau. */
export function contractOutcome(
  before: GameState,
  after: GameState,
  monsterId: string
): ContractOutcome {
  const owned = [...after.party, ...after.storage].find((m) => m.id === monsterId)
  if (!owned) return 'escaped'
  const was = [...before.party, ...before.storage].find((m) => m.id === monsterId)
  return isContracted(owned) && !(was && isContracted(was)) ? 'success' : 'failed'
}
