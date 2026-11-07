// Kiểm tra Fusion Power (docs/rules/fusion-power.md): skill gốc `fusionPower` có cờ, config.fusionPower
// (power ≥ 0, lượt nguyên ≥ 1, trạng thái tồn tại đúng loại buff / debuff, hệ tồn tại).

import { FUSION_POWER_SKILL_ID, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const WHERE = 'config.fusionPower'

/** Danh sách trạng thái tồn tại, đúng loại, khác rỗng. */
function checkStatusList(
  data: GameData,
  value: unknown,
  { field, kind }: { field: string; kind: 'buff' | 'debuff' },
  issues: string[]
): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${WHERE}.${field} phải là danh sách khác rỗng`)
    return
  }
  for (const id of value) {
    const status = typeof id === 'string' ? data.statuses[id] : undefined
    if (status?.kind !== kind) issues.push(`${WHERE}.${field}: "${String(id)}" không phải ${kind}`)
  }
}

/** Kiểm tra skill gốc và config.fusionPower. */
export function checkFusionPower(data: GameData, issues: string[]): void {
  const base = data.skills[FUSION_POWER_SKILL_ID]
  if (base?.fusionPower !== true) {
    issues.push(`Thiếu skill "${FUSION_POWER_SKILL_ID}" mang cờ fusionPower (Fusion Power)`)
  }
  for (const skill of Object.values(data.skills)) {
    if (skill.fusionPower !== undefined && skill.id !== FUSION_POWER_SKILL_ID) {
      issues.push(`Skill "${skill.id}": cờ fusionPower chỉ ở skill "${FUSION_POWER_SKILL_ID}"`)
    }
  }
  const config = asObject(data.config.fusionPower)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(
    config,
    [
      'power',
      'statusTurns',
      'shortStatusTurns',
      'buffStatusIds',
      'debuffStatusIds',
      'contactStatusByElement',
      'orbAiMultiplier'
    ],
    WHERE,
    'Fusion Power',
    issues
  )
  const power = asObject(config.power)
  checkKnownFields(power, ['single', 'teamBuff', 'teamDebuff'], `${WHERE}.power`, 'power', issues)
  for (const key of ['single', 'teamBuff', 'teamDebuff']) {
    issues.push(...checkNumber(power?.[key], `${WHERE}.power.${key}`, 0))
  }
  issues.push(...checkInteger(config.statusTurns, `${WHERE}.statusTurns`, 1))
  issues.push(...checkNumber(config.orbAiMultiplier, `${WHERE}.orbAiMultiplier`, 0))
  for (const [id, turns] of Object.entries(asObject(config.shortStatusTurns) ?? {})) {
    if (!Object.hasOwn(data.statuses, id))
      issues.push(`${WHERE}.shortStatusTurns: trạng thái lạ "${id}"`)
    issues.push(...checkInteger(turns, `${WHERE}.shortStatusTurns.${id}`, 1))
  }
  checkStatusList(data, config.buffStatusIds, { field: 'buffStatusIds', kind: 'buff' }, issues)
  checkStatusList(
    data,
    config.debuffStatusIds,
    { field: 'debuffStatusIds', kind: 'debuff' },
    issues
  )
  for (const [elementId, statusId] of Object.entries(
    asObject(config.contactStatusByElement) ?? {}
  )) {
    if (!Object.hasOwn(data.elements, elementId)) {
      issues.push(`${WHERE}.contactStatusByElement: hệ lạ "${elementId}"`)
    }
    if (typeof statusId !== 'string' || data.statuses[statusId]?.kind !== 'buff') {
      issues.push(`${WHERE}.contactStatusByElement.${elementId} phải là buff tồn tại`)
    }
  }
}
