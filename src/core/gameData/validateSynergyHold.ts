// Kiểm tra synergy và hold của skill (mục "Synergy", "Hold" ở battle.md). Chiêu Max và hợp kích kỹ
// không có hai trường này (chiêu Max không chờ; hợp kích kỹ đã cần đồng đội ra chiêu chung).

import { isBattleOnlyMove, type GameData, type Skill } from '../model'
import { SKILL_EFFECTS } from '../registries'
import { asObject, checkInteger, checkNumber } from '../shared'
import {
  checkEffects,
  checkEffectTargets,
  checkElementIds,
  checkKnownFields,
  fieldList
} from './checks'
import type { SkillSynergy } from '../model'

const SYNERGY_FIELDS = fieldList<SkillSynergy>({
  partnerElementIds: true,
  powerBonusPercent: true,
  effects: true
})

/**
 * Synergy: hệ đồng đội tồn tại, không lặp; có ít nhất power cộng (> 0, chỉ skill gây sát thương)
 * hoặc hiệu ứng; hiệu ứng theo luật hiệu ứng skill, không rút quái dùng về (lệnh `switchTo` chỉ xét
 * `effects` gốc).
 */
function checkSynergy(data: GameData, skill: Skill, where: string, issues: string[]): void {
  const synergy = asObject(skill.synergy)
  if (!synergy) {
    issues.push(`${where}: synergy phải là object`)
    return
  }
  checkKnownFields(synergy, SYNERGY_FIELDS, where, 'synergy', issues)
  const elementIds = synergy.partnerElementIds
  checkElementIds(data, elementIds, `${where}: partnerElementIds`, issues)
  if (Array.isArray(elementIds) && new Set(elementIds).size !== elementIds.length) {
    issues.push(`${where}: partnerElementIds bị lặp`)
  }
  if (synergy.powerBonusPercent === undefined && synergy.effects === undefined) {
    issues.push(`${where}: synergy cần powerBonusPercent hoặc effects`)
  }
  if (synergy.powerBonusPercent !== undefined) {
    issues.push(
      ...checkNumber(synergy.powerBonusPercent, `${where}: powerBonusPercent`, Number.MIN_VALUE)
    )
    if (skill.power <= 0)
      issues.push(`${where}: powerBonusPercent chỉ dùng cho skill gây sát thương`)
  }
  if (synergy.effects === undefined) return
  const effects = skill.synergy?.effects
  checkEffects(SKILL_EFFECTS, effects, `${where}.effects`, data, issues)
  checkEffectTargets(effects, skill.target, `${where}.effects`, issues)
  if (Array.isArray(effects) && effects.some((e) => SKILL_EFFECTS[e.type]?.switchesUserOut)) {
    issues.push(`${where}: hiệu ứng synergy không được rút quái dùng về`)
  }
}

/** Synergy và hold của mọi skill. */
export function checkSynergyHold(data: GameData, issues: string[]): void {
  for (const skill of Object.values(data.skills)) {
    const where = `Skill "${skill.id}"`
    if (skill.synergy === undefined && skill.hold === undefined) continue
    if (isBattleOnlyMove(skill) || skill.id in data.comboSkills) {
      issues.push(`${where}: chiêu Max / Z-Move / hợp kích kỹ không có synergy / hold`)
      continue
    }
    if (skill.hold !== undefined) issues.push(...checkInteger(skill.hold, `${where}: hold`, 1))
    if (skill.synergy !== undefined) checkSynergy(data, skill, `${where}.synergy`, issues)
  }
}
