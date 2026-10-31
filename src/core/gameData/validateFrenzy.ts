// Kiểm tra dữ liệu cuồng bạo (docs/rules/frenzy.md): config.frenzy, trường `frenzyProne` của race.

import { FRENZY_ROLES, type GameData, type FrenzyRoleNumbers } from '../model'
import { asObject, checkNumber } from '../shared'
import { checkKnownFields, fieldList } from './checks'

const WHERE = 'config.frenzy'

const ROLE_FIELDS = fieldList<FrenzyRoleNumbers>({
  hpThresholdPercent: true,
  statPercent: true,
  extraActionChance: true
})

/** Số của một vai trò: ngưỡng và tỉ lệ trong 0–100, % chỉ số là số bất kỳ. */
function checkRole(value: unknown, where: string, issues: string[]): void {
  const role = asObject(value)
  if (!role) {
    issues.push(`${where} phải là object`)
    return
  }
  checkKnownFields(role, ROLE_FIELDS, where, 'số cuồng bạo', issues)
  issues.push(...checkNumber(role.hpThresholdPercent, `${where}.hpThresholdPercent`, 0, 100))
  issues.push(...checkNumber(role.statPercent, `${where}.statPercent`))
  issues.push(...checkNumber(role.extraActionChance, `${where}.extraActionChance`, 0, 100))
}

/** Kiểm tra mọi dữ liệu cuồng bạo. */
export function checkFrenzyData(data: GameData, issues: string[]): void {
  const config = asObject(data.config.frenzy)
  const roles = asObject(config?.roles)
  if (!config || !roles) {
    issues.push(`${WHERE} phải là object có roles`)
  } else {
    checkKnownFields(config, ['roles'], WHERE, 'config', issues)
    checkKnownFields(roles, FRENZY_ROLES, `${WHERE}.roles`, 'vai trò', issues)
    for (const role of FRENZY_ROLES) checkRole(roles[role], `${WHERE}.roles.${role}`, issues)
  }
  for (const race of Object.values(data.races)) {
    const value: unknown = race.frenzyProne
    if (value !== undefined && typeof value !== 'boolean') {
      issues.push(`Race "${race.id}": frenzyProne phải là true / false, nhận ${String(value)}`)
    }
  }
}
