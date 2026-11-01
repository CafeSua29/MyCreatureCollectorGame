// NPC Khí Linh Các ở thị trấn (docs/rules/artifact-spirits.md): triệu khí linh bằng Dẫn Hồn Châu, di
// dời / gộp / nuôi khí linh (trong kho khí linh hoặc trên món trong túi / đang lắp), phối linh ở
// Linh trì và nhận khí linh kép. Khí giới bí cảnh ở battle/itemWorld.ts.

import { assertBagRoom, hasBagRoom, capacityOf } from '../registries'
import { ActionError, assertNever, malformedAction, spendMoney } from '../shared'
import {
  breedSpiritPair,
  hasSameSpiritTypes,
  removeGroupItems,
  removeItems,
  rollRarity,
  rollSpirit,
  spiritMoveCost,
  spiritSlotCount,
  spiritsOf,
  takeSoul,
  withSpirits
} from '../inventory'
import {
  dayOf,
  type ArtifactSpirit,
  type GameData,
  type GameState,
  type SpiritDestination,
  type SpiritFood,
  type SpiritLocation
} from '../model'
import { locateEquipment } from './locateEquipment'

/** Số khí linh nhận về kho khi lấy một cặp ở Linh trì: khí linh kép + hai khí linh gốc. */
const POOL_RETURN_COUNT = 3

/** Khí Linh Các ở thị trấn, ngoài trận. */
function assertAtPavilion(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
}

/** Một nơi chứa khí linh (kho hoặc một món) và hàm thay danh sách khí linh của nó. */
interface SpiritHolder {
  instanceId: string | null
  spirits: readonly ArtifactSpirit[]
  /** Số ô (kho: không giới hạn riêng, theo sức chứa túi). */
  slots: number | null
  replace: (state: GameState, spirits: readonly ArtifactSpirit[]) => GameState
}

/** Kho khí linh hoặc món trang bị (trong túi / đang lắp; không có thì equipmentNotFound). */
function holderOf(data: GameData, state: GameState, destination: SpiritDestination): SpiritHolder {
  if (destination.kind === 'storage') {
    return {
      instanceId: null,
      spirits: state.inventory.spirits,
      slots: null,
      replace: (s, spirits) => ({ ...s, inventory: { ...s.inventory, spirits: [...spirits] } })
    }
  }
  const { instance, replace } = locateEquipment(state, destination.instanceId)
  return {
    instanceId: instance.id,
    spirits: spiritsOf(instance),
    slots: spiritSlotCount(data, instance),
    replace: (s, spirits) => replace(s, withSpirits(instance, spirits))
  }
}

/** Khí linh ở vị trí `location` kèm nơi chứa nó; không có thì spiritNotFound. */
function spiritAt(
  data: GameData,
  state: GameState,
  location: SpiritLocation
): { holder: SpiritHolder; spirit: ArtifactSpirit } {
  const holder = holderOf(data, state, location)
  const spirit = holder.spirits[location.index]
  if (!spirit) {
    throw new ActionError('spiritNotFound', {
      instanceId: holder.instanceId,
      index: location.index
    })
  }
  return { holder, spirit }
}

/** Như spiritAt nhưng khí linh phải đã thu phục (spiritNotSubdued). */
function subduedSpiritAt(
  data: GameData,
  state: GameState,
  location: SpiritLocation
): { holder: SpiritHolder; spirit: ArtifactSpirit } {
  const found = spiritAt(data, state, location)
  if (!found.spirit.subdued) {
    throw new ActionError('spiritNotSubdued', {
      instanceId: found.holder.instanceId,
      index: location.index
    })
  }
  return found
}

const isIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Nơi chuyển tới: { kind: 'storage' } hoặc { kind: 'equipment', instanceId }. */
function parseDestination(value: unknown): SpiritDestination {
  const object =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  if (object.kind === 'storage') return { kind: 'storage' }
  if (object.kind === 'equipment' && typeof object.instanceId === 'string') {
    return { kind: 'equipment', instanceId: object.instanceId }
  }
  throw malformedAction('nơi chứa khí linh phải là kho hoặc { kind: equipment, instanceId }')
}

