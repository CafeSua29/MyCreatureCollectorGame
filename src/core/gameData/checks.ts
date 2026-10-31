// Hàm kiểm tra dùng chung cho dữ liệu game và cho quái.

import { itemDropsFromMonsters, itemStorage } from '../inventory'
import { SKILL_EFFECTS } from '../registries'
import {
  ITEM_CATEGORIES,
  STAT_NAMES,
  STELLAR,
  type EffectDef,
  type GameData,
  type SkillTarget,
  type Stats,
  type DropEntry,
  type ItemReward
} from '../model'
import { asObject, checkInteger, checkNumber, isFiniteNumber } from '../shared'

/**
 * Item nhận theo số lượng (rơi đồ, đồ khởi đầu) phải tồn tại và gộp chồng theo id.
 * `label` là tên vai trò trong thông báo, ví dụ "vật phẩm rơi".
 */
export function checkStackItemId(
  data: GameData,
  itemId: string,
  where: string,
  label = 'vật phẩm'
): string[] {
  const item = data.items[itemId]
  if (!item) return [`${where}: ${label} không tồn tại "${itemId}"`]
  // Category sai đã được checkItems báo; bỏ qua để itemStorage không ném lỗi.
  if (!ITEM_CATEGORIES.includes(item.category)) return []
  if (itemStorage(item.category) !== 'stack') {
    return [`${where}: ${label} "${itemId}" (${item.category}) không gộp chồng theo id`]
  }
  return []
}

/** Bảng rơi đồ của biome hoặc boss. */
export function checkDrops(
  data: GameData,
  drops: readonly DropEntry[],
  where: string,
  issues: string[]
): void {
  for (const drop of drops) {
    issues.push(...checkStackItemId(data, drop.itemId, where, 'vật phẩm rơi'))
    // Category sai đã được checkItems báo; bỏ qua để itemDropsFromMonsters không ném lỗi.
    const item = data.items[drop.itemId]
    if (item && ITEM_CATEGORIES.includes(item.category) && !itemDropsFromMonsters(item.category)) {
      issues.push(`${where}: vật phẩm "${drop.itemId}" (${item.category}) không được rơi từ quái`)
    }
    issues.push(...checkNumber(drop.chance, `${where}: chance`, 0, 100))
  }
}

/** Kiểm tra object có đủ 6 chỉ số, mỗi chỉ số là số hữu hạn ≥ min. */
export function checkStats(value: unknown, where: string, min: number, issues: string[]): void {
  if (typeof value !== 'object' || value === null) {
    issues.push(`${where}: thiếu bộ chỉ số`)
    return
  }
  const stats = value as Partial<Stats>
  for (const stat of STAT_NAMES) {
    const amount = stats[stat]
    if (!isFiniteNumber(amount) || amount < min) {
      issues.push(`${where}.${stat} phải là số hữu hạn ≥ ${min}, nhận ${amount}`)
    }
  }
}

/**
 * Luật theo mục tiêu của hiệu ứng skill (checkTarget của handler): skill theo `target` của nó, vật
 * phẩm ném tính như skill nhắm `enemy`. Hook không có trong registry đã được checkEffects báo.
 */
export function checkEffectTargets(
  effects: readonly EffectDef[] | undefined,
  target: SkillTarget,
  where: string,
  issues: string[]
): void {
  for (const effect of Array.isArray(effects) ? effects : []) {
    for (const problem of SKILL_EFFECTS[effect.type]?.checkTarget?.(effect.params, target) ?? []) {
      issues.push(`${where}: hook "${effect.type}": ${problem}`)
    }
  }
}

/** Kiểm tra danh sách hiệu ứng { type, params } theo một registry. */
export function checkEffects(
  registry: Readonly<Record<string, { validateParams(params: unknown, data: GameData): string[] }>>,
  effects: EffectDef[] | undefined,
  where: string,
  data: GameData,
  issues: string[]
): void {
  if (!Array.isArray(effects)) {
    issues.push(`${where}: thiếu danh sách hiệu ứng`)
    return
  }
  for (const effect of effects) {
    const handler = registry[effect.type]
    if (!handler) {
      issues.push(`${where}: hook "${effect.type}" chưa có trong registry`)
      continue
    }
    for (const problem of handler.validateParams(effect.params, data)) {
      issues.push(`${where}: hook "${effect.type}": ${problem}`)
    }
  }
}

/** Hệ Tera hợp lệ: id hệ tồn tại hoặc STELLAR (mục "Tera" ở transformation.md). */
export const isTeraElement = (data: GameData, elementId: unknown): boolean =>
  typeof elementId === 'string' &&
  (elementId === STELLAR || Object.hasOwn(data.elements, elementId))

export function checkElementIds(
  data: GameData,
  elementIds: unknown,
  where: string,
  issues: string[]
): void {
  if (!Array.isArray(elementIds) || elementIds.length === 0) {
    issues.push(`${where}: cần ít nhất một hệ`)
    return
  }
  for (const elementId of elementIds) {
    if (!(elementId in data.elements)) issues.push(`${where}: hệ không tồn tại "${elementId}"`)
  }
}

