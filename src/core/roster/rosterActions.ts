// Action quản lý quái: chuyển giữa đội và kho, sắp xếp đội, thả, đặt biệt danh.
// Chỉ dùng ngoài trận. Đội luôn giữ ít nhất 1 con (sống hay gục đều được).

import { hasPartyRoom } from '../registries'
import { assertNotBond } from '../tamer'
import { assertNotBusy } from '../monster'
import { ActionError, malformedAction } from '../shared'
import { returnEquipment } from '../inventory'
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

export function moveToStorage(state: GameState, monsterId: string): GameState {
  requireNoBattle(state)
  const index = partyIndexOf(state, monsterId)
  requirePartyCanShrink(state)
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

/** Thả quái: xóa vĩnh viễn khỏi đội hoặc kho, không nhận gì; món đang lắp tự về túi. */
export function releaseMonster(state: GameState, monsterId: string): GameState {
  requireNoBattle(state)
  const inParty = state.party.find((m) => m.id === monsterId)
  // Bản mệnh thú không thả được (đổi bản mệnh trước; docs/rules/tamer.md).
  const target = inParty ?? state.storage.find((m) => m.id === monsterId)
  if (target) assertNotBond(target)
  if (inParty) {
    requirePartyCanShrink(state)
    return {
      ...state,
      party: state.party.filter((m) => m.id !== monsterId),
      inventory: returnEquipment(state.inventory, inParty)
    }
  }
  const monster = state.storage[storageIndexOf(state, monsterId)]
  assertNotBusy(monster)
  return {
    ...state,
    storage: state.storage.filter((m) => m.id !== monsterId),
    inventory: returnEquipment(state.inventory, monster)
  }
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
