// Kiểm tra dữ liệu vị trí ra đòn (docs/rules/hit-locations.md): bodyParts.json,
// config.hitLocations, bodyParts / weakPoints của nhóm race / race / loài.

import { asObject, checkInteger, checkNumber } from '../shared'
import { SKILL_EFFECTS } from '../registries'
import type { BodyPartDef, GameData } from '../model'
import { checkEffects, checkEffectTargets, checkKnownFields, fieldList } from './checks'

const BODY_PART_FIELDS = fieldList<BodyPartDef>({
  id: true,
  accuracyPercent: true,
  damagePercent: true,
  critStage: true,
  hitEffects: true,
  breakPercent: true,
  breakEffects: true,
  breakDropPercent: true,
  knockoutCorePercent: true
})

/** Hiệu ứng của bộ phận chạy lên quái bị đánh như skill nhắm `enemy`. */
function checkPartEffects(data: GameData, part: BodyPartDef, issues: string[]): void {
  const where = `Bộ phận "${part.id}"`
  for (const key of ['hitEffects', 'breakEffects'] as const) {
    checkEffects(SKILL_EFFECTS, part[key], `${where}.${key}`, data, issues)
    checkEffectTargets(part[key], 'enemy', `${where}.${key}`, issues)
    for (const effect of Array.isArray(part[key]) ? part[key] : []) {
      // Chỉ hiệu ứng lên từng mục tiêu: hiệu ứng cả chiêu / rút về không có nghĩa với bộ phận.
      const handler = SKILL_EFFECTS[effect.type]
      if (handler && handler.timing === 'perSkill') {
        issues.push(`${where}.${key}: hook "${effect.type}" chạy cho cả chiêu, không dùng được`)
      }
    }
  }
}

function checkPartList(data: GameData, issues: string[]): void {
  const parts = Object.values(data.bodyParts)
  if (parts.length === 0) issues.push('bodyParts: cần ít nhất một bộ phận')
  for (const part of parts) {
    const where = `Bộ phận "${part.id}"`
    checkKnownFields(part, BODY_PART_FIELDS, where, 'bộ phận', issues)
    // Accuracy / sát thương không xuống dưới 0 (−100% = 0).
    issues.push(...checkNumber(part.accuracyPercent, `${where}.accuracyPercent`, -100))
    issues.push(...checkNumber(part.damagePercent, `${where}.damagePercent`, -100))
    issues.push(...checkInteger(part.critStage, `${where}.critStage`, 0))
    if (part.breakPercent !== undefined) {
      issues.push(...checkNumber(part.breakPercent, `${where}.breakPercent`, Number.MIN_VALUE))
    }
    issues.push(...checkNumber(part.breakDropPercent, `${where}.breakDropPercent`, 0))
    issues.push(...checkNumber(part.knockoutCorePercent, `${where}.knockoutCorePercent`, -100))
    checkPartEffects(data, part, issues)
  }
}

/** Danh sách id bộ phận: không trùng, tồn tại; trả về danh sách hợp lệ (để so điểm yếu). */
function checkPartIds(data: GameData, value: unknown, where: string, issues: string[]): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    issues.push(`${where} phải là danh sách id bộ phận`)
    return []
  }
  const ids = value as string[]
  if (new Set(ids).size !== ids.length) issues.push(`${where} có phần tử trùng`)
  for (const id of ids.filter((entry) => !Object.hasOwn(data.bodyParts, entry))) {
    issues.push(`${where}: bộ phận không tồn tại "${id}"`)
  }
  return ids
}

