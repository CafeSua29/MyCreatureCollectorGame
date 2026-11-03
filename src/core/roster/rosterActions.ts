// Action quản lý quái: chuyển giữa đội và kho, sắp xếp đội, thả, đặt biệt danh.
// Chỉ dùng ngoài trận. Đội luôn giữ ít nhất 1 con (sống hay gục đều được).

import {
  assertOverflowConfirmed,
  capacityOf,
  hasPartyRoom,
  hasStorageRoom,
  returnEquipmentWithinCapacity
} from '../registries'
import { assertNotBond } from '../tamer'
import { assertNotBusy, assertNotLocked } from '../monster'
import { ActionError, malformedAction, parseIdList } from '../shared'
import { TACTICS, type GameData, type GameState, type Monster, type Tactic } from '../model'
import { locateOwned } from './owned'

function requireNoBattle(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
}

function partyIndexOf(state: GameState, monsterId: string): number {
  const index = state.party.findIndex((m) => m.id === monsterId)
  if (index < 0) throw new ActionError('monsterNotInParty', { monsterId })
  return index
}

function storageIndexOf(state: GameState, monsterId: string): number {
  const index = state.storage.findIndex((m) => m.id === monsterId)
  if (index < 0) throw new ActionError('monsterNotInStorage', { monsterId })
  return index
}

function requirePartyCanShrink(state: GameState): void {
  if (state.party.length <= 1) throw new ActionError('partyWouldBeEmpty')
}

export function moveToStorage(data: GameData, state: GameState, monsterId: string): GameState {
  requireNoBattle(state)
  const index = partyIndexOf(state, monsterId)
  requirePartyCanShrink(state)
  // Kho đầy thì không cất thêm (docs/rules/capacity.md); đổi chỗ với quái trong kho vẫn được.
  if (!hasStorageRoom(data, state)) {
    throw new ActionError('rosterFull', { capacity: capacityOf(data, state, 'storage') })
  }
  return {
    ...state,
    party: state.party.filter((_, i) => i !== index),
    storage: [...state.storage, state.party[index]]
  }
}

export function moveToParty(data: GameData, state: GameState, monsterId: string): GameState {
  requireNoBattle(state)
  const index = storageIndexOf(state, monsterId)
  // Quái đang thám hiểm không vào đội được (docs/rules/expeditions.md).
  assertNotBusy(state.storage[index])
  if (!hasPartyRoom(data, state.party, state.storage[index])) {
    throw new ActionError('partyFull', { partySize: data.config.partySize })
  }
  return {
    ...state,
    party: [...state.party, state.storage[index]],
    storage: state.storage.filter((_, i) => i !== index)
  }
}

/** Đổi chỗ một quái trong đội với một quái trong kho; mỗi con nhận vị trí của con kia. */
export function swapWithStorage(
  data: GameData,
  state: GameState,
  partyMonsterId: string,
  storageMonsterId: string
): GameState {
  requireNoBattle(state)
  const partyIndex = partyIndexOf(state, partyMonsterId)
  const storageIndex = storageIndexOf(state, storageMonsterId)
  assertNotBusy(state.storage[storageIndex])
  const party = [...state.party]
  const storage = [...state.storage]
  // Quái lớn chiếm nhiều ô đội hơn (docs/rules/monster-size.md).
  const others = party.filter((_, i) => i !== partyIndex)
  if (!hasPartyRoom(data, others, state.storage[storageIndex])) {
    throw new ActionError('partyFull', { partySize: data.config.partySize })
  }
  party[partyIndex] = state.storage[storageIndex]
  storage[storageIndex] = state.party[partyIndex]
  return { ...state, party, storage }
}

/** Sắp lại thứ tự đội; monsterIds phải là hoán vị đúng của đội hiện tại. */
export function reorderParty(state: GameState, monsterIds: string[]): GameState {
  requireNoBattle(state)
  const current = state.party.map((m) => m.id)
  if (
    !Array.isArray(monsterIds) ||
    monsterIds.length !== current.length ||
    new Set(monsterIds).size !== monsterIds.length ||
    !monsterIds.every((id) => current.includes(id))
  ) {
    throw malformedAction('thứ tự mới phải gồm đúng các quái đang trong đội, mỗi con một lần')
  }
  const byId = new Map(state.party.map((m) => [m.id, m]))
  return { ...state, party: monsterIds.map((id) => byId.get(id) as Monster) }
}

/**
 * Thả quái: xóa vĩnh viễn khỏi đội hoặc kho, không nhận gì; món đang lắp tự về túi. Túi không đủ chỗ
 * thì cần `discardOverflow` (bỏ các món thừa; docs/rules/capacity.md).
 */
