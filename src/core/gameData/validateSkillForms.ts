// Kiểm tra trường skill theo cơ chế Pokémon cần luồng trận riêng (docs/rules/pokemon-moves.md):
// skill đổi theo dạng của quái dùng, Bide, Sky Drop, Pollen Puff, Pursuit, Round, đòn Stellar.

import { asObject, checkInteger, checkNumber } from '../shared'
import { SKILL_EFFECTS } from '../registries'
import { SKILL_CATEGORY_RULES, SKILL_TARGETS, type GameData, type Skill } from '../model'
import { checkEffects } from './checks'

/** Một mục formOverrides: dạng tồn tại, trường đổi hợp lệ, có ít nhất một trường đổi. */
function checkFormOverride(data: GameData, value: unknown, field: string): string[] {
  const obj = asObject(value)
  if (!obj) return [`${field} phải là object`]
  const issues: string[] = []
  const speciesIds = obj.speciesIds
  if (!Array.isArray(speciesIds) || speciesIds.length === 0) {
    issues.push(`${field}.speciesIds phải là danh sách không rỗng`)
  } else {
    for (const id of speciesIds.filter((entry) => !Object.hasOwn(data.species, entry))) {
      issues.push(`${field}.speciesIds: loài không tồn tại "${String(id)}"`)
    }
  }
  const changes = ['elementId', 'power', 'hits', 'target', 'categoryRule', 'stellar']
  if (!changes.some((key) => obj[key] !== undefined)) {
    issues.push(`${field} cần ít nhất một trong ${changes.join(' / ')}`)
  }
  if (obj.elementId !== undefined && !Object.hasOwn(data.elements, String(obj.elementId))) {
    issues.push(`${field}.elementId: hệ không tồn tại "${String(obj.elementId)}"`)
  }
  if (obj.power !== undefined) issues.push(...checkNumber(obj.power, `${field}.power`, 1))
  if (obj.hits !== undefined) {
    const hits = asObject(obj.hits)
    issues.push(...checkInteger(hits?.min, `${field}.hits.min`, 1))
    issues.push(...checkInteger(hits?.max, `${field}.hits.max`, 1))
    if (typeof hits?.min === 'number' && typeof hits.max === 'number' && hits.min > hits.max) {
      issues.push(`${field}.hits: min không được lớn hơn max`)
    }
  }
  if (obj.target !== undefined && !(SKILL_TARGETS as readonly unknown[]).includes(obj.target)) {
    issues.push(`${field}.target phải là ${SKILL_TARGETS.join(' / ')}`)
  }
  if (
    obj.categoryRule !== undefined &&
    !(SKILL_CATEGORY_RULES as readonly unknown[]).includes(obj.categoryRule)
  ) {
    issues.push(`${field}.categoryRule phải là ${SKILL_CATEGORY_RULES.join(' / ')}`)
  }
  if (obj.stellar !== undefined && obj.stellar !== true) {
    issues.push(`${field}.stellar chỉ được là true`)
  }
  return issues
}

/** Kiểm tra formOverrides, bide, carriesTarget, onAlly, pursuit, pullsAllySameSkill, stellar. */
export function checkSkillFormFields(data: GameData, skill: Skill, where: string): string[] {
  const issues: string[] = []
  if (skill.formOverrides !== undefined) {
    if (!Array.isArray(skill.formOverrides) || skill.formOverrides.length === 0) {
      issues.push(`${where}: formOverrides phải là danh sách không rỗng`)
    } else {
      skill.formOverrides.forEach((entry, i) =>
        issues.push(...checkFormOverride(data, entry, `${where}: formOverrides[${i}]`))
      )
    }
  }
  if (skill.bide !== undefined) {
    issues.push(...checkInteger(asObject(skill.bide)?.turns, `${where}: bide.turns`, 1))
    if (skill.fixedDamage?.kind !== 'stored') {
      issues.push(`${where}: bide cần fixedDamage kiểu stored`)
    }
  } else if (skill.fixedDamage?.kind === 'stored') {
    issues.push(`${where}: fixedDamage stored chỉ dùng với bide`)
  }
  if (skill.fixedDamage?.kind === 'stored') {
    issues.push(...checkNumber(skill.fixedDamage.multiplier, `${where}: fixedDamage.multiplier`, 0))
  }
  if (skill.carriesTarget !== undefined) {
    const carry = asObject(skill.carriesTarget)
    issues.push(...checkNumber(carry?.maxWeightKg, `${where}: carriesTarget.maxWeightKg`, 0))
    if (skill.charge === undefined) issues.push(`${where}: carriesTarget cần charge`)
  }
  if (skill.onAlly !== undefined) {
    checkEffects(SKILL_EFFECTS, skill.onAlly, `${where}: onAlly`, data, issues)
    if (skill.target !== 'enemy') issues.push(`${where}: onAlly chỉ cho skill nhắm enemy`)
  }
  if (skill.pursuit !== undefined) {
    issues.push(
      ...checkNumber(asObject(skill.pursuit)?.damagePercent, `${where}: pursuit.damagePercent`, 0)
    )
  }
  const vsStatuses = skill.alwaysHitsVsStatusIds
  if (vsStatuses !== undefined) {
    if (!Array.isArray(vsStatuses) || vsStatuses.length === 0) {
      issues.push(`${where}: alwaysHitsVsStatusIds phải là danh sách không rỗng`)
    } else {
      for (const id of vsStatuses.filter((entry) => !Object.hasOwn(data.statuses, entry))) {
        issues.push(`${where}: alwaysHitsVsStatusIds: trạng thái không tồn tại "${String(id)}"`)
      }
    }
  }
  for (const flag of ['pullsAllySameSkill', 'stellar', 'typeless'] as const) {
    if (skill[flag] !== undefined && skill[flag] !== true) {
      issues.push(`${where}: ${flag} chỉ được là true`)
    }
  }
  return issues
}
