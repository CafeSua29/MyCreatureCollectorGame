// Action ngoài trận: di chuyển giữa thị trấn và các tầng, NPC hồi máu (thị trấn), nghỉ ngơi, dùng vật phẩm.

import { refillQuestBoard } from '../quests'
import {
  ActionError,
  BIG_ZERO,
  levelCost,
  malformedAction,
  spendMoney,
  type Decimal
} from '../shared'
import { assertUsableIn, getItemCount, removeItems, requireItemCount } from '../inventory'
import {
  applyItemToMonster,
  changeAffinity,
  hasTrialRule,
  itemAllowsCount,
  itemNeedsSkill,
  recordEvolutionResearch
} from '../registries'
import { locateOwned } from '../roster'
import { assertNotBusy, fulfillImprint, isImprintRequested } from '../monster'
import { enterTown } from '../shop'
import { isValidFloor } from './floors'
import { evolutionScene } from './evolutionPlace'
import { revealInstability } from './instability'
import { dayOf, type GameData, type GameState, type Location, type Monster } from '../model'

function requireNoBattle(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
}

/**
 * Đi tới thị trấn hoặc một tầng đã mở (1 đến highestFloor). Từ tầng về thị trấn thì cửa hàng
 * random lại hàng; đang ở thị trấn mà đi tới thị trấn thì giữ nguyên (không đổi hàng miễn phí).
 */
/** Đang trong giải đấu thì không hồi máu, không rời thị trấn (docs/rules/trainers.md). */
export function assertNoTournament(state: GameState): void {
  if (state.trainers.tournament.round !== null) throw new ActionError('tournamentInProgress')
}

/**
 * Đang đi bí cảnh (docs/rules/trials.md) / hiểm địa (docs/rules/zones.md) thì không hồi máu ở thị
 * trấn / nghỉ, không rời thị trấn, không vào trận khác hay phó bản khác.
 */
export function assertNoInstance(state: GameState): void {
  if (state.trial) throw new ActionError('trialInProgress')
  if (state.zones.visit) throw new ActionError('zoneInProgress')
}

export function travel(data: GameData, state: GameState, to: Location): GameState {
  requireNoBattle(state)
  assertNoTournament(state)
  assertNoInstance(state)
  if (to?.type === 'town') {
    if (state.location.type === 'town') return state
    // Vào thị trấn: cửa hàng random lại hàng, bảng nhiệm vụ bổ sung cho đủ (docs/rules/quests.md).
    return refillQuestBoard(data, { ...state, ...enterTown(data, state) })
  }
  if (to?.type === 'floor') {
    if (!isValidFloor(to.floor)) throw malformedAction(`tầng không hợp lệ "${String(to.floor)}"`)
    if (to.floor > state.highestFloor) {
      throw new ActionError('floorLocked', { floor: to.floor, highestFloor: state.highestFloor })
    }
    // Ra tầng: thuộc tính bất ổn ẩn lộ ra (docs/rules/instability.md).
    return revealInstability({ ...state, location: { type: 'floor', floor: to.floor } })
  }
  throw malformedAction('điểm đến không hợp lệ')
}

/**
 * NPC hồi máu ở thị trấn: hồi đầy cả đội kể cả quái đã gục, chữa mọi trạng thái và bệnh / chấn
 * thương (docs/rules/dwelling.md), sạc lại Tera Orb, miễn phí. Báo lỗi chỉ khi đội đã đầy máu, không
 * có trạng thái / bệnh nào, Tera Orb đang sạc và không quái nào đang đòi nghỉ ngơi (dưỡng dục).
 */
export function healParty(data: GameData, state: GameState): GameState {
  requireNoBattle(state)
  assertNoTournament(state)
  assertNoInstance(state)
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const hasStatuses = state.party.some((m) => m.statuses.length > 0 || m.ailment !== null)
  // Tera Orb hết sạc cũng là việc cho NPC (sạc lại, mục "Tera" ở transformation.md).
  if (isPartyFullHp(state) && !hasStatuses && state.teraOrbCharged && !wantsRest(state)) {
    throw new ActionError('partyFullHp')
  }
  return {
    ...state,
    party: state.party.map((m) =>
      restedMonster(data, { ...m, damageTaken: BIG_ZERO, statuses: [], ailment: null })
    ),
    teraOrbCharged: true
  }
}

const isPartyFullHp = (state: GameState): boolean => state.party.every((m) => m.damageTaken.lte(0))

/** Có quái trong đội đang đòi nghỉ ngơi (dưỡng dục): đội đầy máu vẫn nghỉ / hồi máu được. */
const wantsRest = (state: GameState): boolean =>
  state.party.some((m) => isImprintRequested(m, { kind: 'rest' }))

