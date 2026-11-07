// Sức chứa kho quái và túi trang bị (docs/rules/capacity.md). Điểm DUY NHẤT trả lời "kho / túi chứa
// được bao nhiêu, còn chỗ không": nơi nhận quái / trang bị gọi các hàm ở đây, không tự đếm.

import { ActionError, countMilestonesReached, toBig, type Decimal } from '../shared'
import { addSticker, returnEquippedItem } from '../inventory'
import {
  bestRealmReached,
  type CapacityKind,
  type GameData,
  type GameState,
  type Inventory,
  type Monster
} from '../model'
import { partyAfterJoining, partySlotsUsed } from './size'

type CapacityHolder = Pick<GameState, 'capacity' | 'tamer' | 'ascension'>

/**
 * Sức chứa hiện tại: base + perExpansion × số lần đã mở rộng + realmBonus × số mốc cảnh giới đã đạt
 * (không gian ngự thú; theo cảnh giới cao nhất từng đạt nên phi thăng không làm giảm sức chứa).
 */
export function capacityOf(data: GameData, state: CapacityHolder, kind: CapacityKind): number {
  const rule = data.config.capacity[kind]
  const milestones = countMilestonesReached(
    data.config.tamer.realmMilestones,
    bestRealmReached(state)
  )
  return rule.base + rule.perExpansion * state.capacity[kind] + rule.realmBonus * milestones
}

/**
 * Số chỗ túi trang bị đang dùng: món trong túi + hồn phách + khí linh trong kho khí linh
 * (docs/rules/artifact-spirits.md) + sticker (docs/rules/skill-stickers.md); món đang lắp, sticker
 * đang dán không tính.
 */
export const bagUsed = (
  inventory: Pick<Inventory, 'equipment' | 'souls' | 'spirits' | 'stickers'>
): number =>
  inventory.equipment.length +
  inventory.souls.length +
  inventory.spirits.length +
  inventory.stickers.length

/** Số chỗ túi còn trống (âm = đang vượt sức chứa, chỉ xảy ra khi đồ tự về túi lúc quái chết hẳn). */
export const bagFreeSlots = (
  data: GameData,
  state: CapacityHolder & Pick<GameState, 'inventory'>
): number => capacityOf(data, state, 'bag') - bagUsed(state.inventory)

/** Túi còn chỗ cho `count` món trang bị mới không. */
export const hasBagRoom = (
  data: GameData,
  state: CapacityHolder & Pick<GameState, 'inventory'>,
  count = 1
): boolean => bagFreeSlots(data, state) >= count

/** Ném bagFull nếu túi trang bị không còn chỗ cho một món mới (mua, tháo, đúc). */
export function assertBagRoom(
  data: GameData,
  state: CapacityHolder & Pick<GameState, 'inventory'>
): void {
  if (!hasBagRoom(data, state)) {
    throw new ActionError('bagFull', { capacity: capacityOf(data, state, 'bag') })
  }
}

/** Số món trang bị (bản riêng) đang lắp và sticker đang dán trên quái: chiếm chỗ túi nếu về túi. */
export const equippedInstanceCount = (monsters: readonly Monster[]): number =>
  monsters.reduce(
    (total, monster) =>
      total +
      monster.equipment.filter((entry) => entry.storage === 'instance').length +
      Object.keys(monster.skillStickers).length,
    0
  )

/**
 * Số món sẽ mất nếu trả về túi mọi món đang lắp của các quái này (0 = đủ chỗ). Nơi gọi: action làm
 * mất quái theo ý người chơi (thả, quái phụ fuse / hiến tế, cấy ghép có thể mất quái) phải được người
 * chơi xác nhận khi > 0.
 */
export function equipmentOverflow(
  data: GameData,
  state: CapacityHolder & Pick<GameState, 'inventory'>,
  monsters: readonly Monster[]
): number {
  return Math.max(0, equippedInstanceCount(monsters) - Math.max(0, bagFreeSlots(data, state)))
}

