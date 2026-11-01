// NPC Thợ rèn ở thị trấn (docs/rules/equipment-forge.md): cường hóa, tẩy luyện, phân giải, đúc trang
// bị, phụ linh. Cường hóa / tẩy luyện / phụ linh được cả món trong túi lẫn món đang lắp trên quái (đội
// hoặc kho); phân giải chỉ món trong túi (khí linh đã thu phục về kho khí linh). Cường hóa, đúc, phụ
// linh cộng exp luyện khí (alchemy.md).

import { assertBagRoom, bagUsed, bumpStat, capacityOf } from '../registries'
import { ActionError, malformedAction, rollPercent, spendMoney, toBig } from '../shared'
import {
  addEquipment,
  addItems,
  addSoulCrystalPoints,
  applyImbue,
  castMoney,
  castRarityWeights,
  enhanceCost,
  equipmentInstanceId,
  findEquipmentItem,
  findWearer,
  imbueCoreItemId,
  imbueCost,
  isAffixRoll,
  isRandomEquipment,
  removeGroupItems,
  removeItems,
  rerollAffixes,
  rerollCost,
  rollEquipment,
  rollRarity,
  salvageYield,
  spiritsOf,
  takeEquipment
} from '../inventory'
import { craftLevel, gainCraftExp, requireCraftLevel } from '../progression'
import type { EquipmentInstance, GameData, GameState } from '../model'
import { locateEquipment } from './locateEquipment'

/** Thợ rèn ở thị trấn, ngoài trận. */
function assertAtForge(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
}

const requireInstanceId = (instanceId: unknown): string => {
  if (typeof instanceId !== 'string') throw malformedAction('instanceId phải là chuỗi')
  return instanceId
}

/**
 * Cường hóa món cấp n → n + 1 (luôn thành công, không trần): tốn tiền, n Đá cường hóa và ở cấp cao
 * thêm yêu đan bất kỳ (nhóm coreEnhance.groupId); + exp luyện khí.
 */
export function enhanceEquipment(data: GameData, state: GameState, instanceId: unknown): GameState {
  assertAtForge(state)
  const { instance, replace } = locateEquipment(state, requireInstanceId(instanceId))
  const forge = data.config.forge
  const cost = enhanceCost(data, instance)
  let inventory = removeItems(state.inventory, forge.enhanceStoneItemId, cost.stones)
  if (cost.cores > 0) {
    inventory = removeGroupItems(data, inventory, forge.coreEnhance.groupId, cost.cores)
  }
  const paid = spendMoney({ ...state, inventory }, cost.money)
  const enhanced = replace(paid, { ...instance, level: instance.level + 1 })
  return gainCraftExp(data, enhanced, { station: 'smithing', exp: toBig(forge.enhanceExp) })
}

/** Yêu đan của hệ phụ linh được; hệ lạ / không phụ linh được thì elementNotImbuable. */
function requireImbueCore(
  data: GameData,
  elementId: unknown
): { elementId: string; coreId: string } {
  if (typeof elementId !== 'string') throw malformedAction('elementId phải là chuỗi')
  const coreId = imbueCoreItemId(data, elementId)
  if (coreId === null) throw new ActionError('elementNotImbuable', { elementId })
  return { elementId, coreId }
}

/**
 * Đúc trang bị (luyện khí): món gốc thường (không unique, không hồn khí) cấp 1, bỏ vào `cores` yêu đan
 * **cùng hệ** `elementId` (1 … maxCores) và cast.money × tầng cao nhất tiền. Bậc tung theo
 * castRarityWeights (nhiều yêu đan, cấp luyện khí cao thì dễ ra bậc hiếm) và tầng cao nhất; món đúc
 * mang sẵn dòng linh hệ của hệ đó (như phụ linh). Luôn thành công.
 */
