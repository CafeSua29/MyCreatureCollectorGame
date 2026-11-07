// Dấu ấn trên quái (docs/rules/marks.md): tra mục dấu, loại đối tượng, dấu có tác dụng không, hook
// của dấu cho ownHooks (thay chỗ giữ `$target`). Điểm duy nhất hỏi "dấu này đang làm gì". Hàm
// thuần, không đổi quái (thay đổi quái ở monster/marks.ts).

import {
  MARK_TARGET_PLACEHOLDER,
  type GlobalFieldLayer,
  type GameData,
  type MarkDef,
  type MarkInstance,
  type MarkKind,
  type MarkTargetKind,
  type Monster,
  type TraitHookDef
} from '../model'
import { assertNever, levelEffectScale } from '../shared'
import { monsterBodyPlan } from './bodyParts'
import { fillPlaceholders } from './traitHookUtils'

/** Mục dấu theo id; không có = undefined (save hỏng đang được kiểm tra). */
export const findMarkDef = (data: GameData, markId: string): MarkDef | undefined =>
  Object.hasOwn(data.marks, markId) ? data.marks[markId] : undefined

/** Có mục dấu nào trong dữ liệu không (không có thì trận không ghi, không tung dấu). */
export function hasMarkData(data: GameData): boolean {
  // Nhớ theo bộ dữ liệu: trận hỏi mỗi đòn / mỗi lần gục.
  let has = markDataCache.get(data)
  if (has === undefined) markDataCache.set(data, (has = Object.keys(data.marks).length > 0))
  return has
}

const markDataCache = new WeakMap<GameData, boolean>()

/** Mục dấu theo id và đúng loại. */
export function markDefOfKind<K extends MarkKind>(
  data: GameData,
  markId: string,
  kind: K
): Extract<MarkDef, { kind: K }> | undefined {
  const def = findMarkDef(data, markId)
  // Ép kiểu vì vừa so kind của mục với kind cần.
  return def?.kind === kind ? (def as Extract<MarkDef, { kind: K }>) : undefined
}

/** Mọi mục dấu của một loại, theo thứ tự trong marks.json (để tung tất định). */
export function markDefsOfKind<K extends MarkKind>(
  data: GameData,
  kind: K
): Extract<MarkDef, { kind: K }>[] {
  // Ép kiểu vì lọc theo đúng kind.
  return Object.values(data.marks).filter((def) => def.kind === kind) as Extract<
    MarkDef,
    { kind: K }
  >[]
}

/** Bộ phận của mục dấu (sẹo, đột biến, sẹo chiến); dấu không theo bộ phận = undefined. */
export function markPartId(def: MarkDef): string | undefined {
  switch (def.kind) {
    case 'scar':
    case 'mutation':
      return def.partId
    case 'trophy':
      return def.partId
    case 'adaptation':
    case 'trauma':
      return undefined
    default:
      return assertNever(def, 'loại dấu')
  }
}

/** Loại đối tượng của mục dấu; dấu không theo đối tượng = undefined. */
export function markTargetKind(def: MarkDef): MarkTargetKind | undefined {
  switch (def.kind) {
    case 'adaptation':
    case 'trauma':
    case 'trophy':
      return def.target
    case 'scar':
    case 'mutation':
      return undefined
    default:
      return assertNever(def, 'loại dấu')
  }
}

/** Luật của từng loại đối tượng: id hợp lệ (dữ liệu, save) và mọi id (chọn mẫu khi kiểm tra). */
interface MarkTargetRule {
  has(data: GameData, id: string): boolean
  ids(data: GameData): readonly string[]
}

/** Môi trường lớp `layer` không phải mặc định (trời quang, không địa hình không phải thứ để quen). */
const fieldOfLayer =
  (layer: GlobalFieldLayer) =>
  (data: GameData, id: string): boolean =>
    Object.hasOwn(data.fieldEffects, id) &&
    data.fieldEffects[id].layer === layer &&
    data.config.field.defaults[layer] !== id

const byIndex = (pick: (data: GameData) => Readonly<Record<string, unknown>>): MarkTargetRule => ({
  has: (data, id) => Object.hasOwn(pick(data), id),
  ids: (data) => Object.keys(pick(data))
})

/** Luật lọc trên một bảng dữ liệu. */
function filtered(
  pick: (data: GameData) => Readonly<Record<string, unknown>>,
  has: (data: GameData, id: string) => boolean
): MarkTargetRule {
  return { has, ids: (data) => Object.keys(pick(data)).filter((id) => has(data, id)) }
}

