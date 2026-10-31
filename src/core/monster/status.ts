// Trạng thái bất thường trên một quái (mục "Trạng thái bất thường" ở battle-statuses.md): miễn nhiễm,
// thêm / làm mới, thời hạn, hệ số chỉ số, kiểm tra trong save.

import { forEachStatusHook, forEachTraitHook } from '../registries'
import {
  asObject,
  checkBig,
  checkInteger,
  checkNumber,
  nextInt,
  type Decimal,
  type RngState
} from '../shared'
import {
  STAT_NAMES,
  type GameData,
  type Monster,
  type MonsterBattleContext,
  type Stats,
  type StatusInstance
} from '../model'

export function hasStatus(monster: Monster, statusId: string): boolean {
  return monster.statuses.some((status) => status.statusId === statusId)
}

/**
 * Quái miễn trạng thái này: theo hệ (elements.json), trait / buff miễn trạng thái đó (hook
 * statusImmunity), hoặc miễn mọi debuff (debuffImmunity, buff Immune). `ctx`: bối cảnh trận (hào
 * quang, minion, trait tạm).
 */
export function isStatusImmune(
  data: GameData,
  monster: Monster,
  statusId: string,
  ctx?: MonsterBattleContext,
  { ignoreElement = false }: { ignoreElement?: boolean } = {}
): boolean {
  // Corrosion của quái gây: bỏ qua miễn theo hệ (gây độc được hệ Thép / Độc).
  const byElement =
    !ignoreElement &&
    monster.elementIds.some((elementId) =>
      data.elements[elementId].statusImmunities?.includes(statusId)
    )
  if (byElement) return true
  const isDebuff = data.statuses[statusId].kind === 'debuff'
  const view = { data, self: monster, selfCtx: ctx }
  let byTrait = false
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      if (handler.immuneStatusIds?.(params).includes(statusId)) byTrait = true
      if (isDebuff && handler.immuneToDebuffs?.(params, view)) byTrait = true
    },
    ctx
  )
  return byTrait
}

/**
 * Trạng thái đang có cùng nhóm loại trừ với `statusId` (khác `statusId`), hoặc null. Dính lại
 * đúng trạng thái đang có không bị chặn (chỉ làm mới thời hạn).
 */
export function conflictingStatus(
  data: GameData,
  monster: Monster,
  statusId: string
): string | null {
  const group = data.statuses[statusId].exclusiveGroup
  if (group === undefined) return null
  const conflict = monster.statuses.find(
    (status) =>
      status.statusId !== statusId && data.statuses[status.statusId]?.exclusiveGroup === group
  )
  return conflict?.statusId ?? null
}

/** Thời hạn mới dài hơn: null (không theo lượt / kéo dài mãi) dài hơn mọi số lượt. */
const longerTurns = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : Math.max(a, b)

/**
 * Danh sách trạng thái sau khi dính thêm `statusId` với `turns` lượt (null = không theo lượt).
 * Dính lại trạng thái đang có thì không cộng dồn, chỉ làm mới thời hạn (lấy thời hạn dài hơn),
 * potency lấy lớn hơn. Không sửa danh sách cũ.
 */
export function withStatus(
  statuses: readonly StatusInstance[],
  statusId: string,
  turns: number | null,
  extra: { potency?: number; amount?: Decimal; sourceId?: string } = {}
): StatusInstance[] {
  const fresh: StatusInstance = { statusId, turnsLeft: turns }
  if (extra.sourceId !== undefined) fresh.sourceId = extra.sourceId
  if (extra.potency !== undefined && extra.potency !== 100) fresh.potency = extra.potency
  if (extra.amount !== undefined) fresh.amount = extra.amount
  if (!statuses.some((status) => status.statusId === statusId)) return [...statuses, fresh]
  return statuses.map((status) => {
    if (status.statusId !== statusId) return status
    const next: StatusInstance = { ...status, turnsLeft: longerTurns(status.turnsLeft, turns) }
    const potency = Math.max(status.potency ?? 100, extra.potency ?? 100)
    if (potency !== 100) next.potency = potency
    if (extra.amount !== undefined) {
      next.amount = status.amount && status.amount.gt(extra.amount) ? status.amount : extra.amount
    }
    return next
  })
}

/**
 * Thời hạn khi bị dính: tung đều trong [min, max] (min = max thì cố định, không tốn RNG); trạng thái
 * không có duration trả về null (không hết hạn theo lượt).
 */
export function rollStatusDuration(
  data: GameData,
  rng: RngState,
  statusId: string
): [number | null, RngState] {
  const duration = data.statuses[statusId].duration
  if (!duration) return [null, rng]
  const { min, max } = duration
  return min === max ? [min, rng] : nextInt(rng, min, max)
}

/** Hệ số nhân từng chỉ số từ mọi trạng thái đang có (nhân dồn; không có thì 1). */
export function statusStatMultipliers(data: GameData, monster: Monster): Stats {
  const result = {} as Stats
  for (const stat of STAT_NAMES) result[stat] = 1
  forEachStatusHook(data, monster, (handler, params) => {
    const modifier = handler.statMultiplier?.(params)
    if (modifier) result[modifier.stat] *= modifier.multiplier
  })
  return result
}

/**
 * Kiểm tra danh sách trạng thái của quái (save): id tồn tại, không lặp, không có hai trạng thái
 * cùng nhóm loại trừ, turnsLeft nguyên ≥ 1 (hoặc null), potency số > 0, amount Decimal ≥ 0,
 * turnsElapsed nguyên ≥ 0.
 */
export function validateStatuses(data: GameData, value: unknown, field: string): string[] {
  if (!Array.isArray(value)) return [`${field} phải là danh sách`]
  const issues: string[] = []
  const seen = new Set<string>()
  value.forEach((entry, i) => {
    const status = asObject(entry)
    const statusId = status?.statusId
    const where = `${field}[${i}]`
    if (typeof statusId !== 'string' || !(statusId in data.statuses)) {
      issues.push(`${where}: trạng thái không tồn tại "${String(statusId)}"`)
    } else if (seen.has(statusId)) {
      issues.push(`${field}: trạng thái "${statusId}" bị lặp`)
    } else {
      const group = data.statuses[statusId].exclusiveGroup
      const clash = [...seen].find(
        (other) => group !== undefined && data.statuses[other].exclusiveGroup === group
      )
      if (clash !== undefined) {
        issues.push(`${field}: "${statusId}" và "${clash}" cùng nhóm loại trừ "${String(group)}"`)
      }
      seen.add(statusId)
    }
    if (status?.turnsLeft !== null)
      issues.push(...checkInteger(status?.turnsLeft, `${where}.turnsLeft`, 1))
    if (status?.potency !== undefined) {
      issues.push(...checkNumber(status.potency, `${where}.potency`, Number.MIN_VALUE))
    }
    if (status?.amount !== undefined) issues.push(...checkBig(status.amount, `${where}.amount`))
    if (status?.turnsElapsed !== undefined) {
      issues.push(...checkInteger(status.turnsElapsed, `${where}.turnsElapsed`, 0))
    }
    if (status?.sourceId !== undefined && typeof status.sourceId !== 'string') {
      issues.push(`${where}.sourceId phải là id quái`)
    }
  })
  return issues
}