/**
 * Danh sách trường của một type, viết dạng { trường: true } để TypeScript báo lỗi khi type thêm
 * trường mà danh sách quên (hoặc danh sách có trường type không có).
 */
export function fieldList<T>(fields: Readonly<Record<keyof T, true>>): readonly string[] {
  return Object.keys(fields)
}

/**
 * Báo trường lạ của object đọc từ JSON (Quy tắc code sạch: trường lạ báo lỗi, kể cả `name` vì chữ
 * nằm ở src/data/i18n). `owner` là tên loại trong thông báo, ví dụ `category "ball"`.
 */
export function checkKnownFields(
  value: unknown,
  allowed: readonly string[],
  where: string,
  owner: string,
  issues: string[]
): void {
  const obj = asObject(value)
  if (!obj) return
  for (const field of Object.keys(obj)) {
    if (!allowed.includes(field)) issues.push(`${where}: trường "${field}" không thuộc ${owner}`)
  }
}

/**
 * Danh sách bậc theo ngưỡng `{ id, from }` (bậc tư chất, phẩm cấp loài): ít nhất một bậc, bậc đầu
 * từ 0 (giá trị nào cũng có bậc), `from` là số tăng dần ngặt, không trường lạ. `file` là tên danh
 * sách, `label` là tên một bậc trong thông báo (ví dụ "bậc tư chất").
 */
export function checkThresholdTiers(
  tiers: readonly { id: string; from: unknown }[],
  { file, label }: { file: string; label: string },
  issues: string[]
): void {
  if (tiers.length === 0) issues.push(`${file}: cần ít nhất một bậc`)
  const title = label.charAt(0).toUpperCase() + label.slice(1)
  let previous: number | null = null
  for (const tier of tiers) {
    const where = `${title} "${tier.id}"`
    checkKnownFields(tier, ['id', 'from'], where, label, issues)
    if (!isFiniteNumber(tier.from)) {
      issues.push(`${where}: from phải là số`)
      continue
    }
    if (previous === null && tier.from !== 0) issues.push(`${where}: bậc đầu phải có from 0`)
    if (previous !== null && tier.from <= previous) {
      issues.push(`${where}: from phải lớn hơn bậc trước (${previous}), nhận ${tier.from}`)
    }
    previous = tier.from
  }
}

/** Khoảng số nguyên { min, max } (cả hai ≥ `min`, max ≥ min). */
export function checkIntRange(value: unknown, where: string, min: number, issues: string[]): void {
  const range = asObject(value)
  if (!range) {
    issues.push(`${where} phải là { min, max }`)
    return
  }
  checkKnownFields(range, ['min', 'max'], where, 'khoảng', issues)
  issues.push(...checkInteger(range.min, `${where}.min`, min))
  issues.push(...checkInteger(range.max, `${where}.max`, min))
  if (typeof range.min === 'number' && typeof range.max === 'number' && range.max < range.min) {
    issues.push(`${where}: max phải ≥ min`)
  }
}

/** Danh sách món thưởng cố định { itemId, count } (item gộp chồng, count ≥ 1). */
export function checkItemRewards(
  data: GameData,
  value: unknown,
  where: string,
  issues: string[]
): void {
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  value.forEach((entry: ItemReward, i) => {
    const at = `${where}[${i}]`
    checkKnownFields(entry, ['itemId', 'count'], at, 'món thưởng', issues)
    issues.push(...checkStackItemId(data, String(entry?.itemId), at, 'vật phẩm thưởng'))
    issues.push(...checkInteger(entry?.count, `${at}.count`, 1))
  })
}

/**
 * Danh sách món theo trọng số { itemId, weight, min, max } (rương bí cảnh, rương hiểm địa): item gộp
 * chồng, trọng số ≥ 0, số lượng 1 ≤ min ≤ max.
 */
export function checkChestItems(
  data: GameData,
  value: unknown,
  where: string,
  issues: string[]
): void {
  if (!Array.isArray(value)) {
    issues.push(`${where} phải là danh sách`)
    return
  }
  value.forEach((entry: unknown, i) => {
    const item = asObject(entry) ?? {}
    const at = `${where}[${i}]`
    checkKnownFields(item, ['itemId', 'weight', 'min', 'max'], at, 'món rương', issues)
    issues.push(...checkStackItemId(data, String(item.itemId), at, 'vật phẩm rương'))
    issues.push(...checkNumber(item.weight, `${at}.weight`, 0))
    checkIntRange({ min: item.min, max: item.max }, at, 1, issues)
  })
}

/** Bảng id theo race / hệ: key tồn tại, giá trị là nguyên liệu. */
export function checkMaterialMap(
  data: GameData,
  value: unknown,
  { at, known }: { at: string; known: Readonly<Record<string, unknown>> },
  issues: string[]
): void {
  const map = asObject(value)
  if (!map) {
    issues.push(`${at} phải là object`)
    return
  }
  for (const [key, itemId] of Object.entries(map)) {
    if (!Object.hasOwn(known, key)) issues.push(`${at}: key lạ "${key}"`)
    if (typeof itemId !== 'string' || data.items[itemId]?.category !== 'material') {
      issues.push(`${at}.${key} phải là nguyên liệu (material)`)
    }
  }
}
