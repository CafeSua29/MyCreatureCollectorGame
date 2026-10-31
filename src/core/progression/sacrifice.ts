// Hiến tế (NPC fusing ở thị trấn, docs/rules/sacrifice.md): quái phụ hiến mình, quái chính nhận
// stack hiến tế (+% mọi chỉ số, tuyến tính). Khác fuse: không đổi loài / trait / ô, không thất bại,
// chỉ cần cùng race và cùng lineage. Hiến tế hàng loạt: nhiều quái phụ trong một action, mỗi con
// tính như một lần (stack, giá, độ thuần cộng dồn theo thứ tự).

import { assertNotBond } from '../tamer'
import { ActionError, levelCost, malformedAction, spendMoney, type Decimal } from '../shared'
import { addMilestone, assertNotBusy, sacrificeBloodlines, soulFuseRefund } from '../monster'
import { addSoulCrystalPoints } from '../inventory'
import { assertOverflowConfirmed, returnEquipmentWithinCapacity } from '../registries'
import { dayOf, type GameData, type GameState, type Monster } from '../model'

/**
 * Giá hiến tế các quái phụ vào quái chính: mỗi con costPerLevel × (level chính + level phụ), cộng
 * dồn (level quái chính không đổi khi hiến tế).
 */
export function sacrificeCost(data: GameData, base: Monster, subs: readonly Monster[]): Decimal {
  const totalLevel = subs.reduce((sum, sub) => sum + base.level + sub.level, 0)
  return levelCost(data.config.sacrifice.costPerLevel, totalLevel)
}

/** Hai quái hiến tế được cho nhau: cùng race và lineage y hệt (so như tập hợp loài). */
export function canSacrificeTo(base: Monster, sub: Monster): boolean {
  if (base.raceId !== sub.raceId) return false
  const baseLineage = new Set(base.lineage)
  const subLineage = new Set(sub.lineage)
  return baseLineage.size === subLineage.size && [...subLineage].every((id) => baseLineage.has(id))
}

/**
 * Quái chính sau khi nhận một quái phụ (không kiểm tra điều kiện): stack += stack phụ + 1, cộng
 * sacrificePurityPercent % độ thuần của quái phụ. Stack vượt số nguyên an toàn thì báo lỗi.
 */
export function absorbSacrifice(data: GameData, base: Monster, sub: Monster): Monster {
  const sacrificeStacks = base.sacrificeStacks + sub.sacrificeStacks + 1
  if (!Number.isSafeInteger(sacrificeStacks)) {
    throw new ActionError('sacrificeStackLimit', { max: Number.MAX_SAFE_INTEGER })
  }
  return { ...base, sacrificeStacks, bloodlines: sacrificeBloodlines(data, base, sub) }
}

/** Lệnh hiến tế: quái chính và danh sách quái phụ (ít nhất 1, không trùng). */
export interface SacrificeOrder {
  baseId: string
  subIds: readonly string[]
  /** Xác nhận bỏ món đang lắp không đủ chỗ về túi (docs/rules/capacity.md). */
  discardOverflow?: boolean
}

/** Đọc danh sách id quái phụ: mảng chuỗi khác rỗng, không trùng, không chứa quái chính. */
function parseSubIds(order: SacrificeOrder): string[] {
  const { subIds } = order
  if (!Array.isArray(subIds) || subIds.length === 0) {
    throw malformedAction('subIds phải là mảng id quái phụ khác rỗng')
  }
  if (!subIds.every((id): id is string => typeof id === 'string')) {
    throw malformedAction('subIds chỉ chứa id quái')
  }
  if (new Set(subIds).size !== subIds.length) throw malformedAction('subIds có id trùng')
  if (subIds.includes(order.baseId)) throw new ActionError('sacrificeSameMonster')
  return [...subIds]
}

/** Quái người chơi sở hữu (đội / kho), không đang làm việc. */
function findOwned(state: GameState, monsterId: string): Monster {
  const monster =
    state.party.find((m) => m.id === monsterId) ?? state.storage.find((m) => m.id === monsterId)
  if (!monster) throw new ActionError('monsterNotOwned', { monsterId })
  assertNotBusy(monster)
  return monster
}

/** NPC fusing ở thị trấn: hiến tế một hoặc nhiều quái phụ vào quái chính. */
export function sacrifice(data: GameData, state: GameState, order: SacrificeOrder): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const subIds = parseSubIds(order)
  let base = findOwned(state, order.baseId)
  const subs = subIds.map((id) => findOwned(state, id))
  for (const sub of subs) {
    // Bản mệnh thú không làm quái phụ (docs/rules/tamer.md mục "Bản mệnh thú").
    assertNotBond(sub)
    if (!canSacrificeTo(base, sub)) {
      throw new ActionError('sacrificeMismatch', { baseId: base.id, subId: sub.id })
    }
  }
  if (state.party.every((m) => subIds.includes(m.id))) throw new ActionError('partyWouldBeEmpty')
  assertOverflowConfirmed(data, state, { monsters: subs, discardOverflow: order.discardOverflow })

  const paid = spendMoney(state, sacrificeCost(data, base, subs))
  let inventory = paid.inventory
  for (const sub of subs) {
    base = absorbSacrifice(data, base, sub)
    // Món trên quái phụ về túi, hoàn một phần hồn tinh đã dùng như quái phụ của fuse
    // (docs/rules/soul-levels.md).
    inventory = returnEquipmentWithinCapacity(data, state, inventory, sub)
    inventory = addSoulCrystalPoints(data, inventory, soulFuseRefund(data, sub))
  }
  base = addMilestone(data, base, {
    day: dayOf(state.time),
    kind: 'sacrificed',
    count: subs.length
  })
  const update = (monsters: Monster[]): Monster[] =>
    monsters.flatMap((m) => {
      if (subIds.includes(m.id)) return []
      return m.id === base.id ? [base] : [m]
    })
  return { ...paid, inventory, party: update(state.party), storage: update(state.storage) }
}