/** bodyParts (không rỗng) / weakPoints (≤ maxWeakPoints, thuộc bodyParts đã trộn) của một mục. */
function checkOwner(
  data: GameData,
  owner: { bodyParts?: unknown; weakPoints?: unknown },
  { where, inheritedParts }: { where: string; inheritedParts: readonly string[] },
  issues: string[]
): readonly string[] {
  let parts = inheritedParts
  if (owner.bodyParts !== undefined) {
    parts = checkPartIds(data, owner.bodyParts, `${where}.bodyParts`, issues)
    if (parts.length === 0) issues.push(`${where}.bodyParts phải có ít nhất một bộ phận`)
  }
  if (owner.weakPoints === undefined) return parts
  const weak = checkPartIds(data, owner.weakPoints, `${where}.weakPoints`, issues)
  if (weak.length > data.config.hitLocations.maxWeakPoints) {
    issues.push(
      `${where}.weakPoints tối đa ${data.config.hitLocations.maxWeakPoints} bộ phận, nhận ${weak.length}`
    )
  }
  for (const id of weak.filter((entry) => !parts.includes(entry))) {
    issues.push(`${where}.weakPoints: "${id}" không phải bộ phận của nó`)
  }
  return parts
}

function checkConfig(data: GameData, issues: string[]): readonly string[] {
  const config = asObject(data.config.hitLocations)
  if (!config) {
    issues.push('config.hitLocations phải là object')
    return []
  }
  const where = 'config.hitLocations'
  checkKnownFields(
    config,
    [
      'defaultBodyParts',
      'maxWeakPoints',
      'weakPointDamagePercent',
      'weakPointChanceMultiplier',
      'weakPointBreakMultiplier',
      'swoopTurns',
      'offBalanceTurns',
      'offBalanceCritStage',
      'aiUnknownWeakPercent'
    ],
    where,
    'config',
    issues
  )
  const parts = checkPartIds(data, config.defaultBodyParts, `${where}.defaultBodyParts`, issues)
  if (parts.length === 0) issues.push(`${where}.defaultBodyParts phải có ít nhất một bộ phận`)
  issues.push(...checkInteger(config.maxWeakPoints, `${where}.maxWeakPoints`, 0))
  issues.push(
    ...checkNumber(config.weakPointDamagePercent, `${where}.weakPointDamagePercent`, -100)
  )
  issues.push(
    ...checkNumber(config.weakPointChanceMultiplier, `${where}.weakPointChanceMultiplier`, 0)
  )
  issues.push(
    ...checkNumber(config.weakPointBreakMultiplier, `${where}.weakPointBreakMultiplier`, 0)
  )
  issues.push(...checkInteger(config.swoopTurns, `${where}.swoopTurns`, 0))
  issues.push(...checkInteger(config.offBalanceTurns, `${where}.offBalanceTurns`, 0))
  issues.push(...checkInteger(config.offBalanceCritStage, `${where}.offBalanceCritStage`, 0))
  issues.push(...checkNumber(config.aiUnknownWeakPercent, `${where}.aiUnknownWeakPercent`, 0, 100))
  return parts
}

/** Kiểm tra mọi dữ liệu vị trí ra đòn. */
export function checkBodyPartData(data: GameData, issues: string[]): void {
  checkPartList(data, issues)
  const defaults = checkConfig(data, issues)
  const groupParts: Record<string, readonly string[]> = {}
  for (const group of Object.values(data.raceGroups)) {
    const where = `Nhóm race "${group.id}"`
    groupParts[group.id] = checkOwner(data, group, { where, inheritedParts: defaults }, issues)
  }
  const raceParts: Record<string, readonly string[]> = {}
  for (const race of Object.values(data.races)) {
    // Race đã trộn trường của nhóm (resolveRaces) nên chỉ kiểm tra khi khác nhóm.
    const group = data.raceGroups[race.groupId]
    const inherited = groupParts[race.groupId] ?? defaults
    const own = race.bodyParts !== group?.bodyParts || race.weakPoints !== group?.weakPoints
    raceParts[race.id] = own
      ? checkOwner(data, race, { where: `Race "${race.id}"`, inheritedParts: inherited }, issues)
      : (race.bodyParts ?? inherited)
  }
  for (const species of Object.values(data.species)) {
    if (species.kind !== 'normal') continue
    const inherited = raceParts[species.raceId] ?? defaults
    checkOwner(data, species, { where: `Loài "${species.id}"`, inheritedParts: inherited }, issues)
  }
}
