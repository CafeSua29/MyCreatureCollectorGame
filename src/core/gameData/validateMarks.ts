// Kiểm tra dấu ấn (docs/rules/marks.md): config.marks (tỉ lệ, ngưỡng, bộ phận) và marks.json (trường
// theo loại, bộ phận, đối tượng, mục liên kết, hook trait với chỗ giữ `$target` đã thay bằng một đối
// tượng mẫu).

import {
  MARK_KINDS,
  MARK_TARGET_KINDS,
  MARK_TARGET_PLACEHOLDER,
  TROPHY_TRIGGERS,
  type GameData,
  type MarkDef,
  type MarkKind,
  type MarkTargetKind,
  type TrophyTrigger
} from '../model'
import { asObject, assertNever, checkInteger, checkNumber } from '../shared'
import { MARK_TARGETS, TRAIT_HOOKS, fillPlaceholders, markTargetKind } from '../registries'
import { checkEffects, checkKnownFields } from './checks'

const WHERE = 'config.marks'

const PERCENT_FIELDS = [
  'mutationOnBreakPercent',
  'scarOnBreakPercent',
  'critScarHpPercent',
  'scarOnCritPercent',
  'scarOnFaintPercent',
  'scarOnStatusPercent',
  'nearDeathHpPercent',
  'mutationOnNearDeathPercent',
  'scarHardenPercent',
  'mutationOnVirusCurePercent',
  'scarOnImplantFailPercent',
  'wildMarkPercent',
  'wildMutationShare',
  'birthMutationPercent',
  'mutationInheritPercent',
  'adaptationInheritPercent'
] as const

const COUNT_FIELDS = ['traumaThreshold', 'resolveThreshold', 'scarHardenBattles'] as const

const PART_FIELDS = ['critDefaultPartId', 'implantScarPartId'] as const

/** Kiểm tra config.marks. */
export function checkMarkConfig(data: GameData, issues: string[]): void {
  const config = asObject(data.config.marks)
  if (!config) {
    issues.push(`${WHERE} phải là object`)
    return
  }
  checkKnownFields(
    config,
    [...PERCENT_FIELDS, ...COUNT_FIELDS, ...PART_FIELDS, 'treatCostPerLevel'],
    WHERE,
    'config dấu ấn',
    issues
  )
  for (const field of PERCENT_FIELDS) {
    issues.push(...checkNumber(config[field], `${WHERE}.${field}`, 0, 100))
  }
  for (const field of COUNT_FIELDS)
    issues.push(...checkInteger(config[field], `${WHERE}.${field}`, 1))
  for (const field of PART_FIELDS) {
    const id = config[field]
    if (typeof id !== 'string' || !Object.hasOwn(data.bodyParts, id)) {
      issues.push(`${WHERE}.${field}: bộ phận không tồn tại "${String(id)}"`)
    }
  }
  issues.push(...checkNumber(config.treatCostPerLevel, `${WHERE}.treatCostPerLevel`, 0))
}

const BASE_FIELDS = ['id', 'kind', 'hooks', 'traitId', 'maxLevel']

/** Trường riêng của từng loại (ngoài phần chung). */
const KIND_FIELDS: Readonly<Record<MarkKind, readonly string[]>> = {
  scar: ['partId', 'weight', 'statusIds', 'hardensInto'],
  mutation: ['partId', 'weight', 'inheritPercent'],
  adaptation: ['target', 'targetIds', 'threshold', 'inheritPercent'],
  trauma: ['target', 'resolveInto'],
  trophy: ['trigger', 'target', 'threshold', 'partId']
}

/** Loại đối tượng mỗi loại dấu được dùng (bỏ trống = không theo đối tượng). */
const ADAPTATION_TARGETS: readonly MarkTargetKind[] = ['element', 'status', 'weather', 'terrain']
const TRAUMA_TARGETS: readonly MarkTargetKind[] = ['species', 'element']

/** Luật của từng cách nhận chiến tích: đối tượng cho phép, cần ngưỡng / bộ phận không. */
interface TrophyTriggerRule {
  targets: readonly MarkTargetKind[]
  needsThreshold: boolean
  needsPart: boolean
}

