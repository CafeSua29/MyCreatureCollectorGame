// Trang bị (mục "Trang bị và đồ cầm" ở equipment.md): số ô trên quái, tung món mới (bậc, dòng),
// tra định nghĩa dòng, giá theo bậc, trả đồ đang lắp về túi. Hàm thuần.

import {
  ActionError,
  asObject,
  countMilestonesReached,
  nextInt,
  pickWeighted,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import {
  bestFloorReached,
  bestRealmReached,
  EQUIPMENT_RARITIES,
  type EquipmentInstance,
  type EquippedItem,
  type EquipmentItem,
  type EquipmentLineDef,
  type EquipmentRarity,
  type EquipmentRoll,
  type GameData,
  type GameState,
  type Inventory,
  type Monster,
  type NormalRarity,
  type SoulImprint,
  type StatName,
  type UniqueEquipmentDef
} from '../model'
import { addItems } from './inventory'
import { isImbueLine } from './imbue'
import { evolutionLineOf } from './evolutionLine'

/** Id dòng chính của mọi trang bị. */
export const MAIN_LINE_ID = 'main'

/** Id dòng hồn của hồn khí (trait của quái đã chết, giá trị dòng = cấp trait). */
export const SOUL_LINE_ID = 'soul'

/** Tiền tố id món trang bị ("e<số>"). */
const EQUIPMENT_ID_PREFIX = 'e'

/** Id món trang bị thứ `n` (từ GameState.nextItemId). */
export const equipmentInstanceId = (n: number): string => `${EQUIPMENT_ID_PREFIX}${n}`

/** Số trong id món trang bị ("e12" → 12), null nếu không đúng dạng. */
export function equipmentIdNumber(id: string): number | null {
  const match = /^e(\d+)$/.exec(id)
  return match ? Number(match[1]) : null
}

/** Phần state quyết định số ô: tầng và cảnh giới ngự thú sư cao nhất từng đạt. */
export interface EquipmentSlotSource {
  highestFloor: number
  tamer: { realm: number }
  ascension: { bestFloor: number; bestRealm: number }
}

/**
 * Số ô trên mọi quái của người chơi = baseSlots + số mốc tầng đã đạt + số mốc cảnh giới ngự thú sư
 * đã đạt. Mốc: danh sách rồi gấp đôi mốc cuối mãi (countMilestonesReached; không trần, tăng kiểu
 * log). Theo giá trị cao nhất từng đạt nên phi thăng không làm giảm số ô.
 */
export function equipmentSlotCount(data: GameData, state: EquipmentSlotSource): number {
  return (
    data.config.equipment.baseSlots +
    countMilestonesReached(data.config.equipment.floorMilestones, bestFloorReached(state)) +
    countMilestonesReached(data.config.tamer.realmMilestones, bestRealmReached(state))
  )
}

/** Trang bị gốc theo id (đã kiểm tra là category equipment); null nếu không phải. */
export function findEquipmentItem(data: GameData, itemId: string): EquipmentItem | null {
  const item = Object.hasOwn(data.items, itemId) ? data.items[itemId] : undefined
  return item?.category === 'equipment' ? item : null
}

/**
 * Định nghĩa một dòng của món: dòng chính, dòng hồn (hồn khí có trait), dòng unique của món, hoặc
 * dòng phụ; null nếu không có.
 */
export function findEquipmentLine(
  data: GameData,
  item: EquipmentItem,
  lineId: string,
  soul?: SoulImprint
): EquipmentLineDef | null {
  if (lineId === MAIN_LINE_ID) return { id: MAIN_LINE_ID, ...item.mainLine }
  if (lineId === SOUL_LINE_ID) return soul?.traitId ? soulLine(soul.traitId) : null
  const unique = item.unique?.lines.find((line) => line.id === lineId)
  if (unique) return unique
  return Object.hasOwn(data.equipmentAffixes, lineId) ? data.equipmentAffixes[lineId] : null
}

/**
 * Dòng hồn: hook `equipmentTrait` (trait chạy như trait của món, nguồn equipment), giá trị là cấp
 * trait. Không tung (giá trị lấy từ trait lúc luyện) nên không có khoảng.
 */
function soulLine(traitId: string): EquipmentLineDef {
  return {
    id: SOUL_LINE_ID,
    hook: { type: 'equipmentTrait', params: { traitId } },
    valueParam: 'level',
    ranges: {},
    tags: ['trait']
  }
}

/** Bậc của món gốc: món unique luôn `unique`, món thường các bậc khác. */
export const isUniqueEquipment = (item: EquipmentItem): boolean => item.unique !== undefined

/**
 * Món gốc có được tung ngẫu nhiên không (rơi, cửa hàng, chợ đen): không phải món unique của boss,
 * không phải món gốc hồn khí.
 */
export const isRandomEquipment = (item: EquipmentItem): boolean =>
  item.unique === undefined && item.soulRelicStat === undefined

/** Món gốc hồn khí có dòng chính tăng chỉ số `stat` (kiểm tra dữ liệu bắt buộc có đúng một món). */
export function soulRelicBaseItem(data: GameData, stat: StatName): EquipmentItem | null {
  for (const item of Object.values(data.items)) {
    if (item.category === 'equipment' && item.soulRelicStat === stat) return item
  }
  return null
}

/** Bảng trọng số bậc với các bậc từ floorBoostFrom (rare) trở lên nhân `boost`. */
export function boostRareWeights(
  data: GameData,
  weights: Partial<Record<NormalRarity, number>>,
  boost: number
): Partial<Record<NormalRarity, number>> {
  const boostFrom = EQUIPMENT_RARITIES.indexOf(data.config.equipment.floorBoostFrom)
  const boosted: Partial<Record<NormalRarity, number>> = {}
  for (const [rarity, weight] of Object.entries(weights)) {
    // Ép kiểu vì khóa của bảng là bậc thường (kiểm tra dữ liệu lúc khởi động).
    const key = rarity as NormalRarity
    boosted[key] = EQUIPMENT_RARITIES.indexOf(key) >= boostFrom ? weight * boost : weight
  }
  return boosted
}

/**
 * Tung bậc theo bảng trọng số (bậc không ghi = không ra); bậc từ floorBoostFrom trở lên nhân
 * (1 + floorRarityFactor × (tầng − 1)) để tầng cao rơi đồ hiếm dễ hơn.
 */
export function rollRarity(
  data: GameData,
  rng: RngState,
  weights: Partial<Record<NormalRarity, number>>,
  floor: number
): [NormalRarity, RngState] {
  const boost = 1 + data.config.equipment.floorRarityFactor * (floor - 1)
  const entries = Object.entries(boostRareWeights(data, weights, boost)).map(
    // Ép kiểu vì khóa của bảng là bậc thường.
    ([rarity, weight]) => ({ rarity: rarity as NormalRarity, weight })
  )
  const [chosen, next] = pickWeighted(rng, entries, (entry) => entry.weight)
  return [chosen.rarity, next]
}

/**
 * Tung giá trị một dòng trong khoảng của bậc; minRollPercent > 0 thì chỉ tung trong phần trên của
 * khoảng (từ min + ⌈(max − min) × minRollPercent / 100⌉; chợ đen, docs/rules/events.md).
 */
function rollLine(
  rng: RngState,
  line: Pick<EquipmentLineDef, 'id' | 'ranges'>,
  { rarity, minRollPercent }: { rarity: EquipmentRarity; minRollPercent: number }
): [EquipmentRoll, RngState] {
  const range = line.ranges[rarity]
  if (!range) throw new Error(`Dòng "${line.id}" không có khoảng cho bậc "${rarity}"`)
  const low = range.min + Math.ceil(((range.max - range.min) * minRollPercent) / 100)
  const [value, next] = nextInt(rng, Math.min(low, range.max), range.max)
  return [{ lineId: line.id, value }, next]
}

/**
 * Tung một dòng phụ theo trọng số trong các dòng có khoảng cho bậc, trừ các dòng `excludedIds` (dòng
 * đã có trên món); không còn dòng hợp lệ thì null (không tốn RNG).
 */
function rollAffix(
  data: GameData,
  rng: RngState,
  roll: { rarity: EquipmentRarity; minRollPercent: number },
  excludedIds: ReadonlySet<string>
): [EquipmentRoll | null, RngState] {
  const candidates = Object.values(data.equipmentAffixes).filter(
    (affix) =>
      affix.weight > 0 && affix.ranges[roll.rarity] !== undefined && !excludedIds.has(affix.id)
  )
  if (candidates.length === 0) return [null, rng]
  const [affix, afterPick] = pickWeighted(rng, candidates, (entry) => entry.weight)
  return rollLine(afterPick, affix, roll)
}

/**
 * Tung dòng phụ: affixCounts[bậc] dòng theo trọng số trong các dòng có khoảng cho bậc đó, không
 * trùng dòng; ít dòng hợp lệ hơn thì lấy hết.
 */
function rollAffixes(
  data: GameData,
  rng: RngState,
  roll: { rarity: EquipmentRarity; minRollPercent: number }
): [EquipmentRoll[], RngState] {
  const rolls: EquipmentRoll[] = []
  for (let i = 0; i < data.config.equipment.affixCounts[roll.rarity]; i++) {
    let line: EquipmentRoll | null
    ;[line, rng] = rollAffix(data, rng, roll, new Set(rolls.map((entry) => entry.lineId)))
    if (!line) break
    rolls.push(line)
  }
  return [rolls, rng]
}

/**
 * Dòng ở vị trí này là dòng phụ tẩy luyện được (không phải dòng chính, dòng hồn, dòng unique của món
 * gốc, dòng linh hệ của phụ linh).
 */
export function isAffixRoll(data: GameData, item: EquipmentItem, roll: EquipmentRoll): boolean {
  if (roll.lineId === MAIN_LINE_ID || roll.lineId === SOUL_LINE_ID) return false
  if (isImbueLine(data, roll.lineId)) return false
  return !(item.unique?.lines.some((line) => line.id === roll.lineId) ?? false)
}

/**
 * Tung lại các dòng ở vị trí `indexes` (dòng phụ, kiểm tra ở nơi gọi) theo thứ tự: loại dòng và giá
 * trị mới trong khoảng của bậc, không trùng dòng còn lại trên món; giữ nguyên vị trí. Không còn dòng
 * hợp lệ thì giữ dòng cũ.
 */
export function rerollAffixes(
  data: GameData,
  rng: RngState,
  instance: EquipmentInstance,
  indexes: readonly number[]
): [EquipmentInstance, RngState] {
  const rolls = [...instance.rolls]
  const roll = { rarity: instance.rarity, minRollPercent: 0 }
  for (const index of indexes) {
    const others = new Set(rolls.filter((_, i) => i !== index).map((entry) => entry.lineId))
    let line: EquipmentRoll | null
    ;[line, rng] = rollAffix(data, rng, roll, others)
    if (line) rolls[index] = line
  }
  return [{ ...instance, rolls }, rng]
}

/**
 * Thêm một dòng phụ mới (theo trọng số trong khoảng của bậc, không trùng dòng đã có) vào cuối món
 * (thưởng boss Khí giới bí cảnh, docs/rules/artifact-spirits.md); không còn dòng hợp lệ thì null
 * (không tốn RNG).
 */
export function addRandomAffix(
  data: GameData,
  rng: RngState,
  instance: EquipmentInstance
): [EquipmentInstance | null, RngState] {
  const existing = new Set(instance.rolls.map((roll) => roll.lineId))
  const [line, next] = rollAffix(
    data,
    rng,
    { rarity: instance.rarity, minRollPercent: 0 },
    existing
  )
  return line ? [{ ...instance, rolls: [...instance.rolls, line] }, next] : [null, next]
}

/**
 * Tạo một món trang bị mới cấp 1: dòng chính → dòng unique (món unique) → dòng phụ, mỗi dòng tung
 * giá trị trong khoảng của bậc (minRollPercent: chỉ phần trên của khoảng, mặc định 0). Món unique
 * luôn bậc `unique`.
 */
export function rollEquipment(
  data: GameData,
  rng: RngState,
  {
    itemId,
    rarity,
    id,
    minRollPercent = 0
  }: { itemId: string; rarity: EquipmentRarity; id: string; minRollPercent?: number }
): [EquipmentInstance, RngState] {
  const lineRoll = { rarity, minRollPercent }
  const item = findEquipmentItem(data, itemId)
  if (!item) throw new Error(`Vật phẩm "${itemId}" không phải trang bị`)
  const rolls: EquipmentRoll[] = []
  let roll: EquipmentRoll
  ;[roll, rng] = rollLine(rng, { id: MAIN_LINE_ID, ranges: item.mainLine.ranges }, lineRoll)
  rolls.push(roll)
  for (const line of item.unique?.lines ?? []) {
    ;[roll, rng] = rollLine(rng, line, lineRoll)
    rolls.push(roll)
  }
  let affixes: EquipmentRoll[]
  ;[affixes, rng] = rollAffixes(data, rng, lineRoll)
  return [{ id, baseItemId: itemId, rarity, level: 1, rolls: [...rolls, ...affixes] }, rng]
}

/** Món unique trong pool của loài boss (theo thứ tự dữ liệu). */
export function uniquePoolOf(data: GameData, speciesId: string): EquipmentItem[] {
  const pool: EquipmentItem[] = []
  for (const item of Object.values(data.items)) {
    if (item.category === 'equipment' && item.unique?.bossSpeciesId === speciesId) pool.push(item)
  }
  return pool
}

/**
 * Race bắt buộc để lắp món: món unique của boss theo race loài boss, hồn khí theo race của quái đã
 * chết; null = ai cũng lắp được.
 */
export function requiredRaceId(data: GameData, instance: EquipmentInstance): string | null {
  if (instance.soul) return instance.soul.raceId
  const item = findEquipmentItem(data, instance.baseItemId)
  return item?.unique ? uniqueRaceId(data, item.unique) : null
}

/**
 * Quái lắp được món không: món có race bắt buộc (unique, hồn khí) thì quái cùng race, hoặc có race
 * đó trong lineage (race của các loài trong lineage) hoặc trong chuỗi tiến hóa của loài quái (tiến hóa
 * được đổi race: món đang lắp không bị tháo khi tiến hóa). Món thường ai cũng lắp được.
 */
export function canWearEquipment(
  data: GameData,
  monster: Monster,
  instance: EquipmentInstance
): boolean {
  const raceId = requiredRaceId(data, instance)
  if (raceId === null) return true
  return (
    monster.raceId === raceId ||
    monster.lineage.some((speciesId) => speciesRaceId(data, speciesId) === raceId) ||
    evolutionLineOf(data, monster.baseSpeciesId).some(
      (speciesId) => speciesRaceId(data, speciesId) === raceId
    )
  )
}

/** Race của loài thường (loài fuse chung không có race): null nếu không có. */
function speciesRaceId(data: GameData, speciesId: string): string | null {
  const species = Object.hasOwn(data.species, speciesId) ? data.species[speciesId] : undefined
  return species?.kind === 'normal' ? species.raceId : null
}

/** Race lắp được món unique: race của loài boss (kiểm tra dữ liệu bắt buộc là loài thường). */
export function uniqueRaceId(data: GameData, unique: UniqueEquipmentDef): string {
  return speciesRaceId(data, unique.bossSpeciesId) ?? ''
}

/** Ném equipmentRaceLocked nếu quái không lắp được món này. */
export function assertCanWear(data: GameData, monster: Monster, instance: EquipmentInstance): void {
  if (canWearEquipment(data, monster, instance)) return
  // canWearEquipment chỉ trả false khi món có race bắt buộc.
  const raceId = requiredRaceId(data, instance) ?? monster.raceId
  throw new ActionError('equipmentRaceLocked', { itemId: instance.baseItemId, raceId })
}

/**
 * Giá gốc của món = price × hệ số bậc × highestFloor (fixedPrice: không nhân tầng), như mọi vật
 * phẩm có giá.
 */
export function equipmentBasePrice(
  data: GameData,
  instance: EquipmentInstance,
  highestFloor: number
): Decimal {
  const item = findEquipmentItem(data, instance.baseItemId)
  if (!item) throw new Error(`Vật phẩm "${instance.baseItemId}" không phải trang bị`)
  const price = toBig(item.price).times(
    data.config.equipment.rarityPriceMultipliers[instance.rarity]
  )
  return item.fixedPrice ? price : price.times(highestFloor)
}

/** Đưa một món đang lắp về túi. */
export function returnEquippedItem(inventory: Inventory, entry: EquippedItem): Inventory {
  return entry.storage === 'stack'
    ? addItems(inventory, entry.itemId, 1)
    : addEquipment(inventory, entry.instance)
}

/** Trả mọi món đang lắp trên quái về túi (thả quái, quái phụ khi fuse, fuse thất bại). */
export function returnEquipment(inventory: Inventory, monster: Monster): Inventory {
  return monster.equipment.reduce(returnEquippedItem, inventory)
}

/** Thêm món trang bị vào túi. */
export function addEquipment(inventory: Inventory, instance: EquipmentInstance): Inventory {
  return { ...inventory, equipment: [...inventory.equipment, instance] }
}

/** Lấy một món khỏi túi theo id; không có thì ném equipmentNotFound. */
export function takeEquipment(
  inventory: Inventory,
  instanceId: string
): [EquipmentInstance, Inventory] {
  const instance = inventory.equipment.find((entry) => entry.id === instanceId)
  if (!instance) throw new ActionError('equipmentNotFound', { instanceId })
  return [
    instance,
    { ...inventory, equipment: inventory.equipment.filter((entry) => entry !== instance) }
  ]
}

/**
 * Params của hook dòng với giá trị đã tung: chép `params` mẫu rồi ghi `value` vào đường dẫn
 * `valueParam` (khóa nối bằng dấu chấm, thiếu object trung gian thì tạo).
 */
export function lineParams(
  line: Pick<EquipmentLineDef, 'hook' | 'valueParam'>,
  value: number
): unknown {
  const paths = typeof line.valueParam === 'string' ? [line.valueParam] : line.valueParam
  return paths.reduce<unknown>(
    (params, path) => withValueAt(params, path.split('.'), value),
    line.hook.params
  )
}

/** Bản sao của `container` với `value` ghi ở đường dẫn `keys` (khóa số trong danh sách là chỉ số). */
function withValueAt(container: unknown, keys: readonly string[], value: number): unknown {
  const [key, ...rest] = keys
  if (key === undefined) return value
  if (Array.isArray(container)) {
    const copy: unknown[] = [...container]
    const index = Number(key)
    copy[index] = withValueAt(copy[index], rest, value)
    return copy
  }
  const copy: Record<string, unknown> = { ...(asObject(container) ?? {}) }
  copy[key] = withValueAt(copy[key], rest, value)
  return copy
}

/** Quái (đội, kho) đang lắp món `instanceId`. */
export function findWearer(
  state: Pick<GameState, 'party' | 'storage'>,
  instanceId: string
): { monster: Monster; instance: EquipmentInstance } | null {
  for (const monster of [...state.party, ...state.storage]) {
    for (const entry of monster.equipment) {
      if (entry.storage === 'instance' && entry.instance.id === instanceId) {
        return { monster, instance: entry.instance }
      }
    }
  }
  return null
}
