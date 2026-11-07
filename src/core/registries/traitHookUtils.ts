// Helper dùng chung cho các handler trait (traitHooks.ts, fieldTraitHooks.ts,
// conditionalTraitHooks.ts, stageTraitHooks.ts, combatTraitHooks.ts, hitTraitHooks.ts,
// actionTraitHooks.ts, turnEndTraitHooks.ts).

import { asObject, checkNumber } from '../shared'
import { STAT_NAMES, type PartialStats } from '../model'

export function validatePartialStats(value: unknown, field: string): string[] {
  if (value === undefined) return []
  const stats = asObject(value)
  if (!stats) return [`${field} phải là object`]
  const issues: string[] = []
  for (const [key, amount] of Object.entries(stats)) {
    if (!(STAT_NAMES as readonly string[]).includes(key)) {
      issues.push(`${field}.${key} không phải chỉ số hợp lệ`)
    } else {
      issues.push(...checkNumber(amount, `${field}.${key}`))
    }
  }
  return issues
}

export function scaleStats(stats: PartialStats | undefined, scale: number): PartialStats {
  const result: PartialStats = {}
  if (!stats) return result
  for (const stat of STAT_NAMES) {
    const amount = stats[stat]
    if (amount !== undefined) result[stat] = amount * scale
  }
  return result
}

/** Ngưỡng % HP (điều kiện "máu ≤ ngưỡng"). */
export const checkHpThreshold = (value: unknown, field: string): string[] =>
  checkNumber(value, field, Number.MIN_VALUE, 100)

/** Tỉ lệ máu ≤ ngưỡng % (so ≤ như Pokémon: Blaze bật khi HP ≤ 1/3). */
export const isAtOrBelow = (hpRatio: number, thresholdPercent: number): boolean =>
  hpRatio * 100 <= thresholdPercent

/** Hệ số nhân từ % (có thể âm), không xuống dưới 0. */
export const percentToMultiplier = (percent: number): number => Math.max(0, 1 + percent / 100)

/** Tổng % (chỉ để lấy dấu lợi / hại cho AI). */
export const sumPercent = (stats: PartialStats): number =>
  Object.values(stats).reduce((sum, amount) => sum + (amount ?? 0), 0)

/** Params không có trường nào (hook bật / tắt). */
export function validateEmptyParams(params: unknown): string[] {
  const obj = asObject(params)
  if (!obj) return ['params phải là object']
  return Object.keys(obj).length === 0 ? [] : ['hook này không có params']
}

/** % chỉ số (không gồm HP) bắt buộc của hook có điều kiện: max HP không được đổi theo điều kiện. */
export function checkConditionalPercent(value: unknown): string[] {
  if (value === undefined) return ['percent là bắt buộc']
  const issues = validatePartialStats(value, 'percent')
  if (asObject(value)?.hp !== undefined)
    issues.push('percent không được đổi hp (hook có điều kiện)')
  return issues
}

/**
 * Thay chỗ giữ trong params hook (chuỗi đúng bằng khóa của `fills`, sticker `$skill` / `$choice`, dấu
 * ấn `$target`); chỗ giữ không có giá trị (undefined) giữ nguyên. Không sửa đầu vào.
 */
export function fillPlaceholders(
  value: unknown,
  fills: Readonly<Record<string, string | undefined>>
): unknown {
  if (typeof value === 'string')
    return Object.hasOwn(fills, value) ? (fills[value] ?? value) : value
  if (Array.isArray(value)) return value.map((entry) => fillPlaceholders(entry, fills))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, fillPlaceholders(entry, fills)])
    )
  }
  return value
}