const TROPHY_TRIGGER_RULES: Readonly<Record<TrophyTrigger, TrophyTriggerRule>> = {
  bossKill: { targets: [], needsThreshold: false, needsPart: false },
  worldBoss: { targets: [], needsThreshold: false, needsPart: false },
  raceKills: { targets: ['race'], needsThreshold: true, needsPart: false },
  resolve: { targets: TRAUMA_TARGETS, needsThreshold: false, needsPart: false },
  tribulation: { targets: [], needsThreshold: false, needsPart: false },
  hardened: { targets: [], needsThreshold: false, needsPart: true }
}

function checkPart(data: GameData, partId: unknown, where: string, issues: string[]): void {
  if (typeof partId !== 'string' || !Object.hasOwn(data.bodyParts, partId)) {
    issues.push(`${where}.partId: bộ phận không tồn tại "${String(partId)}"`)
  }
}

function checkTarget(
  value: unknown,
  allowed: readonly MarkTargetKind[],
  where: string,
  issues: string[]
): void {
  if (!allowed.some((kind) => kind === value)) {
    issues.push(`${where}.target phải là một trong ${allowed.join(', ')}, nhận "${String(value)}"`)
  }
}

/** Mục liên kết (hardensInto / resolveInto) phải là chiến tích đúng cách nhận. */
function linkedTrophy(
  data: GameData,
  id: unknown,
  trigger: TrophyTrigger,
  where: string,
  issues: string[]
): MarkDef | undefined {
  const def = typeof id === 'string' && Object.hasOwn(data.marks, id) ? data.marks[id] : undefined
  if (def?.kind === 'trophy' && def.trigger === trigger) return def
  issues.push(`${where}: phải là id chiến tích trigger "${trigger}", nhận "${String(id)}"`)
  return undefined
}

function checkKindFields(data: GameData, def: MarkDef, where: string, issues: string[]): void {
  switch (def.kind) {
    case 'scar': {
      checkPart(data, def.partId, where, issues)
      issues.push(...checkNumber(def.weight, `${where}.weight`, Number.MIN_VALUE))
      if (def.statusIds !== undefined) {
        const ids: unknown = def.statusIds
        if (!Array.isArray(ids) || ids.length === 0)
          issues.push(`${where}.statusIds phải khác rỗng`)
        else
          for (const id of ids) {
            if (typeof id !== 'string' || !Object.hasOwn(data.statuses, id)) {
              issues.push(`${where}.statusIds: trạng thái không tồn tại "${String(id)}"`)
            }
          }
      }
      if (def.hardensInto !== undefined) {
        const into = linkedTrophy(data, def.hardensInto, 'hardened', `${where}.hardensInto`, issues)
        if (into?.kind === 'trophy' && into.partId !== def.partId) {
          issues.push(`${where}.hardensInto: sẹo chiến phải cùng bộ phận "${def.partId}"`)
        }
      }
      return
    }
    case 'mutation':
      checkPart(data, def.partId, where, issues)
      issues.push(...checkNumber(def.weight, `${where}.weight`, Number.MIN_VALUE))
      if (def.inheritPercent !== undefined) {
        issues.push(...checkNumber(def.inheritPercent, `${where}.inheritPercent`, 0, 100))
      }
      return
    case 'adaptation':
      checkTarget(def.target, ADAPTATION_TARGETS, where, issues)
      issues.push(...checkInteger(def.threshold, `${where}.threshold`, 1))
      if (def.inheritPercent !== undefined) {
        issues.push(...checkNumber(def.inheritPercent, `${where}.inheritPercent`, 0, 100))
      }
      checkTargetIds(data, def, where, issues)
      return
    case 'trauma': {
      checkTarget(def.target, TRAUMA_TARGETS, where, issues)
      const into = linkedTrophy(data, def.resolveInto, 'resolve', `${where}.resolveInto`, issues)
      if (into && markTargetKind(into) !== def.target) {
        issues.push(`${where}.resolveInto: chiến tích phải cùng loại đối tượng "${def.target}"`)
      }
      return
    }
    case 'trophy':
      checkTrophyFields(data, def, where, issues)
      return
    default:
      assertNever(def, 'loại dấu')
  }
}

