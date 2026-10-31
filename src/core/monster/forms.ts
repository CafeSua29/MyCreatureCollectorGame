// Mega theo đồ quái đang cầm (mục "Biến hình trong trận" ở transformation.md). Tra dạng theo loài
// (formsOf, canHaveGmaxFactor) ở inventory/speciesForms.ts.

import { formsOf } from '../inventory'
import type { GameData, Monster } from '../model'

/** Đá Mega quái đang cầm (ô đồ): theo đá tự kích hoạt (auto) hay không. */
function heldStoneFormIds(data: GameData, monster: Monster, auto: boolean): string[] {
  return monster.equipment.flatMap((entry) => {
    if (entry.storage !== 'stack') return []
    const item = data.items[entry.itemId]
    return item?.category === 'megaStone' && (item.auto === true) === auto ? [item.formId] : []
  })
}

/**
 * Dạng Mega quái của người chơi dùng được bằng lệnh (cần Vòng Mega): quái không fuse, đá đúng dạng
 * đang cầm, hoặc biết skill của dạng (megaSkillId, kiểu Rayquaza không cần đá).
 */
export function megaFormsByStone(data: GameData, monster: Monster): string[] {
  if (monster.fused) return []
  const stones = heldStoneFormIds(data, monster, false)
  return formsOf(data, monster.speciesId, 'mega')
    .filter((form) =>
      form.megaSkillId ? monster.skillIds.includes(form.megaSkillId) : stones.includes(form.id)
    )
    .map((form) => form.id)
}

/** Dạng Mega tự biến khi ra sân nhờ đá tự kích hoạt (kiểu Blue / Red Orb); undefined = không có. */
export function autoMegaForm(data: GameData, monster: Monster): string | undefined {
  if (monster.fused) return undefined
  const forms = formsOf(data, monster.speciesId, 'mega').map((form) => form.id)
  return heldStoneFormIds(data, monster, true).find((formId) => forms.includes(formId))
}
