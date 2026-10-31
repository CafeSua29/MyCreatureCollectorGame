// Kiểm tra món trang bị và món đang lắp đọc từ save (mục Lưu / đọc save). Chỉ kiểm tra cấu trúc và
// tham chiếu (món gốc, dòng tồn tại); không kiểm tra giá trị dòng nằm trong khoảng vì dữ liệu game
// có thể đổi giữa các phiên bản.

import { asObject, checkInteger, isFiniteNumber } from '../shared'
import { EQUIPMENT_RARITIES, usesTraitSlot, type GameData, type SoulImprint } from '../model'
import { equipmentIdNumber, findEquipmentItem, findEquipmentLine } from './equipment'
import { isEquippable, itemStorage } from './itemRules'

const SOUL_IMPRINT_FIELDS: readonly string[] = [
  'speciesId',
  'raceId',
  'nickname',
  'traitId',
  'history'
]

/**
 * Phần hồn của hồn khí (trừ lý lịch: kiểm tra ở validateEquipmentState vì cần luật lý lịch của
 * monster/).
 */
function checkSoulImprint(data: GameData, soul: Record<string, unknown>, path: string): string[] {
  const issues: string[] = []
  if (typeof soul.speciesId !== 'string' || !data.species[soul.speciesId]) {
    issues.push(`${path}.speciesId: loài không tồn tại "${String(soul.speciesId)}"`)
  }
  if (typeof soul.raceId !== 'string' || !data.races[soul.raceId]) {
    issues.push(`${path}.raceId: race không tồn tại "${String(soul.raceId)}"`)
  }
  if (soul.nickname !== null && typeof soul.nickname !== 'string') {
    issues.push(`${path}.nickname phải là chuỗi hoặc null`)
  }
  const trait = typeof soul.traitId === 'string' ? data.traits[soul.traitId] : undefined
  if (soul.traitId !== null && (!trait || !usesTraitSlot(trait.kind))) {
    issues.push(`${path}.traitId: không phải trait chiếm ô "${String(soul.traitId)}"`)
  }
  if (!('history' in soul)) issues.push(`${path}: thiếu history`)
  for (const key of Object.keys(soul)) {
    if (!SOUL_IMPRINT_FIELDS.includes(key)) issues.push(`${path}: trường lạ "${key}"`)
  }
  return issues
}

/** Kiểm tra một món trang bị ở vị trí `path`. Trả về danh sách lỗi. */
export function validateEquipmentInstance(data: GameData, value: unknown, path: string): string[] {
  const instance = asObject(value)
  if (!instance) return [`${path}: không phải món trang bị hợp lệ`]
  const issues: string[] = []
  if (typeof instance.id !== 'string' || equipmentIdNumber(instance.id) === null) {
    issues.push(`${path}.id phải có dạng "e<số>", nhận ${String(instance.id)}`)
  }
  const item =
    typeof instance.baseItemId === 'string' ? findEquipmentItem(data, instance.baseItemId) : null
  if (!item)
    issues.push(`${path}.baseItemId: trang bị không tồn tại "${String(instance.baseItemId)}"`)
  if (!EQUIPMENT_RARITIES.some((rarity) => rarity === instance.rarity)) {
    issues.push(`${path}.rarity không hợp lệ "${String(instance.rarity)}"`)
  } else if (
    item &&
    item.soulRelicStat === undefined &&
    (instance.rarity === 'unique') !== (item.unique !== undefined)
  ) {
    // Hồn khí có mọi bậc (theo tư chất); món khác: bậc unique ↔ món unique của boss.
    issues.push(`${path}.rarity: chỉ món unique của boss mới có bậc unique`)
  }
  const soul = instance.soul === undefined ? undefined : asObject(instance.soul)
  if (item && (item.soulRelicStat !== undefined) !== (instance.soul !== undefined)) {
    issues.push(`${path}.soul: chỉ hồn khí (món gốc hồn khí) mới có và luôn có phần hồn`)
  }
  if (soul === null) issues.push(`${path}.soul phải là object`)
  else if (soul) issues.push(...checkSoulImprint(data, soul, `${path}.soul`))
  // Ép kiểu chỉ để tra dòng hồn theo traitId (các trường đã kiểm tra ở checkSoulImprint).
  const imprint = soul ? (soul as unknown as SoulImprint) : undefined
  issues.push(...checkInteger(instance.level, `${path}.level`, 1))
  if (!Array.isArray(instance.rolls)) {
    issues.push(`${path}.rolls phải là danh sách`)
    return issues
  }
  const seen = new Set<string>()
  instance.rolls.forEach((entry: unknown, i) => {
    const where = `${path}.rolls[${i}]`
    const roll = asObject(entry)
    if (!roll || typeof roll.lineId !== 'string') {
      issues.push(`${where}: không phải dòng hợp lệ`)
      return
    }
    if (item && !findEquipmentLine(data, item, roll.lineId, imprint)) {
      issues.push(`${where}.lineId: dòng không tồn tại "${roll.lineId}"`)
    }
    if (!isFiniteNumber(roll.value)) issues.push(`${where}.value phải là số hữu hạn`)
    if (seen.has(roll.lineId)) issues.push(`${where}: trùng dòng "${roll.lineId}"`)
    seen.add(roll.lineId)
  })
  return issues
}

/** Kiểm tra danh sách món đang lắp của một quái ở vị trí `path`. Trả về danh sách lỗi. */
export function validateEquippedItems(data: GameData, value: unknown, path: string): string[] {
  if (!Array.isArray(value)) return [`${path} phải là danh sách`]
  const issues: string[] = []
  value.forEach((entry: unknown, i) => {
    const where = `${path}[${i}]`
    const equipped = asObject(entry)
    if (equipped?.storage === 'instance') {
      issues.push(...validateEquipmentInstance(data, equipped.instance, `${where}.instance`))
      return
    }
    if (equipped?.storage !== 'stack' || typeof equipped.itemId !== 'string') {
      issues.push(`${where}: không phải món đang lắp hợp lệ`)
      return
    }
    const item = Object.hasOwn(data.items, equipped.itemId) ? data.items[equipped.itemId] : null
    if (!item) {
      issues.push(`${where}.itemId: vật phẩm không tồn tại "${equipped.itemId}"`)
    } else if (!isEquippable(item.category) || itemStorage(item.category) !== 'stack') {
      issues.push(`${where}.itemId: vật phẩm "${item.id}" (${item.category}) không lắp theo id`)
    }
  })
  return issues
}
