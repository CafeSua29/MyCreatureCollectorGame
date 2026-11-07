// Kiểm tra sticker đọc từ save (docs/rules/skill-stickers.md): cấu trúc, skill có sách, độ hiếm, thuộc
// tính tồn tại, không trùng, giá trị trong khoảng, lựa chọn hợp lệ. Id không trùng giữa túi và quái:
// validateEquipmentState (chung bộ đếm nextItemId với trang bị).

import { STICKER_RARITIES, type GameData } from '../model'
import { asObject } from '../shared'
import { isBookableSkill } from './skillBooks'

const STICKER_FIELDS = ['id', 'skillId', 'rarity', 'rolls']
const ROLL_FIELDS = ['attributeId', 'value', 'choice']

/** Trường lạ của object `obj`. */
const unknownFields = (obj: Record<string, unknown>, allowed: readonly string[]): string[] =>
  Object.keys(obj).filter((key) => !allowed.includes(key))

/** Một thuộc tính đã tung: thuộc tính tồn tại, giá trị nguyên trong khoảng, lựa chọn thuộc danh sách. */
function checkRoll(data: GameData, value: unknown, where: string): string[] {
  const roll = asObject(value)
  if (!roll) return [`${where} phải là object thuộc tính`]
  const issues = unknownFields(roll, ROLL_FIELDS).map((key) => `${where} có trường lạ "${key}"`)
  const id = roll.attributeId
  const attribute =
    typeof id === 'string' && Object.hasOwn(data.stickerAttributes, id)
      ? data.stickerAttributes[id]
      : undefined
  if (!attribute) return [...issues, `${where}.attributeId không tồn tại "${String(id)}"`]
  const { range, choices } = attribute
  if (range) {
    const v = roll.value
    const ok = typeof v === 'number' && Number.isSafeInteger(v) && v >= range.min && v <= range.max
    if (!ok) issues.push(`${where}.value phải nguyên trong [${range.min}, ${range.max}]`)
  } else if (roll.value !== undefined) {
    issues.push(`${where}.value: thuộc tính "${attribute.id}" không có giá trị`)
  }
  if (choices) {
    if (typeof roll.choice !== 'string' || !choices.includes(roll.choice)) {
      issues.push(`${where}.choice phải là một trong ${choices.join(', ')}`)
    }
  } else if (roll.choice !== undefined) {
    issues.push(`${where}.choice: thuộc tính "${attribute.id}" không có lựa chọn`)
  }
  return issues
}

/** Kiểm tra một sticker ở vị trí `path` của save. Trả về danh sách lỗi. */
export function validateStickerInstance(data: GameData, value: unknown, path: string): string[] {
  const sticker = asObject(value)
  if (!sticker) return [`${path} phải là object sticker`]
  const issues = unknownFields(sticker, STICKER_FIELDS).map(
    (key) => `${path} có trường lạ "${key}"`
  )
  if (typeof sticker.id !== 'string' || !/^s\d+$/.test(sticker.id)) {
    issues.push(`${path}.id phải có dạng "s<số>"`)
  }
  const skill =
    typeof sticker.skillId === 'string' && Object.hasOwn(data.skills, sticker.skillId)
      ? data.skills[sticker.skillId]
      : undefined
  if (!skill || !isBookableSkill(data, skill)) {
    issues.push(
      `${path}.skillId: skill không tồn tại hoặc không có sách "${String(sticker.skillId)}"`
    )
  }
  if (!(STICKER_RARITIES as readonly unknown[]).includes(sticker.rarity)) {
    issues.push(`${path}.rarity không hợp lệ "${String(sticker.rarity)}"`)
  }
  if (!Array.isArray(sticker.rolls)) return [...issues, `${path}.rolls phải là danh sách`]
  const seen = new Set<unknown>()
  sticker.rolls.forEach((roll: unknown, i) => {
    issues.push(...checkRoll(data, roll, `${path}.rolls[${i}]`))
    const id = asObject(roll)?.attributeId
    if (seen.has(id)) issues.push(`${path}.rolls[${i}]: thuộc tính trùng "${String(id)}"`)
    seen.add(id)
  })
  return issues
}

/** Kiểm tra danh sách sticker trong túi. */
export function validateStickerList(data: GameData, value: unknown, path: string): string[] {
  if (!Array.isArray(value)) return [`${path} phải là danh sách`]
  return value.flatMap((sticker: unknown, i) =>
    validateStickerInstance(data, sticker, `${path}[${i}]`)
  )
}

/**
 * Sticker trên quái (`Monster.skillStickers`): object, khóa là skill quái đang biết, sticker hợp lệ và
 * đúng skill của khóa.
 */
export function validateSkillStickers(
  data: GameData,
  value: unknown,
  { skillIds, path }: { skillIds: readonly string[]; path: string }
): string[] {
  const stickers = asObject(value)
  if (!stickers) return [`${path} phải là object skill → sticker`]
  return Object.entries(stickers).flatMap(([skillId, sticker]) => {
    const where = `${path}.${skillId}`
    const issues = validateStickerInstance(data, sticker, where)
    if (!skillIds.includes(skillId)) issues.push(`${where}: quái không biết skill này`)
    if (asObject(sticker)?.skillId !== skillId) issues.push(`${where}.skillId phải là "${skillId}"`)
    return issues
  })
}