export function castEquipment(
  data: GameData,
  state: GameState,
  { itemId, elementId, cores }: { itemId: unknown; elementId: unknown; cores: unknown }
): GameState {
  assertAtForge(state)
  const cast = data.config.forge.cast
  if (typeof itemId !== 'string') throw malformedAction('itemId phải là chuỗi')
  if (
    typeof cores !== 'number' ||
    !Number.isSafeInteger(cores) ||
    cores < 1 ||
    cores > cast.maxCores
  ) {
    throw malformedAction(`cores phải là số nguyên từ 1 tới ${cast.maxCores}`)
  }
  const core = requireImbueCore(data, elementId)
  const item = findEquipmentItem(data, itemId)
  if (!item || !isRandomEquipment(item)) throw new ActionError('notCastable', { itemId })
  requireCraftLevel(state, 'smithing', cast.minLevel)
  const inventory = removeItems(state.inventory, core.coreId, cores)
  assertBagRoom(data, state)
  const paid = spendMoney({ ...state, inventory }, castMoney(data, state.highestFloor))
  const weights = castRarityWeights(data, { cores, level: craftLevel(state, 'smithing') })
  const [rarity, afterRarity] = rollRarity(data, paid.rng, weights, state.highestFloor)
  const id = equipmentInstanceId(paid.nextItemId)
  const [rolled, afterRoll] = rollEquipment(data, afterRarity, { itemId, rarity, id })
  const [instance, rng] = applyImbue(data, afterRoll, {
    instance: rolled,
    elementId: core.elementId
  })
  const forged = {
    ...paid,
    rng,
    nextItemId: paid.nextItemId + 1,
    inventory: addEquipment(paid.inventory, instance),
    // Đúc trang bị tính một món luyện khí cho thành tựu (docs/rules/achievements.md).
    stats: bumpStat(paid.stats, 'itemsForged')
  }
  return gainCraftExp(data, forged, { station: 'smithing', exp: toBig(cast.exp) })
}

/**
 * Phụ linh: gắn (hoặc thay) dòng linh hệ `elementId` lên món trong túi hoặc đang lắp (mọi món, kể cả
 * unique, hồn khí): tốn imbue.cores[bậc] yêu đan cùng hệ + imbue.money × tầng cao nhất tiền, tung lại
 * giá trị trong khoảng của bậc; + exp luyện khí.
 */
export function imbueEquipment(
  data: GameData,
  state: GameState,
  { instanceId, elementId }: { instanceId: unknown; elementId: unknown }
): GameState {
  assertAtForge(state)
  const core = requireImbueCore(data, elementId)
  const { instance, replace } = locateEquipment(state, requireInstanceId(instanceId))
  const cost = imbueCost(data, instance, state.highestFloor)
  const inventory =
    cost.cores > 0 ? removeItems(state.inventory, core.coreId, cost.cores) : state.inventory
  const paid = spendMoney({ ...state, inventory }, cost.money)
  const [imbued, rng] = applyImbue(data, paid.rng, { instance, elementId: core.elementId })
  const done = replace({ ...paid, rng }, imbued)
  const exp = toBig(data.config.forge.imbue.exp)
  return gainCraftExp(data, done, { station: 'smithing', exp })
}

/**
 * Tẩy luyện: tung lại mọi dòng phụ không khóa (loại dòng và giá trị), tốn (1 + số dòng khóa) ×
 * rerollCost[bậc] Tẩy luyện thạch. Dòng chính, dòng unique, dòng hồn không tẩy và không khóa được.
 */
export function rerollEquipmentAffixes(
  data: GameData,
  state: GameState,
  { instanceId, lockedLineIndexes = [] }: { instanceId: unknown; lockedLineIndexes?: unknown }
): GameState {
  assertAtForge(state)
  const id = requireInstanceId(instanceId)
  const { instance, replace } = locateEquipment(state, id)
  const item = findEquipmentItem(data, instance.baseItemId)
  if (!item) throw new Error(`Vật phẩm "${instance.baseItemId}" không phải trang bị`)
  const locked = parseLockedIndexes(lockedLineIndexes, instance)
  for (const lineIndex of locked) {
    if (!isAffixRoll(data, item, instance.rolls[lineIndex])) {
      throw new ActionError('lineNotRerollable', { instanceId: id, lineIndex })
    }
  }
  const indexes = instance.rolls.flatMap((roll, index) =>
    isAffixRoll(data, item, roll) && !locked.includes(index) ? [index] : []
  )
  if (indexes.length === 0) throw new ActionError('nothingToReroll', { instanceId: id })
  const cost = rerollCost(data, instance, locked.length)
  const inventory = removeItems(state.inventory, data.config.forge.refiningStoneItemId, cost)
  const [rerolled, rng] = rerollAffixes(data, state.rng, instance, indexes)
  return replace({ ...state, inventory, rng }, rerolled)
}

