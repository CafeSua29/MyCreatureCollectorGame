// Z-Power của skill trạng thái (docs/rules/z-moves.md): hiệu ứng "ngôn ngữ" trait (traitDsl.ts) lên
// quái dùng, chạy trước skill khi skill được dùng thành Z-Move. Chạy ở battle/zMoves.ts.

import type { GameData, Skill } from '../model'
import { checkTraitEffects, type TraitEffect } from './traitDsl'

/** Kiểm tra zEffects của skill: danh sách hiệu ứng "ngôn ngữ" trait, chỉ skill trạng thái có. */
export function checkZEffects(skill: Skill, data: GameData): string[] {
  if (skill.zEffects === undefined) return []
  const issues = checkTraitEffects(skill.zEffects, 'zEffects', data)
  if (skill.category !== 'status') issues.push('zEffects chỉ dùng cho skill trạng thái')
  return issues
}

/** Hiệu ứng Z-Power của skill (rỗng nếu không có); ép kiểu vì đã qua checkZEffects lúc nạp. */
export const zPowerEffects = (skill: Skill): readonly TraitEffect[] =>
  (skill.zEffects ?? []) as TraitEffect[]