export const MARK_TARGETS: Readonly<Record<MarkTargetKind, MarkTargetRule>> = {
  element: byIndex((data) => data.elements),
  status: filtered(
    (data) => data.statuses,
    (data, id) => Object.hasOwn(data.statuses, id) && data.statuses[id].kind === 'debuff'
  ),
  weather: filtered((data) => data.fieldEffects, fieldOfLayer('weather')),
  terrain: filtered((data) => data.fieldEffects, fieldOfLayer('terrain')),
  species: filtered(
    (data) => data.species,
    (data, id) => Object.hasOwn(data.species, id) && data.species[id].kind === 'normal'
  ),
  race: byIndex((data) => data.races)
}

/** Id là đối tượng hợp lệ của loại `kind`. */
export const isMarkTarget = (data: GameData, kind: MarkTargetKind, id: string): boolean =>
  MARK_TARGETS[kind].has(data, id)

/** Mục dấu nhận đối tượng `id` không (loại đúng, nằm trong targetIds nếu mục giới hạn). */
export function markAcceptsTarget(data: GameData, def: MarkDef, id: string): boolean {
  const kind = markTargetKind(def)
  if (kind === undefined || !isMarkTarget(data, kind, id)) return false
  return def.kind !== 'adaptation' || !def.targetIds || def.targetIds.includes(id)
}

/** Khóa bộ đếm của dấu theo đối tượng (Monster.markCounters). */
export const markCounterKey = (markId: string, targetId: string): string => `${markId}:${targetId}`

/**
 * Dấu có tác dụng không: dấu theo bộ phận chỉ khi quái còn bộ phận đó (tiến hóa đổi race mất bộ
 * phận thì dấu giữ nhưng không có tác dụng, mục "Luật chung"). Mục không tồn tại: không.
 */
export function isMarkActive(data: GameData, monster: Monster, mark: MarkInstance): boolean {
  const def = findMarkDef(data, mark.markId)
  if (!def) return false
  const partId = markPartId(def)
  return partId === undefined || monsterBodyPlan(data, monster).parts.includes(partId)
}

/** Hook đã thay `$target` theo bộ dữ liệu (ownHooks gọi rất nhiều lần mỗi lượt). */
const filledHookCache = new WeakMap<GameData, Map<string, readonly TraitHookDef[]>>()

/** Hook của mục dấu với đối tượng đã thay vào chỗ giữ. */
export function markHooksFor(
  data: GameData,
  def: MarkDef,
  targetId?: string
): readonly TraitHookDef[] {
  if (targetId === undefined) return def.hooks
  let cache = filledHookCache.get(data)
  if (!cache) filledHookCache.set(data, (cache = new Map()))
  const key = markCounterKey(def.id, targetId)
  const cached = cache.get(key)
  if (cached) return cached
  // Ép kiểu vì thay chuỗi trong params không đổi cấu trúc hook đã kiểm tra lúc khởi động.
  const filled = fillPlaceholders(def.hooks, {
    [MARK_TARGET_PLACEHOLDER]: targetId
  }) as readonly TraitHookDef[]
  cache.set(key, filled)
  return filled
}

/** Một nhóm hook của dấu cho ownHooks. */
export interface MarkHookEntry {
  hooks: readonly TraitHookDef[]
  scale: number
  /** Id mục dấu (log, % chỉ số theo nguồn). */
  markId: string
}

/**
 * Hook của mọi dấu đang có tác dụng: hook của mục × hệ số cấp, trait của mục (cấp = cấp dấu) như
 * trait có thêm (mục "Tính chỉ số").
 */
export function markHookEntries(data: GameData, monster: Monster): MarkHookEntry[] {
  if (monster.marks.length === 0) return []
  const step = data.config.levelEffectStep
  const result: MarkHookEntry[] = []
  for (const mark of monster.marks) {
    const def = findMarkDef(data, mark.markId)
    if (!def || !isMarkActive(data, monster, mark)) continue
    const scale = levelEffectScale(step, mark.level)
    result.push({ hooks: markHooksFor(data, def, mark.targetId), scale, markId: def.id })
    const trait = def.traitId === undefined ? undefined : data.traits[def.traitId]
    if (trait) result.push({ hooks: trait.hooks, scale, markId: def.id })
  }
  return result
}

/** Dấu cùng id và cùng đối tượng trên quái (mỗi cặp một mục). */
export const findMark = (
  monster: Pick<Monster, 'marks'>,
  markId: string,
  targetId?: string
): MarkInstance | undefined =>
  monster.marks.find((mark) => mark.markId === markId && mark.targetId === targetId)

/** Dấu loại `kind` đang có ở bộ phận `partId` (mỗi bộ phận tối đa một sẹo, một đột biến). */
export function markOnPart(
  data: GameData,
  monster: Pick<Monster, 'marks'>,
  { kind, partId }: { kind: 'scar' | 'mutation'; partId: string }
): MarkInstance | undefined {
  return monster.marks.find((mark) => {
    const def = findMarkDef(data, mark.markId)
    return def?.kind === kind && def.partId === partId
  })
}
