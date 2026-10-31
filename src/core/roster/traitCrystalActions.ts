// NPC tinh thể trait ở thị trấn (docs/rules/trait-crystals.md): extract lấy nguyên cả trait khỏi
// quái thành tinh thể trong túi, inject dùng tinh thể lên quái (gộp cấp / ô trống / loại trừ thì bỏ
// cả hai). Thu tiền ở cả hai bước theo cấp và loại trait, không phụ thuộc level quái.

import { ActionError, malformedAction, spendMoney } from '../shared'
import {
  addCrystals,
  crystalExtractCost,
  crystalInjectCost,
  getCrystalCount,
  parseItemRef,
  removeCrystals
} from '../inventory'
import { assertNotBusy, mergeTraitLevel, usedTraitSlots } from '../monster'
import { hasCrystal, type GameData, type GameState, type Monster } from '../model'
import { locateOwned } from './owned'

/** NPC ở thị trấn, ngoài trận. */
function assertAtCrystalNpc(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
}

/**
 * Extract: quái (đội / kho, không đang làm việc) mất trait `traitId` đủ cấp, túi nhận một tinh thể
 * cùng trait + cấp; trả crystalExtractCost. Chỉ trait loại có tinh thể (hasCrystal).
 */
export function extractTrait(
  data: GameData,
  state: GameState,
  { monsterId, traitId }: { monsterId: string; traitId: string }
): GameState {
  assertAtCrystalNpc(state)
  const { monster } = locateOwned(state, monsterId)
  assertNotBusy(monster)
  const trait = monster.traits.find((entry) => entry.id === traitId)
  if (!trait) throw new ActionError('traitNotOnMonster', { monsterId, traitId })
  const { kind } = data.traits[traitId]
  if (!hasCrystal(kind)) throw new ActionError('traitNotExtractable', { traitId, kind })
  const paid = spendMoney(state, crystalExtractCost(data, traitId, trait.level))
  const extracted = locateOwned(paid, monsterId).replace({
    ...monster,
    traits: monster.traits.filter((entry) => entry.id !== traitId)
  })
  const crystal = { traitId, level: trait.level }
  return { ...extracted, inventory: addCrystals(extracted.inventory, crystal, 1) }
}

/** Kết quả gắn trait của tinh thể lên quái và cấp dùng để tính giá. */
function injectInto(
  data: GameData,
  monster: Monster,
  { traitId, level }: { traitId: string; level: number }
): { monster: Monster; costLevel: number } {
  const existing = monster.traits.find((entry) => entry.id === traitId)
  if (existing) {
    const levelAfter = existing.level + level
    if (!Number.isSafeInteger(levelAfter)) {
      throw new ActionError('traitLevelLimit', { traitId, max: Number.MAX_SAFE_INTEGER })
    }
    return { monster: mergeTraitLevel(monster, traitId, level), costLevel: levelAfter }
  }
  // Loại trừ với một trait đang có: bỏ cả hai như luật fuse (không cần ô trống).
  const group = data.traits[traitId].exclusiveGroup
  const clash = monster.traits.find(
    (entry) => group !== undefined && data.traits[entry.id].exclusiveGroup === group
  )
  if (clash) {
    const traits = monster.traits.filter((entry) => entry.id !== clash.id)
    return { monster: { ...monster, traits }, costLevel: level }
  }
  if (usedTraitSlots(data, monster) >= monster.traitSlots) {
    throw new ActionError('traitSlotsFull', { monsterId: monster.id, slots: monster.traitSlots })
  }
  return { monster: mergeTraitLevel(monster, traitId, level), costLevel: level }
}

/**
 * Inject: tiêu một tinh thể lên quái (đội / kho, không đang làm việc). Đã có trait cùng id thì gộp
 * cấp; loại trừ với trait đang có thì bỏ cả hai; còn lại cần ô trống. Trả crystalInjectCost theo
 * cấp sau khi gộp (bỏ cả hai: cấp tinh thể).
 */
export function injectTrait(
  data: GameData,
  state: GameState,
  { monsterId, item }: { monsterId: string; item: unknown }
): GameState {
  assertAtCrystalNpc(state)
  const ref = parseItemRef(data, item)
  if (ref.storage !== 'crystal') {
    throw malformedAction('định danh phải là tinh thể trait (storage "crystal")')
  }
  const key = { traitId: ref.traitId, level: ref.level }
  const have = getCrystalCount(state.inventory, key)
  if (have < 1) throw new ActionError('notEnoughCrystals', { ...key, have, need: 1 })
  const { monster } = locateOwned(state, monsterId)
  assertNotBusy(monster)
  const injected = injectInto(data, monster, key)
  const paid = spendMoney(state, crystalInjectCost(data, key.traitId, injected.costLevel))
  const next = locateOwned(paid, monsterId).replace(injected.monster)
  return { ...next, inventory: removeCrystals(next.inventory, key, 1) }
}
