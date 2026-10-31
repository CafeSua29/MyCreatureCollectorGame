// Môi trường "tính là" môi trường khác (trường `actsAs`, mục "Thời tiết nguyên thủy" ở
// battle-environment.md): Heavy Rain tính là mưa, Extremely Harsh Sunlight tính là nắng. Mọi điều
// kiện so id môi trường đang có (trait, fieldModifiers, nạp chiêu, điều kiện DSL...) đi qua đây.

import type { BattleField, GameData, GlobalFieldLayer } from '../model'

/** Các id mà môi trường `fieldId` tính là: chính nó rồi `actsAs`. */
export function fieldIdsCountedAs(data: GameData, fieldId: string): readonly string[] {
  const actsAs = data.fieldEffects[fieldId]?.actsAs
  return actsAs ? [fieldId, ...actsAs] : [fieldId]
}

/** Môi trường `fieldId` khớp một id trong `fieldIds` (chính nó hoặc qua actsAs). */
export function fieldIdMatches(
  data: GameData,
  fieldId: string,
  fieldIds: readonly string[]
): boolean {
  return fieldIdsCountedAs(data, fieldId).some((id) => fieldIds.includes(id))
}

/** Môi trường đang có ở lớp `layer` khớp một id trong `fieldIds` (kể cả qua actsAs). */
export function isLayerFieldIn(
  data: GameData,
  field: BattleField,
  layer: GlobalFieldLayer,
  fieldIds: readonly string[]
): boolean {
  return fieldIdMatches(data, field[layer].id, fieldIds)
}
