// Kiểm tra dữ liệu hóa hình (docs/rules/human-form.md): config.humanForm, trường `humanForm` của race.

import type { GameData } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkDrops, checkKnownFields } from './checks'
import { validatePartialStats } from '../registries'

const FIELDS = [
  'minAwakening',
  'pillItemId',
  'costPerLevel',
  'lifespanMultiplier',
  'statPercents',
  'trueForm',
  'dropFromFloor',
  'floorBossDrops'
]

function checkConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.humanForm)
  if (!config) {
    issues.push('config.humanForm phải là object')
    return
  }
  const at = (field: string): string => `config.humanForm.${field}`
  checkKnownFields(config, FIELDS, 'config.humanForm', 'config', issues)
  issues.push(...checkInteger(config.minAwakening, at('minAwakening'), 0))
  issues.push(...checkNumber(config.costPerLevel, at('costPerLevel'), 0))
  issues.push(...checkNumber(config.lifespanMultiplier, at('lifespanMultiplier'), 1))
  issues.push(...checkInteger(config.dropFromFloor, at('dropFromFloor'), 1))
  const pillId = config.pillItemId
  if (typeof pillId !== 'string' || data.items[pillId]?.category !== 'material') {
    issues.push(`${at('pillItemId')} phải là vật phẩm loại material, nhận "${String(pillId)}"`)
  }
  issues.push(...validatePartialStats(config.statPercents, at('statPercents')))
  if (asObject(config.statPercents) === null) issues.push(`${at('statPercents')} phải là object`)
  const trueForm = asObject(config.trueForm)
  if (!trueForm) issues.push(`${at('trueForm')} phải là object`)
  else {
    checkKnownFields(
      trueForm,
      ['statPercentBase', 'statPercentPerAwakening'],
      at('trueForm'),
      'config',
      issues
    )
    issues.push(...checkNumber(trueForm.statPercentBase, at('trueForm.statPercentBase')))
    issues.push(
      ...checkNumber(trueForm.statPercentPerAwakening, at('trueForm.statPercentPerAwakening'), 0)
    )
  }
  if (!Array.isArray(config.floorBossDrops))
    issues.push(`${at('floorBossDrops')} phải là danh sách`)
  else checkDrops(data, config.floorBossDrops, at('floorBossDrops'), issues)
}

/** Kiểm tra mọi dữ liệu hóa hình. */
export function checkHumanFormData(data: GameData, issues: string[]): void {
  checkConfig(data, issues)
  for (const race of Object.values(data.races)) {
    if (typeof race.humanForm !== 'boolean') {
      issues.push(`Race "${race.id}": humanForm phải là true / false`)
    }
  }
}