export function restCost(data: GameData, state: GameState): Decimal {
  const totalLevel = state.party.reduce((sum, m) => sum + m.level, 0)
  return levelCost(data.config.restCostPerLevel, totalLevel)
}

/**
 * Hồi đầy cả đội, mất tiền theo tổng level. Không chữa trạng thái bất thường. Đội đầy máu chỉ nghỉ
 * được khi có quái đang đòi nghỉ ngơi (dưỡng dục).
 */
export function rest(data: GameData, state: GameState): GameState {
  requireNoBattle(state)
  assertNoTournament(state)
  assertNoInstance(state)
  if (isPartyFullHp(state) && !wantsRest(state)) throw new ActionError('partyFullHp')
  const paid = spendMoney(state, restCost(data, state))
  return {
    ...paid,
    party: state.party.map((m) => restedMonster(data, { ...m, damageTaken: BIG_ZERO }))
  }
}

/**
 * Nghỉ / NPC hồi máu: mọi quái trong đội tăng thân mật (docs/rules/affinity.md) và xong yêu cầu
 * dưỡng dục "nghỉ ngơi" (docs/rules/imprinting.md).
 */
const restedMonster = (data: GameData, monster: Monster): Monster =>
  fulfillImprint(changeAffinity(data, monster, data.config.affinity.gain.rest), { kind: 'rest' })

/**
 * Dùng count vật phẩm (mặc định 1) lên một quái của ta, trong đội hoặc trong kho. count > 1 chỉ
 * với vật phẩm dùng nhiều cái một lần được (kẹo EXP). Không có tác dụng thì không mất vật phẩm.
 */
export function applyItem(
  data: GameData,
  state: GameState,
  {
    itemId,
    monsterId,
    count = 1,
    skillId
  }: { itemId: string; monsterId: string; count?: unknown; skillId?: unknown }
): GameState {
  requireNoBattle(state)
  const item = data.items[itemId]
  if (!item) throw new ActionError('unknownItem', { itemId })
  assertUsableIn(item, 'field')
  // Bí cảnh có luật noItems / noHealing: không dùng vật phẩm ngoài trận (docs/rules/trials.md).
  const rules = state.trial?.kind === 'realm' ? state.trial.rules : undefined
  if (hasTrialRule(data, rules, 'noItems') || hasTrialRule(data, rules, 'noHealing')) {
    throw new ActionError('trialRestricted', { command: 'item' })
  }
  requireItemCount(count)
  if (count > 1 && !itemAllowsCount(item)) throw new ActionError('itemCountNotAllowed', { itemId })
  const have = getItemCount(state.inventory, itemId)
  if (have < count) throw new ActionError('notEnoughItem', { itemId, have, need: count })
  const { monster, replace } = locateOwned(state, monsterId)
  // Kẹo EXP / Kẹo Hiếm không dùng lên quái đang thám hiểm (docs/rules/expeditions.md, exp-candy.md).
  if (itemAllowsCount(item)) assertNotBusy(monster)
  // Vật phẩm cần chọn skill (Ngộ Đạo Trà, docs/rules/treasures.md): skill quái đang biết.
  if (itemNeedsSkill(item)) {
    if (typeof skillId !== 'string') throw malformedAction('vật phẩm này cần skillId')
    if (!monster.skillIds.includes(skillId)) {
      throw new ActionError('skillNotKnown', { monsterId, skillId })
    }
  } else if (skillId !== undefined) {
    throw malformedAction('vật phẩm này không nhận skillId')
  }

  const applied = applyItemToMonster(data, monster, item, {
    rng: state.rng,
    day: dayOf(state.time),
    highestFloor: state.highestFloor,
    scene: evolutionScene(data, state),
    count,
    ...(typeof skillId === 'string' ? { skillId } : {})
  })
  // Cho ăn đúng món quái đang đòi (dưỡng dục) luôn có tác dụng, kể cả khi món không làm gì khác.
  const after = fulfillImprint(applied?.monster ?? monster, { kind: 'feed', itemId })
  if (after === monster) throw new ActionError('itemNoEffect', { itemId, monsterId })

  return {
    ...replace(after),
    rng: applied?.rng ?? state.rng,
    research: recordEvolutionResearch(data, state.research, applied?.events ?? []),
    inventory: removeItems(state.inventory, itemId, count)
  }
}

// Xuất lại cho bên ngoài core (UI chọn skill khi dùng vật phẩm, script mô phỏng cho ăn địa bảo).
export { isFavoriteItem, itemNeedsSkill } from '../registries'