/** Vị trí khí linh: nơi chứa + index nguyên ≥ 0. */
function parseLocation(value: unknown): SpiritLocation {
  const destination = parseDestination(value)
  const index = (value as { index?: unknown }).index
  if (!isIndex(index)) throw malformedAction('index khí linh phải là số nguyên ≥ 0')
  return { ...destination, index }
}

const sameHolder = (a: SpiritDestination, b: SpiritDestination): boolean =>
  a.kind === 'storage'
    ? b.kind === 'storage'
    : b.kind === 'equipment' && a.instanceId === b.instanceId

/**
 * Triệu khí linh: tiêu một Dẫn Hồn Châu, khí linh ngẫu nhiên đã thu phục vào kho khí linh; value
 * theo bậc tung bằng summon.rarityWeights × hệ số bậc theo tầng cao nhất (như đồ rơi).
 */
export function summonSpirit(data: GameData, state: GameState): GameState {
  assertAtPavilion(state)
  const { summon } = data.config.artifactSpirits
  const inventory = removeItems(state.inventory, summon.orbItemId, 1)
  assertBagRoom(data, state)
  const [rarity, afterRarity] = rollRarity(
    data,
    state.rng,
    summon.rarityWeights,
    state.highestFloor
  )
  const [spirit, rng] = rollSpirit(data, afterRarity, { rarity, subdued: true })
  return { ...state, rng, inventory: { ...inventory, spirits: [...inventory.spirits, spirit] } }
}

/**
 * Di dời khí linh đã thu phục từ `from` tới `to` (kho hoặc ô trống của món; cùng nơi thì không làm
 * gì nhưng vẫn kiểm tra): tốn moveMoneyPerValue × value × tầng cao nhất tiền. Về kho cần chỗ trong
 * túi trang bị.
 */
export function moveSpirit(
  data: GameData,
  state: GameState,
  { from, to }: { from: unknown; to: unknown }
): GameState {
  assertAtPavilion(state)
  const source = parseLocation(from)
  const destination = parseDestination(to)
  const { holder, spirit } = subduedSpiritAt(data, state, source)
  if (sameHolder(source, destination)) throw malformedAction('nơi chuyển tới trùng nơi đang chứa')
  const target = holderOf(data, state, destination)
  if (target.slots !== null && target.spirits.length >= target.slots) {
    throw new ActionError('spiritSlotsFull', {
      instanceId: target.instanceId ?? '',
      slots: target.slots
    })
  }
  if (destination.kind === 'storage') assertBagRoom(data, state)
  const paid = spendMoney(state, spiritMoveCost(data, spirit, state.highestFloor))
  const removed = holder.replace(
    paid,
    holder.spirits.filter((_, i) => i !== source.index)
  )
  const placed = holderOf(data, removed, destination)
  return placed.replace(removed, [...placed.spirits, spirit])
}

/**
 * Gộp hai khí linh đã thu phục cùng loại: value cộng dồn (không trần) vào khí linh `first`, khí linh
 * `second` mất. Miễn phí.
 */
export function mergeSpirits(
  data: GameData,
  state: GameState,
  { first, second }: { first: unknown; second: unknown }
): GameState {
  assertAtPavilion(state)
  const keep = parseLocation(first)
  const absorb = parseLocation(second)
  if (sameHolder(keep, absorb) && keep.index === absorb.index) {
    throw malformedAction('không gộp một khí linh với chính nó')
  }
  const kept = subduedSpiritAt(data, state, keep)
  const absorbed = subduedSpiritAt(data, state, absorb)
  if (!hasSameSpiritTypes(kept.spirit, absorbed.spirit)) throw new ActionError('spiritTypesDiffer')
  const merged = { ...kept.spirit, value: kept.spirit.value + absorbed.spirit.value }
  // Thay khí linh giữ lại trước (vị trí không đổi), rồi bỏ khí linh bị gộp khỏi nơi chứa của nó.
  const updated = kept.holder.replace(
    state,
    kept.holder.spirits.map((spirit, i) => (i === keep.index ? merged : spirit))
  )
  const holder = holderOf(data, updated, absorb)
  return holder.replace(
    updated,
    holder.spirits.filter((_, i) => i !== absorb.index)
  )
}

