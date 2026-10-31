// Kiểm tra thế mạnh / thế nhanh (docs/rules/move-styles.md): config `moveStyles` và trường `styles`
// của skill. Chiêu Max và hợp kích kỹ không có thế.

import { MOVE_STYLES, isBattleOnlyMove, type GameData, type MoveStyleNumbers } from '../model'
import { asObject, checkInteger, checkNumber, isFiniteNumber } from '../shared'
import { checkKnownFields, fieldList } from './checks'

const WHERE = 'config.moveStyles'

const STYLE_NUMBER_FIELDS = fieldList<MoveStyleNumbers>({
  powerMultiplier: true,
  secondaryChanceShift: true,
  stageBonus: true,
  statusTurnsBonus: true,
  priorityShift: true,
  nextTurnSpeedMultiplier: true
})

/**
 * Số của một thế: hệ số power / tốc độ > 0, điểm % tỉ lệ phụ là số, bậc / số lượt cộng thêm nguyên
 * ≥ 0, priority cộng thêm nguyên. `partial`: số ghi đè của skill (được thiếu số).
 */
function checkStyleNumbers(
  value: unknown,
  where: string,
  { partial }: { partial: boolean },
  issues: string[]
): void {
  const numbers = asObject(value)
  if (!numbers) {
    issues.push(`${where} phải là object`)
    return
  }
  checkKnownFields(numbers, STYLE_NUMBER_FIELDS, where, 'số của thế', issues)
  const check = (field: keyof MoveStyleNumbers, run: (v: unknown) => string[]): void => {
    if (partial && numbers[field] === undefined) return
    issues.push(...run(numbers[field]))
  }
  for (const field of ['powerMultiplier', 'nextTurnSpeedMultiplier'] as const) {
    check(field, (v) => checkNumber(v, `${where}.${field}`, Number.MIN_VALUE))
  }
  check('secondaryChanceShift', (v) =>
    isFiniteNumber(v) ? [] : [`${where}.secondaryChanceShift phải là số, nhận ${String(v)}`]
  )
  check('stageBonus', (v) => checkInteger(v, `${where}.stageBonus`, 0))
  check('statusTurnsBonus', (v) => checkInteger(v, `${where}.statusTurnsBonus`, 0))
  check('priorityShift', (v) => checkInteger(v, `${where}.priorityShift`))
}

/** Kiểm tra config.moveStyles. */
export function checkMoveStylesConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.moveStyles)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(config, ['unlockMastery', ...MOVE_STYLES], WHERE, 'config', issues)
  issues.push(...checkInteger(config.unlockMastery, `${WHERE}.unlockMastery`, 1))
  for (const style of MOVE_STYLES) {
    checkStyleNumbers(config[style], `${WHERE}.${style}`, { partial: false }, issues)
  }
}

/** Trường `styles` của mọi skill: `true` hoặc object ghi đè số theo thế; không có ở chiêu Max / Z-Move / hợp kích kỹ. */
export function checkSkillStyles(data: GameData, issues: string[]): void {
  for (const skill of Object.values(data.skills)) {
    const styles: unknown = skill.styles
    if (styles === undefined) continue
    const where = `Skill "${skill.id}": styles`
    if (isBattleOnlyMove(skill) || skill.id in data.comboSkills) {
      issues.push(`${where}: chiêu Max / Z-Move / hợp kích kỹ không có thế`)
      continue
    }
    if (styles === true) continue
    const overrides = asObject(styles)
    if (!overrides) {
      issues.push(`${where} phải là true hoặc object { strong?, agile? }`)
      continue
    }
    checkKnownFields(overrides, MOVE_STYLES, where, 'styles', issues)
    for (const style of MOVE_STYLES) {
      if (overrides[style] === undefined) continue
      checkStyleNumbers(overrides[style], `${where}.${style}`, { partial: true }, issues)
    }
  }
}
