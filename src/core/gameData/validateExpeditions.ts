// Kiểm tra dữ liệu thám hiểm (docs/rules/expeditions.md): expeditions.json, config.expeditions.

import { EXPEDITION_REQUIREMENTS, checkTypedParams } from '../registries'
import { EXPEDITION_KINDS, type GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields } from './checks'

const FIELDS = [
  'id',
  'kind',
  'durationDays',
  'requirements',
  'powerPerFloor',
  'moneyPerFloor',
  'drops',
  'eggChance'
]
const CONFIG_FIELDS = [
  'boardMin',
  'boardMax',
  'refreshDays',
  'minSuccess',
  'maxSuccess',
  'expPerDayPerFloor',
  'injuryChance',
  'affinityPerDay'
]

function checkDrops(data: GameData, value: unknown, where: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${where}: drops phải là danh sách`)
    return
  }
  value.forEach((entry: unknown, i: number) => {
    const at = `${where}: drops[${i}]`
    const drop = asObject(entry)
    checkKnownFields(drop ?? {}, ['itemId', 'chance', 'min', 'max'], at, 'đồ thám hiểm', issues)
    if (typeof drop?.itemId !== 'string' || !(drop.itemId in data.items)) {
      issues.push(`${at}.itemId: vật phẩm không tồn tại "${String(drop?.itemId)}"`)
    }
    issues.push(...checkNumber(drop?.chance, `${at}.chance`, 0, 100))
    issues.push(...checkInteger(drop?.min, `${at}.min`, 1))
    issues.push(...checkInteger(drop?.max, `${at}.max`, 1))
    if (typeof drop?.min === 'number' && typeof drop.max === 'number' && drop.max < drop.min) {
      issues.push(`${at}: max phải ≥ min`)
    }
  })
}

/** Kiểm tra mẫu thám hiểm và config.expeditions. */
export function checkExpeditionData(data: GameData, issues: string[]): void {
  for (const def of Object.values(data.expeditions)) {
    const where = `Thám hiểm "${def.id}"`
    checkKnownFields(def, FIELDS, where, 'thám hiểm', issues)
    if (!(EXPEDITION_KINDS as readonly unknown[]).includes(def.kind)) {
      issues.push(`${where}: kind phải là ${EXPEDITION_KINDS.join(' / ')}`)
    }
    issues.push(...checkInteger(def.durationDays, `${where}: durationDays`, 1))
    issues.push(...checkNumber(def.powerPerFloor, `${where}: powerPerFloor`, 0))
    issues.push(...checkNumber(def.moneyPerFloor, `${where}: moneyPerFloor`, 0))
    if (!Array.isArray(def.requirements)) issues.push(`${where}: requirements phải là danh sách`)
    else {
      def.requirements.forEach((requirement, i) => {
        issues.push(
          ...checkTypedParams(
            EXPEDITION_REQUIREMENTS,
            requirement,
            `${where}: requirements[${i}]`,
            data
          )
        )
      })
    }
    checkDrops(data, def.drops, where, issues)
    issues.push(...checkNumber(def.eggChance, `${where}: eggChance`, 0, 100))
  }
  const config = asObject(data.config.expeditions)
  if (!config) {
    issues.push('config.expeditions phải là object')
    return
  }
  const at = (field: string): string => `config.expeditions.${field}`
  checkKnownFields(config, CONFIG_FIELDS, 'config.expeditions', 'config', issues)
  issues.push(...checkInteger(config.boardMin, at('boardMin'), 0))
  issues.push(...checkInteger(config.boardMax, at('boardMax'), 0))
  if ((config.boardMax as number) < (config.boardMin as number)) {
    issues.push(`${at('boardMax')} phải ≥ boardMin`)
  }
  issues.push(...checkInteger(config.refreshDays, at('refreshDays'), 1))
  issues.push(...checkNumber(config.minSuccess, at('minSuccess'), 0))
  issues.push(...checkNumber(config.maxSuccess, at('maxSuccess'), 0))
  if ((config.maxSuccess as number) < (config.minSuccess as number)) {
    issues.push(`${at('maxSuccess')} phải ≥ minSuccess`)
  }
  issues.push(...checkNumber(config.expPerDayPerFloor, at('expPerDayPerFloor'), 0))
  issues.push(...checkNumber(config.injuryChance, at('injuryChance'), 0, 100))
  issues.push(...checkInteger(config.affinityPerDay, at('affinityPerDay'), 0))
}
