// Hóa hình trên một quái (docs/rules/human-form.md): sức chứa skill (+1 ô khi đã hóa hình), skill ở
// ô nhân hình đang khóa, lý do chưa hóa hình được, chi phí.

import { isHumanShape, type GameData, type Monster } from '../model'
import { toBig, type Decimal } from '../shared'

/** Số skill tối đa quái giữ được: maxSkills, +1 khi đã hóa hình (bản thể hay nhân hình). */
export const skillCapacity = (data: GameData, monster: Monster): number =>
  data.config.maxSkills + (monster.humanForm === 'locked' ? 0 : 1)

/**
 * Skill ở ô nhân hình (ô sau maxSkills) đang khóa: quái không mang hình người (bản thể, hoặc đã về
 * bản thể trong trận). Rỗng nếu quái mang hình người hoặc chưa dùng tới ô đó.
 */
export function lockedSkillIds(data: GameData, monster: Monster): readonly string[] {
  if (isHumanShape(monster)) return []
  return monster.skillIds.slice(data.config.maxSkills)
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