/** Danh sách vị trí dòng khóa: số nguyên trong phạm vi dòng của món, không trùng. */
function parseLockedIndexes(value: unknown, instance: EquipmentInstance): number[] {
  if (!Array.isArray(value)) throw malformedAction('lockedLineIndexes phải là danh sách')
  for (const index of value) {
    if (
      typeof index !== 'number' ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= instance.rolls.length
    ) {
      throw malformedAction(`dòng khóa ${String(index)} không có trên món`)
    }
  }
  // Đã kiểm tra mọi phần tử là số nguyên trong phạm vi.
  const indexes = value as number[]
  if (new Set(indexes).size !== indexes.length) throw malformedAction('dòng khóa bị trùng')
  return indexes
}

/**
 * Phân giải các món trong túi (hàng loạt): mỗi món ra Đá cường hóa (kèm hoàn đá đã cường hóa), tung
 * tỉ lệ ra 1 Tẩy luyện thạch, hồn khí thêm hồn tinh. Món đang lắp phải tháo trước.
 */
export function salvageEquipment(
  data: GameData,
  state: GameState,
  instanceIds: unknown
): GameState {
  assertAtForge(state)
  const ids = parseInstanceIds(instanceIds)
  let inventory = state.inventory
  let rng = state.rng
  const { enhanceStoneItemId, refiningStoneItemId } = data.config.forge
  for (const id of ids) {
    const worn = findWearer(state, id)
    if (worn) {
      throw new ActionError('equipmentEquipped', { instanceId: id, monsterId: worn.monster.id })
    }
    let instance: EquipmentInstance
    ;[instance, inventory] = takeEquipment(inventory, id)
    const gained = salvageYield(data, instance)
    if (gained.enhanceStones > 0) {
      inventory = addItems(inventory, enhanceStoneItemId, gained.enhanceStones)
    }
    let refined: boolean
    ;[refined, rng] = rollPercent(rng, gained.refiningChance)
    if (refined) inventory = addItems(inventory, refiningStoneItemId, 1)
    inventory = addSoulCrystalPoints(data, inventory, gained.soulPoints)
    // Khí linh đã thu phục về kho khí linh, dã linh mất (docs/rules/artifact-spirits.md).
    const subdued = spiritsOf(instance).filter((spirit) => spirit.subdued)
    inventory = { ...inventory, spirits: [...inventory.spirits, ...subdued] }
  }
  assertSalvageFits(data, state, inventory)
  return { ...state, inventory, rng }
}

/**
 * Khí linh về kho làm túi tăng chỗ dùng quá sức chứa (phân giải món nhiều khí linh) thì chặn bằng
 * bagFull (state giữ nguyên), như mọi cách nhận đồ theo ý người chơi.
 */
function assertSalvageFits(data: GameData, state: GameState, after: GameState['inventory']): void {
  const used = bagUsed(after)
  const capacity = capacityOf(data, state, 'bag')
  if (used > capacity && used > bagUsed(state.inventory)) {
    throw new ActionError('bagFull', { capacity })
  }
}

/** Danh sách id món: ít nhất một, mỗi id là chuỗi, không trùng. */
function parseInstanceIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw malformedAction('instanceIds phải là danh sách có ít nhất một id')
  }
  if (!value.every((id) => typeof id === 'string')) {
    throw malformedAction('instanceIds chỉ gồm chuỗi')
  }
  // Đã kiểm tra mọi phần tử là chuỗi.
  const ids = value as string[]
  if (new Set(ids).size !== ids.length) throw malformedAction('instanceIds bị trùng')
  return ids
}
