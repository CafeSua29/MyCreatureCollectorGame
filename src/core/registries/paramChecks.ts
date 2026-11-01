// Kiểm tra params dùng chung cho các registry (trait, môi trường, hiệu ứng skill): danh sách id
// tham chiếu nội dung, tham chiếu môi trường đúng lớp.

import {
  GLOBAL_FIELD_LAYERS,
  STAGE_STATS,
  STAT_NAMES,
  type GameData,
  type GlobalFieldLayer,
  type StageStat,
  type StatName
} from '../model'
import { asObject, checkInteger, checkNumber } from '../shared'

/** Danh sách id không rỗng (trừ khi allowEmpty), mỗi id có trong `known`, không lặp. */
export function checkIdList(
  value: unknown,
  field: string,
  known: Readonly<Record<string, unknown>>,
  { label, allowEmpty = false }: { label: string; allowEmpty?: boolean }
): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    return [`${field} phải là danh sách${allowEmpty ? '' : ' không rỗng'}`]
  }
  const issues = value.flatMap((id) =>
    typeof id === 'string' && Object.hasOwn(known, id)
      ? []
      : [`${field}: ${label} không tồn tại "${String(id)}"`]
  )
  if (new Set(value).size !== value.length) issues.push(`${field} bị lặp`)
  return issues
}

/** Chỉ số khác HP (chỉ số nhân hệ số, chỉ số cao nhất / thấp nhất...). */
export const isStageStat = (value: unknown): value is Exclude<StatName, 'hp'> =>
  value !== 'hp' && (STAT_NAMES as readonly unknown[]).includes(value)

/** Chỉ số có bậc trận: chỉ số khác HP, chính xác, né (STAGE_STATS). */
export const isBattleStageStat = (value: unknown): value is StageStat =>
  (STAGE_STATS as readonly unknown[]).includes(value)

/** Bậc trận đổi: chỉ số có bậc trận và số bậc nguyên khác 0. */
export function checkStageChange(stat: unknown, stages: unknown, field: string): string[] {
  const issues = isBattleStageStat(stat) ? [] : ['stat phải là chỉ số có bậc trận']
  if (!Number.isSafeInteger(stages) || stages === 0) {
    issues.push(`${field} phải là số nguyên khác 0`)
  }
  return issues
}

/** Lớp môi trường phải là lớp toàn sân đã làm (weather / terrain). */
export const isGlobalFieldLayer = (value: unknown): value is GlobalFieldLayer =>
  (GLOBAL_FIELD_LAYERS as readonly unknown[]).includes(value)

/** Danh sách id môi trường thuộc đúng một lớp. */
export function checkFieldIdList(
  data: GameData,
  value: unknown,
  field: string,
  layer: GlobalFieldLayer
): string[] {
  const issues = checkIdList(value, field, data.fieldEffects, { label: 'môi trường' })
  if (!Array.isArray(value)) return issues
  for (const id of value) {
    const known = typeof id === 'string' && Object.hasOwn(data.fieldEffects, id)
    const effect = known ? data.fieldEffects[id] : undefined
    if (effect && effect.layer !== layer) issues.push(`${field}: "${id}" không thuộc lớp ${layer}`)
  }
  return issues
}

/**
 * Đặt môi trường ({ layer, fieldId, turns? }, hiệu ứng setField và trait setFieldOnEntry): lớp
 * toàn sân, môi trường đúng lớp và không phải môi trường mặc định, số lượt nguyên ≥ 1 (bỏ trống
 * thì môi trường phải có `duration`).
 */
export function checkSetFieldParams(data: GameData, obj: Record<string, unknown>): string[] {
  if (!isGlobalFieldLayer(obj.layer)) return ['layer phải là "weather" hoặc "terrain"']
  const issues = checkFieldIdList(data, [obj.fieldId], 'fieldId', obj.layer)
  if (issues.length > 0) return issues
  const fieldId = obj.fieldId as string
  if (data.config.field?.defaults?.[obj.layer] === fieldId) {
    issues.push(`fieldId "${fieldId}" là môi trường mặc định, không đặt được`)
  }
  if (obj.turns !== undefined) issues.push(...checkInteger(obj.turns, 'turns', 1))
  else if (
    data.fieldEffects[fieldId].duration === undefined &&
    data.fieldEffects[fieldId].primal !== true
  ) {
    issues.push(`cần turns vì môi trường "${fieldId}" không có duration`)
  }
  return issues
}

