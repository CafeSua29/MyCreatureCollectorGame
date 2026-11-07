// Hóa hình trên một quái (docs/rules/human-form.md): sức chứa skill (+1 ô khi đã hóa hình), skill ở
// ô nhân hình đang khóa, lý do chưa hóa hình được, chi phí.

import { isHumanShape, type GameData, type Monster } from '../model'
import { toBig, type Decimal } from '../shared'
import { stickerExtraSlots } from '../registries'

/**
 * Số skill tối đa quái giữ được: maxSkills, +1 khi đã hóa hình (bản thể hay nhân hình), + ô từ sticker
 * Extra Slots (docs/rules/skill-stickers.md; cả tổng không vượt `stickers.maxSkillSlots` như gốc).
 */
export function skillCapacity(data: GameData, monster: Monster): number {
  const base = data.config.maxSkills + (monster.humanForm === 'locked' ? 0 : 1)
  const room = Math.max(0, data.config.stickers.maxSkillSlots - base)
  return base + Math.min(room, stickerExtraSlots(data, monster))
}

/** Số ô skill còn trống (thuộc tính sticker "per empty slot"). */
export const emptySkillSlots = (data: GameData, monster: Monster): number =>
  Math.max(0, skillCapacity(data, monster) - monster.skillIds.length)

/**
 * Skill ở ô nhân hình (ô sau maxSkills) đang khóa: quái không mang hình người (bản thể, hoặc đã về
 * bản thể trong trận). Rỗng nếu quái mang hình người hoặc chưa dùng tới ô đó.
 */
export function lockedSkillIds(data: GameData, monster: Monster): readonly string[] {
  if (isHumanShape(monster) || monster.humanForm === 'locked') return []
  // Ô nhân hình là ô cuối (sau ô sticker Extra Slots).
  return monster.skillIds.slice(skillCapacity(data, monster) - 1)
}

export type HumanFormBlocker = 'race' | 'awakeningTooLow' | 'alreadyTaken'

/** Lý do quái chưa hóa hình được (ngoài đan / tiền / nơi); null = được. */
export function humanFormBlocker(data: GameData, monster: Monster): HumanFormBlocker | null {
  if (monster.humanForm !== 'locked') return 'alreadyTaken'
  if (!data.races[monster.raceId].humanForm) return 'race'
  if (monster.awakening < data.config.humanForm.minAwakening) return 'awakeningTooLow'
  return null
}

/** Tiền hóa hình: costPerLevel × level. */
export const humanFormCost = (data: GameData, monster: Monster): Decimal =>
  toBig(data.config.humanForm.costPerLevel).times(monster.level)
