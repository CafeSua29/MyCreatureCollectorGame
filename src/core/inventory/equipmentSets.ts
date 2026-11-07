// Bộ trang bị (docs/rules/equipment-sets.md): tra bộ, tung bộ ngẫu nhiên cho món mới, bậc ép theo bộ
// đặt tên, món bộ đặt tên rơi thêm từ các nguồn. Phần đếm bộ và thưởng ở registries/equipmentSets.ts.

import { pick, pickWeighted, type RngState } from '../shared'
import {
  type EquipmentItem,
  type EquipmentRarity,
  type EquipmentSetDef,
  type GameData,
  type NamedEquipmentSetDef,
  type NormalRarity,
  type RolledEquipmentSetDef
} from '../model'

/** Bộ trang bị theo id; null nếu không có. */
export function findEquipmentSet(data: GameData, setId: string): EquipmentSetDef | null {
  return Object.hasOwn(data.equipmentSets, setId) ? data.equipmentSets[setId] : null
}

/** Bộ đặt tên của món gốc; null nếu món không thuộc bộ đặt tên. */
export function namedSetOf(data: GameData, item: EquipmentItem): NamedEquipmentSetDef | null {
  const set = item.setId === undefined ? null : findEquipmentSet(data, item.setId)
  return set?.kind === 'named' ? set : null
}

/** Mọi bộ ngẫu nhiên (theo thứ tự dữ liệu). */
export const rolledSets = (data: GameData): RolledEquipmentSetDef[] =>
  Object.values(data.equipmentSets).filter((set) => set.kind === 'rolled')

/** Mọi bộ đặt tên (theo thứ tự dữ liệu). */
export const namedSets = (data: GameData): NamedEquipmentSetDef[] =>
  Object.values(data.equipmentSets).filter((set) => set.kind === 'named')

/** Bậc món tung ra: món của bộ đặt tên luôn mang bậc của bộ, món khác giữ bậc đã tung. */
export function equipmentRarityFor(
  data: GameData,
  item: EquipmentItem,
  rarity: EquipmentRarity
): EquipmentRarity {
  return namedSetOf(data, item)?.rarity ?? rarity
}

/** Tung một bộ ngẫu nhiên theo `weight` trong `sets` (trọng số > 0); không có thì null, không tốn RNG. */
function rollRolledSet(
  rng: RngState,
  sets: readonly RolledEquipmentSetDef[]
): [string | null, RngState] {
  const candidates = sets.filter((set) => set.weight > 0)
  if (candidates.length === 0) return [null, rng]
  const [set, next] = pickWeighted(rng, candidates, (entry) => entry.weight)
  return [set.id, next]
}

/**
 * Bộ của món mới (tung sau mọi dòng để RNG phần trước không đổi): món gốc ghi `setId` (bộ đặt tên
 * hoặc bộ ngẫu nhiên cố định) thì lấy bộ đó, không tốn RNG; còn lại tung bộ ngẫu nhiên theo trọng số
 * (không có bộ nào thì không thuộc bộ).
 */
export function rollEquipmentSet(
  data: GameData,
  rng: RngState,
  item: EquipmentItem
): [string | null, RngState] {
  if (item.setId !== undefined) return [item.setId, rng]
  return rollRolledSet(rng, rolledSets(data))
}

/**
 * Đổi bộ ngẫu nhiên (Thợ rèn): tung trong các bộ ngẫu nhiên khác bộ hiện tại; không còn bộ nào thì
 * null (không tốn RNG).
 */
export function rerollRolledSet(
  data: GameData,
  rng: RngState,
  currentSetId: string | undefined
): [string | null, RngState] {
  return rollRolledSet(
    rng,
    rolledSets(data).filter((set) => set.id !== currentSetId)
  )
}

/** Món gốc thuộc bộ đặt tên bậc thường `rarity` (theo thứ tự dữ liệu, không trùng). */
function setPiecesOf(data: GameData, rarity: NormalRarity): string[] {
  const ids = namedSets(data)
    .filter((set) => set.rarity === rarity)
    .flatMap((set) => set.pieceItemIds)
  return [...new Set(ids)]
}

/** Bậc thường có bộ đặt tên (bảng bậc của nguồn rơi chỉ giữ các bậc này). */
export function setPieceRarities(
  data: GameData,
  weights: Partial<Record<NormalRarity, number>>
): Partial<Record<NormalRarity, number>> {
  const kept: Partial<Record<NormalRarity, number>> = {}
  for (const [rarity, weight] of Object.entries(weights)) {
    // Ép kiểu vì khóa của bảng là bậc thường (kiểm tra dữ liệu lúc khởi động).
    const key = rarity as NormalRarity
    if (weight > 0 && setPiecesOf(data, key).length > 0) kept[key] = weight
  }
  return kept
}

/**
 * Chọn đều một món gốc của các bộ đặt tên bậc `rarity`; bậc không có bộ nào thì null (không tốn
 * RNG).
 */
export function pickSetPiece(
  data: GameData,
  rng: RngState,
  rarity: NormalRarity
): [string | null, RngState] {
  const pieces = setPiecesOf(data, rarity)
  if (pieces.length === 0) return [null, rng]
  return pick(rng, pieces)
}
