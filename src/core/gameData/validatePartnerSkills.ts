// Kiểm tra dữ liệu kỹ năng đồng hành (docs/rules/partner-skills.md): partnerSkills.json, kỹ năng
// mặc định của race (bắt buộc), ghi đè của loài (tùy chọn), config.partnerSkill. Danh sách / id
// trùng đã kiểm ở indexById (createGameData).

import { PARTNER_EFFECTS } from '../registries'
import type { GameData } from '../model'
import { asObject, checkNumber } from '../shared'
import { checkEffects, checkKnownFields } from './checks'

function checkPartnerSkills(data: GameData, issues: string[]): void {
  for (const skill of Object.values(data.partnerSkills)) {
    const where = `Kỹ năng đồng hành "${skill.id}"`
    checkKnownFields(skill, ['id', 'effects'], where, 'kỹ năng đồng hành', issues)
    checkEffects(PARTNER_EFFECTS, skill.effects, where, data, issues)
  }
}

const isPartnerSkillId = (data: GameData, id: unknown): boolean =>
  typeof id === 'string' && Object.hasOwn(data.partnerSkills, id)

/** Race nào cũng có kỹ năng mặc định; loài ghi đè (nếu có) phải là kỹ năng tồn tại. */
function checkPartnerSkillRefs(data: GameData, issues: string[]): void {
  for (const race of Object.values(data.races)) {
    if (!isPartnerSkillId(data, race.partnerSkillId)) {
      issues.push(
        `Race "${race.id}": partnerSkillId phải là kỹ năng đồng hành, nhận "${String(race.partnerSkillId)}"`
      )
    }
  }
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal' || species.partnerSkillId === undefined) continue
    if (!isPartnerSkillId(data, species.partnerSkillId)) {
      issues.push(
        `Loài "${species.id}": partnerSkillId phải là kỹ năng đồng hành, nhận "${String(species.partnerSkillId)}"`
      )
    }
  }
}

function checkPartnerSkillConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.partnerSkill)
  if (!config) {
    issues.push('config.partnerSkill phải là object')
    return
  }
  const where = 'config.partnerSkill'
  checkKnownFields(config, ['strengthPerTier'], where, 'config', issues)
  issues.push(...checkNumber(config.strengthPerTier, `${where}.strengthPerTier`, 0))
}

/** Kiểm tra toàn bộ dữ liệu kỹ năng đồng hành. */
export function checkPartnerSkillData(data: GameData, issues: string[]): void {
  checkPartnerSkills(data, issues)
  checkPartnerSkillRefs(data, issues)
  checkPartnerSkillConfig(data, issues)
}
