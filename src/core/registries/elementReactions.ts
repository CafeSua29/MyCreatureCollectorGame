// Tra phản ứng hệ (docs/rules/element-reactions.md) và hệ số khắc chế. Dữ liệu đánh chỉ mục theo cặp
// hệ lúc tạo GameData nên AI chấm điểm mỗi ứng viên không phải duyệt danh sách.

import type { ElementReactionDef, GameData } from '../model'

/** Hệ số khắc chế: nhân dồn qua mọi hệ của bên phòng thủ. */
export function elementEffectiveness(
  data: GameData,
  attackElementId: string,
  defenderElementIds: readonly string[]
): number {
  const table = data.elements[attackElementId].effectiveness
  return defenderElementIds.reduce((product, id) => product * (table[id] ?? 1), 1)
}

/** Loài thường không hệ (Archangel của Cassette Beasts; data.md mục "Loài không hệ"). */
export function isTypelessSpecies(data: GameData, speciesId: unknown): boolean {
  const species =
    typeof speciesId === 'string' && Object.hasOwn(data.species, speciesId)
      ? data.species[speciesId]
      : undefined
  return species?.kind === 'normal' && species.elementIds.length === 0
}

/** Khóa của `GameData.elementReactionIndex`. */
export const elementReactionKey = (attackElementId: string, defenderElementId: string): string =>
  `${attackElementId}>${defenderElementId}`

/** Một phản ứng xảy ra: phản ứng và hệ của mục tiêu gây ra nó. */
export interface ElementReactionHit {
  reaction: ElementReactionDef
  defenderElementId: string
}

/** Các phản ứng khi skill hệ `attackElementId` trúng quái mang các hệ này, theo thứ tự hệ. */
export function elementReactionsOn(
  data: GameData,
  attackElementId: string,
  defenderElementIds: readonly string[]
): ElementReactionHit[] {
  const hits: ElementReactionHit[] = []
  for (const defenderElementId of defenderElementIds) {
    const reaction =
      data.elementReactionIndex[elementReactionKey(attackElementId, defenderElementId)]
    if (reaction) hits.push({ reaction, defenderElementId })
  }
  return hits
}
