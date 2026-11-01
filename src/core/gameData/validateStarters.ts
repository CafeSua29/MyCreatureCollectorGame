// Kiểm tra config.starter (docs/rules/starters.md): ô ứng viên và điều kiện theo registry
// STARTER_CONDITIONS, mở khóa xuyên save, level, tiền, vật phẩm ban đầu.

import {
  STARTER_CONDITION_KINDS,
  type GameData,
  type StarterCondition,
  type StarterUnlock
} from '../model'
import {
  ACHIEVEMENT_CONDITIONS,
  STARTER_CONDITIONS,
  checkIdList,
  checkTypedParams,
  isStarterEligible,
  starterSlotPool
} from '../registries'
import { asObject, checkInteger, checkNumber, isFiniteNumber } from '../shared'
import { checkKnownFields, checkStackItemId, fieldList } from './checks'

const UNLOCK_FIELDS = fieldList<StarterUnlock>({ speciesIds: true, condition: true, value: true })

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

/**
 * Một mục mở khóa: loài tồn tại và làm khởi đầu được, điều kiện như thành tựu, value số dương không
 * vượt trần tiến độ của điều kiện.
 */
function checkUnlock(data: GameData, value: unknown, where: string, issues: string[]): void {
  const unlock = asObject(value)
  if (!unlock) {
    issues.push(`${where} phải là object`)
    return
  }
  checkKnownFields(unlock, UNLOCK_FIELDS, where, 'mục mở khóa', issues)
  const idIssues = checkIdList(unlock.speciesIds, 'speciesIds', data.species, { label: 'loài' })
  issues.push(...idIssues.map((issue) => `${where}: ${issue}`))
  if (idIssues.length === 0) {
    // Ép kiểu: checkIdList vừa đảm bảo danh sách id loài.
    for (const id of unlock.speciesIds as string[]) {
      if (!isStarterEligible(data, id)) {
        issues.push(`${where}: "${id}" không phải loài dạng đầu có tiến hóa`)
      }
    }
  }
  const conditionIssues = checkTypedParams(
    ACHIEVEMENT_CONDITIONS,
    unlock.condition,
    `${where}.condition`,
    data
  )
  issues.push(...conditionIssues)
  if (!isFiniteNumber(unlock.value) || unlock.value <= 0) {
    issues.push(`${where}.value phải là số > 0, nhận ${String(unlock.value)}`)
    return
  }
  if (conditionIssues.length > 0) return
  // Ép kiểu: checkTypedParams vừa đảm bảo `type` có trong registry.
  const { type, ...params } = unlock.condition as StarterUnlock['condition']
  const maxProgress = ACHIEVEMENT_CONDITIONS[type].maxProgress(params, data)
  if (maxProgress !== null && unlock.value > maxProgress) {
    issues.push(`${where}.value ${unlock.value} vượt tiến độ tối đa ${maxProgress}`)
  }
}

function checkUnlocks(data: GameData, unlocks: unknown, issues: string[]): void {
  if (!Array.isArray(unlocks)) {
    issues.push('config.starter.unlocks phải là danh sách')
    return
  }
  unlocks.forEach((unlock: unknown, i) =>
    checkUnlock(data, unlock, `config.starter.unlocks[${i}]`, issues)
  )
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
  // Mở khóa cũng cần chuỗi tiến hóa hợp lệ (loài làm khởi đầu được).
  const isDataSound = issues.length === 0
  checkSlots(data, starter.slots, isDataSound, issues)
  if (isDataSound) checkUnlocks(data, starter.unlocks, issues)
  if (typeof starter.unlockOwnedLines !== 'boolean') {
    issues.push('config.starter.unlockOwnedLines phải là true / false')
  }
  checkKnownFields(
    starter,
    ['slots', 'unlocks', 'unlockOwnedLines', 'level', 'money', 'items'],
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
