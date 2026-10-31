// Kiểm tra config.starter (docs/rules/starters.md): ô ứng viên và điều kiện theo registry
// STARTER_CONDITIONS, level, tiền, vật phẩm ban đầu.

import { STARTER_CONDITION_KINDS, type GameData, type StarterCondition } from '../model'
import { STARTER_CONDITIONS, starterSlotPool } from '../registries'
import { asObject, checkInteger, checkNumber } from '../shared'
import { checkKnownFields, checkStackItemId } from './checks'

/** Một điều kiện: object, `kind` thuộc STARTER_CONDITION_KINDS, không trường lạ, params đúng. */
function checkCondition(data: GameData, value: unknown, where: string, issues: string[]): boolean {
  const condition = asObject(value)
  const kind = condition?.kind
  if (!condition || !(STARTER_CONDITION_KINDS as readonly unknown[]).includes(kind)) {
    issues.push(`${where}: điều kiện lạ "${String(kind)}"`)
    return false
  }
  // Ép kiểu: kind đã nằm trong STARTER_CONDITION_KINDS ở trên.
  const handler = STARTER_CONDITIONS[kind as StarterCondition['kind']]
  const before = issues.length
  checkKnownFields(condition, ['kind', ...handler.fields], where, `điều kiện "${kind}"`, issues)
  // Ép kiểu: validate tự kiểm từng trường của điều kiện đọc từ JSON.
  const problems = handler.validate(condition as never, data)
  issues.push(...problems.map((problem) => `${where}: ${problem}`))
  return issues.length === before
}

function checkSlots(
  data: GameData,
  slots: unknown,
  canBuildPools: boolean,
  issues: string[]
): void {
  if (!Array.isArray(slots) || slots.length === 0) {
    issues.push('config.starter.slots cần ít nhất một ô')
    return
  }
  slots.forEach((slot: unknown, i) => {
    const where = `config.starter.slots[${i}]`
    const conditions = asObject(slot)?.conditions
    if (!Array.isArray(conditions)) {
      issues.push(`${where}.conditions phải là danh sách`)
      return
    }
    checkKnownFields(slot, ['conditions'], where, 'ô khởi đầu', issues)
    const isValid = conditions.every((condition: unknown, j) =>
      checkCondition(data, condition, `${where}.conditions[${j}]`, issues)
    )
    // Ép kiểu: mọi điều kiện của ô vừa qua kiểm tra.
    if (isValid && canBuildPools && starterSlotPool(data, { conditions } as never).length === 0) {
      issues.push(`${where}: không có loài dạng đầu có tiến hóa nào thỏa mọi điều kiện`)
    }
  })
}

/** Kiểm tra toàn bộ config.starter. */
export function checkStarterData(data: GameData, issues: string[]): void {
  const starter = asObject(data.config.starter)
  if (!starter) {
    issues.push('config.starter phải là object')
    return
  }
  // Danh sách loài của ô cần chuỗi tiến hóa, dạng loài, phẩm cấp loài hợp lệ: chỉ dựng khi các phần
  // kiểm tra trước chưa báo lỗi (dữ liệu hỏng có thể làm việc tra cứu ném lỗi).
  checkSlots(data, starter.slots, issues.length === 0, issues)
  checkKnownFields(
    starter,
    ['slots', 'level', 'money', 'items'],
    'config.starter',
    'config',
    issues
  )
  issues.push(...checkInteger(starter.level, 'config.starter.level', 1))
  issues.push(...checkNumber(starter.money, 'config.starter.money', 0))
  for (const [itemId, count] of Object.entries(asObject(starter.items) ?? {})) {
    issues.push(...checkStackItemId(data, itemId, 'config.starter.items'))
    issues.push(...checkInteger(count, `config.starter.items.${itemId}`, 1))
  }
}
