// Phụ linh ở Thợ rèn (docs/rules/equipment-forge.md): dòng linh hệ của trang bị theo hệ của yêu đan
// (dòng phụ có trọng số 0 trong equipmentAffixes.json, id ở config.forge.imbue.lineIds), tối đa một
// dòng mỗi món, không tẩy luyện / khóa được. Hàm thuần, action ở roster/forgeActions.ts.

import { nextInt, type RngState } from '../shared'
import type { EquipmentInstance, EquipmentRoll, GameData } from '../model'

/** Dòng `lineId` là dòng linh hệ (của bất kỳ hệ nào). */
export const isImbueLine = (data: GameData, lineId: string): boolean =>
  Object.values(data.config.forge.imbue.lineIds).includes(lineId)

/** Hệ của dòng linh hệ đang có trên món (null nếu chưa phụ linh). */
export function imbuedElementId(data: GameData, instance: EquipmentInstance): string | null {
  for (const [elementId, lineId] of Object.entries(data.config.forge.imbue.lineIds)) {
    if (instance.rolls.some((roll) => roll.lineId === lineId)) return elementId
  }
  return null
}

/** Yêu đan của hệ dùng để phụ linh / đúc (null nếu hệ không phụ linh được). */
export function imbueCoreItemId(data: GameData, elementId: string): string | null {
  const { lineIds } = data.config.forge.imbue
  const cores = data.config.treasures.demonCoreItemIds
  if (!Object.hasOwn(lineIds, elementId) || !Object.hasOwn(cores, elementId)) return null
  return cores[elementId]
}

/**
 * Gắn dòng linh hệ `elementId` lên món: bỏ dòng linh hệ cũ (nếu có), thêm dòng mới ở cuối với giá
 * trị tung đều trong khoảng của bậc món. Nơi gọi đã kiểm tra hệ phụ linh được.
 */
export function applyImbue(
  data: GameData,
  rng: RngState,
  { instance, elementId }: { instance: EquipmentInstance; elementId: string }
): [EquipmentInstance, RngState] {
  const lineId = data.config.forge.imbue.lineIds[elementId]
  const range = data.equipmentAffixes[lineId]?.ranges[instance.rarity]
  if (!range)
    throw new Error(`Dòng linh hệ "${lineId}" không có khoảng cho bậc "${instance.rarity}"`)
  const [value, next] = nextInt(rng, range.min, range.max)
  const kept = instance.rolls.filter((roll) => !isImbueLine(data, roll.lineId))
  const line: EquipmentRoll = { lineId, value }
  return [{ ...instance, rolls: [...kept, line] }, next]
}
