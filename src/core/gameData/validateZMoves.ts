// Kiểm tra dữ liệu Z-Move (docs/rules/z-moves.md): config.transform.zMove, skill Z-Move (zMove), số
// power riêng (zPower), Z-Power của skill trạng thái (zEffects). Z-Crystal kiểm tra theo category ở
// itemCategories.ts; learnset không có Z-Move ở validateTransform.ts.

import { checkZEffects } from '../registries'
import { ZMOVE_KINDS, type GameData, type Skill } from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkPowerTable } from './validateTransform'

/** Số và id của config.transform.zMove. */
function checkZMoveConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.transform?.zMove)
  if (!config) {
    issues.push('config.transform.zMove không hợp lệ')
    return
  }
  const zMove = data.config.transform.zMove
  const push = (problems: string[]): void => {
    for (const problem of problems) issues.push(`config.transform.zMove.${problem}`)
  }
  if (data.items[zMove.keyItemId]?.category !== 'keyItem') {
    push([`keyItemId phải là vật phẩm chìa khóa, nhận "${String(zMove.keyItemId)}"`])
  }
  push(checkPowerTable(zMove.powerTable, 'powerTable'))
  push(checkNumber(zMove.variableHitsPowerFactor, 'variableHitsPowerFactor', Number.MIN_VALUE))
  push(checkNumber(zMove.protectDamagePercent, 'protectDamagePercent', 0, 100))
  push(checkNumber(zMove.crystalDropChance, 'crystalDropChance', 0, 100))
}

/**
 * Trường Z-Move của một skill: zMove hợp lệ, không cùng là chiêu Max; Z-Move theo hệ gây sát thương
 * (power / loại thay theo skill gốc); zPower (nguyên > 0) chỉ ở skill gây sát thương thường; zEffects
 * chỉ ở skill trạng thái thường.
 */
function checkSkillZFields(data: GameData, skill: Skill, issues: string[]): void {
  const where = `Skill "${skill.id}"`
  if (skill.zMove !== undefined) {
    if (!ZMOVE_KINDS.includes(skill.zMove)) {
      issues.push(`${where}: zMove phải là một trong ${ZMOVE_KINDS.join(', ')}`)
    }
    if (skill.maxMove !== undefined) issues.push(`${where}: không vừa là chiêu Max vừa là Z-Move`)
    if (skill.zMove === 'z' && skill.power <= 0) {
      issues.push(`${where}: Z-Move theo hệ phải gây sát thương`)
    }
    if (skill.zPower !== undefined || skill.zEffects !== undefined) {
      issues.push(`${where}: Z-Move không có zPower / zEffects`)
    }
    return
  }
  if (skill.zPower !== undefined) {
    issues.push(...checkInteger(skill.zPower, `${where}: zPower`, 1))
    if (skill.power <= 0 || skill.maxMove !== undefined) {
      issues.push(`${where}: zPower chỉ dùng cho skill gây sát thương`)
    }
  }
  if (skill.maxMove !== undefined && skill.zEffects !== undefined) {
    issues.push(`${where}: chiêu Max không có zEffects`)
  }
  for (const issue of checkZEffects(skill, data)) issues.push(`${where}: ${issue}`)
}

/** Kiểm tra mọi dữ liệu Z-Move; mỗi hệ tối đa một Z-Move theo hệ. */
export function checkZMoveData(data: GameData, issues: string[]): void {
  checkZMoveConfig(data, issues)
  const skills = Object.values(data.skills)
  for (const skill of skills) checkSkillZFields(data, skill, issues)
  for (const elementId of Object.keys(data.elements)) {
    const count = skills.filter((s) => s.zMove === 'z' && s.elementId === elementId).length
    if (count > 1) issues.push(`Z-Move: hệ "${elementId}" có ${count} Z-Move theo hệ (tối đa 1)`)
  }
}