/** Thức ăn: yêu đan bất kỳ (số nguyên ≥ 1) hoặc một hồn phách theo id. */
function parseFood(value: unknown): SpiritFood {
  const object =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  if (object.kind === 'cores') {
    const count = object.count
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
      throw malformedAction('count yêu đan phải là số nguyên ≥ 1')
    }
    return { kind: 'cores', count }
  }
  if (object.kind === 'soul' && typeof object.soulId === 'string') {
    return { kind: 'soul', soulId: object.soulId }
  }
  throw malformedAction('thức ăn phải là { kind: cores, count } hoặc { kind: soul, soulId }')
}

/** Tiêu thức ăn khỏi túi, trả value cộng thêm. */
function consumeFood(
  data: GameData,
  state: GameState,
  food: SpiritFood
): [number, GameState['inventory']] {
  const { feed } = data.config.artifactSpirits
  switch (food.kind) {
    case 'cores':
      return [
        feed.coreValue * food.count,
        removeGroupItems(data, state.inventory, feed.groupId, food.count)
      ]
    case 'soul': {
      const [soul, inventory] = takeSoul(state.inventory, food.soulId)
      const rarity = data.config.soulRelic.rarityByAptitude[soul.aptitudeTierId]
      return [feed.soulValue[rarity], inventory]
    }
    default:
      return assertNever(food, 'thức ăn khí linh')
  }
}

/** Nuôi dưỡng khí linh đã thu phục: ăn yêu đan (coreValue mỗi viên) hoặc hồn phách (theo bậc). */
export function feedSpirit(
  data: GameData,
  state: GameState,
  { target, food }: { target: unknown; food: unknown }
): GameState {
  assertAtPavilion(state)
  const location = parseLocation(target)
  const meal = parseFood(food)
  const { holder, spirit } = subduedSpiritAt(data, state, location)
  const [gained, inventory] = consumeFood(data, state, meal)
  const fed = { ...spirit, value: spirit.value + gained }
  return holder.replace(
    { ...state, inventory },
    holder.spirits.map((entry, i) => (i === location.index ? fed : entry))
  )
}

/**
 * Phối linh: hai khí linh một loại, khác loại nhau, trong kho khí linh vào Linh trì breed.days ngày;
 * xong thì nhận khí linh kép và hai khí linh gốc (collectSpiritPool).
 */
export function breedSpirits(
  data: GameData,
  state: GameState,
  { first, second }: { first: unknown; second: unknown }
): GameState {
  assertAtPavilion(state)
  if (!isIndex(first) || !isIndex(second) || first === second) {
    throw malformedAction('first / second phải là hai vị trí khác nhau trong kho khí linh')
  }
  const { spirits } = state.inventory
  for (const index of [first, second]) {
    if (!spirits[index]) throw new ActionError('spiritNotFound', { instanceId: null, index })
  }
  const a = spirits[first]
  const b = spirits[second]
  if (a.typeIds.length !== 1 || b.typeIds.length !== 1 || a.typeIds[0] === b.typeIds[0]) {
    throw new ActionError('spiritNotBreedable')
  }
  const readyDay = dayOf(state.time) + data.config.artifactSpirits.breed.days
  return {
    ...state,
    inventory: {
      ...state.inventory,
      spirits: spirits.filter((_, i) => i !== first && i !== second)
    },
    spiritPools: [...state.spiritPools, { first: a, second: b, readyDay }]
  }
}

/** Nhận cặp ở Linh trì đã xong: khí linh kép + hai khí linh gốc về kho (cần 3 chỗ trong túi). */
export function collectSpiritPool(data: GameData, state: GameState, index: unknown): GameState {
  assertAtPavilion(state)
  if (!isIndex(index)) throw malformedAction('index phải là số nguyên ≥ 0')
  const pool = state.spiritPools[index]
  if (!pool) throw new ActionError('spiritPoolNotFound', { index })
  if (dayOf(state.time) < pool.readyDay) {
    throw new ActionError('spiritPoolNotReady', { index, readyDay: pool.readyDay })
  }
  if (!hasBagRoom(data, state, POOL_RETURN_COUNT)) {
    throw new ActionError('bagFull', { capacity: capacityOf(data, state, 'bag') })
  }
  const returned = [breedSpiritPair(pool.first, pool.second), pool.first, pool.second]
  return {
    ...state,
    inventory: { ...state.inventory, spirits: [...state.inventory.spirits, ...returned] },
    spiritPools: state.spiritPools.filter((_, i) => i !== index)
  }
}