export function releaseMonster(
  data: GameData,
  state: GameState,
  { monsterId, discardOverflow }: { monsterId: string; discardOverflow?: boolean }
): GameState {
  return releaseMonsters(data, state, { monsterIds: [monsterId], discardOverflow })
}

/** Quái sẽ bị thả: có trong đội / kho, không phải bản mệnh thú, không khóa, không đang làm việc. */
function releasableMonster(state: GameState, monsterId: string): Monster {
  const inParty = state.party.find((m) => m.id === monsterId)
  const monster = inParty ?? state.storage[storageIndexOf(state, monsterId)]
  // Bản mệnh thú không thả được (đổi bản mệnh trước; docs/rules/tamer.md).
  assertNotBond(monster)
  assertNotLocked(monster)
  if (!inParty) assertNotBusy(monster)
  return monster
}

/**
 * Thả nhiều quái trong một action (thao tác hàng loạt, docs/rules/bulk-actions.md): mọi con cùng
 * luật như thả một con; đội phải còn ít nhất 1 con; món đang lắp của mọi con về túi, phần không vừa
 * cần `discardOverflow`. Một con không thả được thì cả lệnh lỗi, state giữ nguyên.
 */
export function releaseMonsters(
  data: GameData,
  state: GameState,
  { monsterIds, discardOverflow }: { monsterIds: unknown; discardOverflow?: boolean }
): GameState {
  requireNoBattle(state)
  const ids = parseIdList(monsterIds, 'monsterIds')
  const monsters = ids.map((id) => releasableMonster(state, id))
  const released = new Set(ids)
  if (state.party.every((m) => released.has(m.id))) throw new ActionError('partyWouldBeEmpty')
  assertOverflowConfirmed(data, state, { monsters, discardOverflow })
  let inventory = state.inventory
  for (const monster of monsters) {
    inventory = returnEquipmentWithinCapacity(data, state, inventory, monster)
  }
  return {
    ...state,
    party: state.party.filter((m) => !released.has(m.id)),
    storage: state.storage.filter((m) => !released.has(m.id)),
    inventory
  }
}

/** Bật / tắt khóa của quái (đội hoặc kho), ngoài trận, miễn phí; quái đang làm việc cũng đổi được. */
export function setMonsterLocked(
  state: GameState,
  { monsterId, locked }: { monsterId: string; locked: boolean }
): GameState {
  requireNoBattle(state)
  if (typeof locked !== 'boolean') throw malformedAction('locked phải là boolean')
  const { monster, replace } = locateOwned(state, monsterId)
  return monster.locked === locked ? state : replace({ ...monster, locked })
}

/** Bật / tắt yêu thích của quái (chỉ để lọc / sắp xếp), ngoài trận, miễn phí. */
export function setMonsterFavorite(
  state: GameState,
  { monsterId, favorite }: { monsterId: string; favorite: boolean }
): GameState {
  requireNoBattle(state)
  if (typeof favorite !== 'boolean') throw malformedAction('favorite phải là boolean')
  const { monster, replace } = locateOwned(state, monsterId)
  return monster.favorite === favorite ? state : replace({ ...monster, favorite })
}

/** Chuẩn hóa biệt danh: cắt khoảng trắng hai đầu; rỗng thành null. Ném lỗi nếu quá dài. */
export function normalizeNickname(data: GameData, nickname: string | null): string | null {
  if (nickname === null) return null
  if (typeof nickname !== 'string') throw malformedAction('biệt danh phải là chuỗi')
  const trimmed = nickname.trim()
  if (trimmed === '') return null
  // Đếm theo ký tự Unicode (tiếng Việt có dấu, emoji) chứ không theo đơn vị UTF-16.
  if ([...trimmed].length > data.config.maxNicknameLength) {
    throw new ActionError('nicknameTooLong', { maxLength: data.config.maxNicknameLength })
  }
  return trimmed
}

export function renameMonster(
  data: GameData,
  state: GameState,
  monsterId: string,
  nickname: string | null
): GameState {
  requireNoBattle(state)
  const normalized = normalizeNickname(data, nickname)
  const rename = (m: Monster): Monster => (m.id === monsterId ? { ...m, nickname: normalized } : m)
  if (state.party.some((m) => m.id === monsterId)) {
    return { ...state, party: state.party.map(rename) }
  }
  storageIndexOf(state, monsterId)
  return { ...state, storage: state.storage.map(rename) }
}

/** Đổi chiến thuật tự đánh của quái (ngoài trận, ở đâu cũng được; docs/rules/auto-battle.md). */
export function setTactic(state: GameState, monsterId: string, tactic: Tactic): GameState {
  if (!(TACTICS as readonly unknown[]).includes(tactic)) {
    throw malformedAction(`chiến thuật lạ: ${String(tactic)}`)
  }
  requireNoBattle(state)
  const { monster, replace } = locateOwned(state, monsterId)
  return replace({ ...monster, tactic })
}