/**
 * Còn chỗ cho quái `newcomer` không, khi các quái `pending` (bắt / thu phục trong trận, chưa vào đội
 * / kho) đã chiếm chỗ trước: vào đội nếu đủ ô, không thì vào kho nếu kho chưa đầy.
 */
export function hasRosterRoom(
  data: GameData,
  state: CapacityHolder & Pick<GameState, 'party' | 'storage'>,
  { pending = [], newcomer }: { pending?: readonly Monster[]; newcomer: Monster }
): boolean {
  const incoming = [...pending, newcomer]
  const joined = partyAfterJoining(data, state.party, incoming)
  const toStorage = incoming.length - (joined.length - state.party.length)
  return state.storage.length + toStorage <= capacityOf(data, state, 'storage')
}

/** Còn chỗ cho ít nhất một quái (kho chưa đầy hoặc đội còn ô): vào khu bảo tồn. */
export const canReceiveMonster = (
  data: GameData,
  state: CapacityHolder & Pick<GameState, 'party' | 'storage'>
): boolean =>
  hasStorageRoom(data, state) || partySlotsUsed(data, state.party) < data.config.partySize

/** Kho còn chỗ cho một quái nữa (moveToStorage). */
export const hasStorageRoom = (
  data: GameData,
  state: CapacityHolder & Pick<GameState, 'storage'>
): boolean => state.storage.length < capacityOf(data, state, 'storage')

/** Giá lần mở rộng kế tiếp (lần thứ k = số lần đã mở + 1): costBase × k². */
export function capacityExpandCost(
  data: GameData,
  state: CapacityHolder,
  kind: CapacityKind
): Decimal {
  const next = state.capacity[kind] + 1
  return toBig(data.config.capacity[kind].costBase).times(next).times(next)
}

/**
 * Action làm mất quái theo ý người chơi: món đang lắp trên các quái có thể mất không đủ chỗ về túi
 * thì phải có xác nhận `discardOverflow`, không thì ném bagOverflow (state giữ nguyên).
 */
export function assertOverflowConfirmed(
  data: GameData,
  state: CapacityHolder & Pick<GameState, 'inventory'>,
  { monsters, discardOverflow }: { monsters: readonly Monster[]; discardOverflow?: boolean }
): void {
  const lost = equipmentOverflow(data, state, monsters)
  if (lost > 0 && discardOverflow !== true) throw new ActionError('bagOverflow', { lost })
}

/**
 * Trả món đang lắp và sticker đang dán của quái về túi trong giới hạn sức chứa (đồ gộp chồng luôn
 * về): món trang bị / sticker không còn chỗ thì mất (đã được xác nhận trước bằng assertOverflowConfirmed).
 */
export function returnEquipmentWithinCapacity(
  data: GameData,
  holder: CapacityHolder,
  inventory: Inventory,
  monster: Monster
): Inventory {
  const capacity = capacityOf(data, holder, 'bag')
  const withEquipment = monster.equipment.reduce(
    (current, entry) =>
      entry.storage === 'instance' && bagUsed(current) >= capacity
        ? current
        : returnEquippedItem(current, entry),
    inventory
  )
  return Object.values(monster.skillStickers).reduce(
    (current, sticker) => (bagUsed(current) >= capacity ? current : addSticker(current, sticker)),
    withEquipment
  )
}

/** Sức chứa cho UI: đang dùng, tối đa, giá lần mở rộng kế tiếp của từng loại. */
export type CapacityView = Record<
  CapacityKind,
  { used: number; capacity: number; nextCost: Decimal }
>

/** Sức chứa hiện tại của kho quái (không tính đội) và túi trang bị (món + hồn phách + khí linh). */
export function capacityView(
  data: GameData,
  state: CapacityHolder & Pick<GameState, 'storage' | 'inventory'>
): CapacityView {
  const view = (kind: CapacityKind, used: number): CapacityView[CapacityKind] => ({
    used,
    capacity: capacityOf(data, state, kind),
    nextCost: capacityExpandCost(data, state, kind)
  })
  return {
    storage: view('storage', state.storage.length),
    bag: view('bag', bagUsed(state.inventory))
  }
}