function checkTargetIds(
  data: GameData,
  def: Extract<MarkDef, { kind: 'adaptation' }>,
  where: string,
  issues: string[]
): void {
  if (def.targetIds === undefined) return
  const ids: unknown = def.targetIds
  if (!Array.isArray(ids) || ids.length === 0) {
    issues.push(`${where}.targetIds phải là danh sách khác rỗng`)
    return
  }
  const rule = targetRule(def.target)
  for (const id of ids) {
    if (typeof id !== 'string' || !rule?.has(data, id)) {
      issues.push(`${where}.targetIds: không phải đối tượng ${def.target} "${String(id)}"`)
    }
  }
}

function checkTrophyFields(
  data: GameData,
  def: Extract<MarkDef, { kind: 'trophy' }>,
  where: string,
  issues: string[]
): void {
  if (!TROPHY_TRIGGERS.some((trigger) => trigger === def.trigger)) {
    issues.push(`${where}.trigger không hợp lệ "${String(def.trigger)}"`)
    return
  }
  const rule = TROPHY_TRIGGER_RULES[def.trigger]
  if (rule.targets.length === 0) {
    if (def.target !== undefined) issues.push(`${where}: trigger "${def.trigger}" không có target`)
  } else checkTarget(def.target, rule.targets, where, issues)
  if (rule.needsThreshold) issues.push(...checkInteger(def.threshold, `${where}.threshold`, 1))
  else if (def.threshold !== undefined) {
    issues.push(`${where}: trigger "${def.trigger}" không có threshold`)
  }
  if (rule.needsPart) checkPart(data, def.partId, where, issues)
  else if (def.partId !== undefined) {
    issues.push(`${where}: trigger "${def.trigger}" không có partId`)
  }
}

/** Luật đối tượng theo loại đọc từ dữ liệu (loại sai = undefined, đã báo ở kiểm tra target). */
const targetRule = (kind: unknown): (typeof MARK_TARGETS)[MarkTargetKind] | undefined =>
  MARK_TARGET_KINDS.find((each) => each === kind) === undefined
    ? undefined
    : MARK_TARGETS[kind as MarkTargetKind]

/** Params có chứa chỗ giữ `$target` không. */
const usesPlaceholder = (value: unknown): boolean =>
  JSON.stringify(value).includes(`"${MARK_TARGET_PLACEHOLDER}"`)

/** Hook trait của mục, chỗ giữ thay bằng đối tượng mẫu (đối tượng đầu tiên của loại). */
function checkHooks(data: GameData, def: MarkDef, where: string, issues: string[]): void {
  if (!Array.isArray(def.hooks)) {
    issues.push(`${where}.hooks phải là danh sách hook`)
    return
  }
  const kind = markTargetKind(def)
  if (kind === undefined && usesPlaceholder(def.hooks)) {
    issues.push(`${where}: hook dùng ${MARK_TARGET_PLACEHOLDER} nhưng dấu không theo đối tượng`)
    return
  }
  const sample = kind === undefined ? undefined : targetRule(kind)?.ids(data)[0]
  // Ép kiểu vì thay chuỗi không đổi cấu trúc danh sách hook.
  const hooks = fillPlaceholders(def.hooks, {
    [MARK_TARGET_PLACEHOLDER]: sample
  }) as MarkDef['hooks']
  checkEffects(TRAIT_HOOKS, hooks, `${where}.hooks`, data, issues)
  if (def.traitId !== undefined && !Object.hasOwn(data.traits, def.traitId)) {
    issues.push(`${where}.traitId: trait không tồn tại "${def.traitId}"`)
  }
  if (def.hooks.length === 0 && def.traitId === undefined) {
    issues.push(`${where}: cần ít nhất một hook hoặc traitId`)
  }
}

/** Kiểm tra marks.json. */
export function checkMarkDefs(data: GameData, issues: string[]): void {
  for (const value of Object.values(data.marks)) {
    const where = `Dấu ấn "${value.id}"`
    if (!MARK_KINDS.some((kind) => kind === value.kind)) {
      issues.push(`${where}.kind không hợp lệ "${String(value.kind)}"`)
      continue
    }
    checkKnownFields(value, [...BASE_FIELDS, ...KIND_FIELDS[value.kind]], where, 'dấu ấn', issues)
    if (value.maxLevel !== undefined) {
      issues.push(...checkInteger(value.maxLevel, `${where}.maxLevel`, 1))
    }
    checkKindFields(data, value, where, issues)
    checkHooks(data, value, where, issues)
  }
}