/**
 * Đặt hiệu ứng theo phe ({ side, fieldId, turns?, requiresFieldId? }, hiệu ứng setSideField): phe
 * own / foe, môi trường lớp side, số lượt nguyên ≥ 1 (bỏ trống = duration, không có thì cả trận),
 * môi trường yêu cầu là môi trường toàn sân.
 */
export function checkSetSideFieldParams(data: GameData, obj: Record<string, unknown>): string[] {
  const issues: string[] = []
  if (obj.side !== 'own' && obj.side !== 'foe') issues.push('side phải là "own" hoặc "foe"')
  const fieldId = obj.fieldId
  if (typeof fieldId !== 'string' || !Object.hasOwn(data.fieldEffects, fieldId)) {
    issues.push(`fieldId: môi trường không tồn tại "${String(fieldId)}"`)
  } else if (data.fieldEffects[fieldId].layer !== 'side') {
    issues.push(`fieldId: "${fieldId}" không thuộc lớp side`)
  }
  if (obj.turns !== undefined) issues.push(...checkInteger(obj.turns, 'turns', 1))
  const required = obj.requiresFieldId
  if (required !== undefined) {
    const known = typeof required === 'string' && Object.hasOwn(data.fieldEffects, required)
    if (!known || !isGlobalFieldLayer(data.fieldEffects[required as string].layer)) {
      issues.push(`requiresFieldId: "${String(required)}" phải là môi trường toàn sân`)
    }
  }
  return issues
}

/**
 * Đặt / tắt room ({ fieldId, turns? }, hiệu ứng setRoom): môi trường lớp room, số lượt nguyên ≥ 1
 * (bỏ trống thì môi trường phải có `duration`).
 */
export function checkSetRoomParams(data: GameData, obj: Record<string, unknown>): string[] {
  const fieldId = obj.fieldId
  if (typeof fieldId !== 'string' || !Object.hasOwn(data.fieldEffects, fieldId)) {
    return [`fieldId: môi trường không tồn tại "${String(fieldId)}"`]
  }
  if (data.fieldEffects[fieldId].layer !== 'room')
    return [`fieldId: "${fieldId}" không thuộc lớp room`]
  if (obj.turns !== undefined) return checkInteger(obj.turns, 'turns', 1)
  return data.fieldEffects[fieldId].duration === undefined
    ? [`cần turns vì môi trường "${fieldId}" không có duration`]
    : []
}

/**
 * Bảng dạng trong trận (docs/rules/battle-forms.md): loài → loài dạng `battleOnly` của chính loài gốc
 * đó (formOf trùng loài gốc của khóa, khóa là dạng vùng miền thì theo formOf của nó).
 */
export function checkFormMap(data: GameData, value: unknown, field: string): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`${field} phải là object loài → dạng`]
  }
  const entries = Object.entries(value)
  if (entries.length === 0) return [`${field} không được rỗng`]
  return entries.flatMap(([speciesId, formId]) => {
    const species = data.species[speciesId]
    const form = typeof formId === 'string' ? data.species[formId] : undefined
    if (species?.kind !== 'normal') return [`${field}: loài không tồn tại "${speciesId}"`]
    if (form?.kind !== 'normal' || form.formKind !== 'battleOnly') {
      return [`${field}.${speciesId}: không phải dạng trong trận "${String(formId)}"`]
    }
    const base = species.formOf ?? species.id
    return form.formOf === base
      ? []
      : [`${field}.${speciesId}: "${form.id}" không phải dạng của nó`]
  })
}

/**
 * Params `{ percent, ...extra }` của hiệu ứng kênh % (chúc phúc, món ăn, danh hiệu): % khác 0, không
 * dưới −100 (hệ số không âm), không trường lạ ngoài `extra`.
 */
export function checkPercentParams(params: unknown, extra: readonly string[] = []): string[] {
  const obj = asObject(params)
  if (!obj) return ['params phải là object']
  const issues = checkNumber(obj.percent, 'percent', -100)
  if (obj.percent === 0) issues.push('percent phải khác 0')
  for (const key of Object.keys(obj)) {
    if (key !== 'percent' && !extra.includes(key)) issues.push(`trường lạ "${key}"`)
  }
  return issues
}
