// Hook chỉ dùng cho hiệu ứng theo phe (lớp side, mục "Môi trường" ở battle-environment.md): màn chắn giảm
// sát thương nhận, chặn hạ bậc chỉ số, bẫy khi vào sân, chặn chí mạng, chặn skill của địch trong
// lượt (guard), nhân tiền thưởng. Gộp vào registry FIELD_HOOKS ở
// fieldHooks.ts. Hook dùng chung với lớp toàn sân (statMultiplier, blockStatus...) ở fieldHooks.ts.

import { asObject, checkInteger, checkNumber } from '../shared'
import { isStatusImmune } from '../monster'
import { SKILL_CATEGORIES, type SkillCategory, type SkillTarget, type StatName } from '../model'
import { isStageStat } from './paramChecks'
import { validateEmptyParams } from './traitHookUtils'
import {
  SIDE_ONLY,
  checkElements,
  checkGroundedFlag,
  groundedBlocks,
  hasElement,
  type FieldHookHandler,
  type FieldMonsterContext
} from './fieldHookUtils'

/** Phần tử của danh sách theo tầng; tầng vượt danh sách (không xảy ra với dữ liệu hợp lệ) lấy cuối. */
const atLayer = <T>(list: readonly T[], layers: number): T =>
  list[Math.min(layers, list.length) - 1]

/** Độ dài danh sách theo tầng; null nếu không phải danh sách (params sai, đã báo riêng). */
const listLength = (value: unknown): number | null => (Array.isArray(value) ? value.length : null)

/** Danh sách theo tầng không rỗng; mỗi phần tử kiểm tra bằng `check`. */
function checkLayerList(
  value: unknown,
  field: string,
  check: (item: unknown, at: string) => string[]
): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${field} phải là danh sách không rỗng`]
  return value.flatMap((item, i) => check(item, `${field}[${i}]`))
}

// ---------- damageTakenMultiplier: màn chắn (Reflect / Light Screen / Aurora Veil) ----------

interface DamageTakenParams {
  categories: Exclude<SkillCategory, 'status'>[]
  /** Hệ số khi phe đó chỉ còn 1 quái sống trên sân. */
  multiplier: number
  /** Hệ số khi phe đó có 2 quái sống trên sân. */
  allyMultiplier: number
}

const damageTakenMultiplier: FieldHookHandler = {
  scopes: SIDE_ONLY,
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = [
      ...checkNumber(obj.multiplier, 'multiplier', 0),
      ...checkNumber(obj.allyMultiplier, 'allyMultiplier', 0)
    ]
    const damaging = SKILL_CATEGORIES.filter((category) => category !== 'status')
    if (
      !Array.isArray(obj.categories) ||
      obj.categories.length === 0 ||
      obj.categories.some((category) => !(damaging as readonly unknown[]).includes(category)) ||
      new Set(obj.categories).size !== obj.categories.length
    ) {
      issues.push('categories phải là danh sách không lặp gồm "physical" / "special"')
    }
    return issues
  },
  damageTakenMultiplier(params, { skill, defenderSideCount }) {
    const typed = params as DamageTakenParams
    if (!(typed.categories as readonly SkillCategory[]).includes(skill.category)) return 1
    return defenderSideCount > 1 ? typed.allyMultiplier : typed.multiplier
  },
  aiBenefit: (params) => -Math.sign((params as DamageTakenParams).multiplier - 1)
}

// ---------- blockStatLower: quái khác không hạ được bậc chỉ số (Mist) ----------

const blockStatLower: FieldHookHandler = {
  scopes: SIDE_ONLY,
  validateParams: validateEmptyParams,
  blocksStatLower: () => true,
  aiBenefit: () => 1
}

// ---------- entryDamage: bẫy mất % max HP khi vào sân (Spikes, Stealth Rock) ----------

interface EntryDamageParams {
  /** % max HP theo số tầng (phần tử thứ n = n tầng). */
  percentByLayer: number[]
  /** Nhân thêm khắc hệ của hệ này lên quái (Stealth Rock: hệ đá). */
  elementId?: string
  grounded?: true
}

const entryDamage: FieldHookHandler = {
  scopes: SIDE_ONLY,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = [
      ...checkLayerList(obj.percentByLayer, 'percentByLayer', (item, at) =>
        checkNumber(item, at, Number.MIN_VALUE, 100)
      ),
      ...checkGroundedFlag(obj.grounded)
    ]
    if (obj.elementId !== undefined)
      issues.push(...checkElements(data, [obj.elementId], 'elementId'))
    return issues
  },
  layerCount: (params) => listLength(asObject(params)?.percentByLayer),
  entryEffect(params, ctx) {
    const { percentByLayer, elementId, grounded } = params as EntryDamageParams
    // Trait miễn sát thương môi trường (kiểu Overcoat) không chặn bẫy, như Pokémon.
    if (groundedBlocks(grounded, ctx)) return null
    return { kind: 'damage', percent: atLayer(percentByLayer, ctx.layers), elementId }
  },
  aiBenefit(params, ctx) {
    const { grounded } = params as EntryDamageParams
    return groundedBlocks(grounded, ctx) ? 0 : -1
  }
}

// ---------- entryStatus: bẫy gây trạng thái khi vào sân (Toxic Spikes) ----------

interface EntryStatusParams {
  /** Trạng thái theo số tầng (Toxic Spikes: độc, rồi độc nặng). */
  statusIdByLayer: string[]
  grounded?: true
  /** Quái các hệ này vào sân (đứng trên đất nếu grounded) thì hút mất bẫy. */
  absorbedByElementIds?: string[]
}

/** Quái vào sân hút mất bẫy (đã qua điều kiện grounded). */
const absorbs = (params: EntryStatusParams, ctx: FieldMonsterContext): boolean =>
  params.absorbedByElementIds !== undefined && hasElement(ctx.monster, params.absorbedByElementIds)

const entryStatus: FieldHookHandler = {
  scopes: SIDE_ONLY,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = [
      ...checkLayerList(obj.statusIdByLayer, 'statusIdByLayer', (item, at) =>
        typeof item === 'string' && Object.hasOwn(data.statuses, item)
          ? []
          : [`${at}: trạng thái không tồn tại "${String(item)}"`]
      ),
      ...checkGroundedFlag(obj.grounded)
    ]
    if (obj.absorbedByElementIds !== undefined) {
      issues.push(...checkElements(data, obj.absorbedByElementIds, 'absorbedByElementIds'))
    }
    return issues
  },
  layerCount: (params) => listLength(asObject(params)?.statusIdByLayer),
  entryEffect(params, ctx) {
    const typed = params as EntryStatusParams
    if (groundedBlocks(typed.grounded, ctx)) return null
    if (absorbs(typed, ctx)) return { kind: 'absorb' }
    return { kind: 'status', statusId: atLayer(typed.statusIdByLayer, ctx.layers) }
  },
  aiBenefit(params, ctx) {
    const typed = params as EntryStatusParams
    if (groundedBlocks(typed.grounded, ctx) || absorbs(typed, ctx)) return 0
    return isStatusImmune(ctx.data, ctx.monster, typed.statusIdByLayer[0]) ? 0 : -1
  }
}

// ---------- entryStage: bẫy đổi bậc chỉ số khi vào sân (Sticky Web) ----------

interface EntryStageParams {
  stat: Exclude<StatName, 'hp'>
  delta: number
  grounded?: true
}

const entryStage: FieldHookHandler = {
  scopes: SIDE_ONLY,
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = [...checkInteger(obj.delta, 'delta'), ...checkGroundedFlag(obj.grounded)]
    if (obj.delta === 0) issues.push('delta phải khác 0')
    if (!isStageStat(obj.stat)) {
      issues.push('stat phải là chỉ số khác hp')
    }
    return issues
  },
  entryEffect(params, ctx) {
    const { stat, delta, grounded } = params as EntryStageParams
    return groundedBlocks(grounded, ctx) ? null : { kind: 'stage', stat, delta }
  },
  aiBenefit(params, ctx) {
    const { delta, grounded } = params as EntryStageParams
    return groundedBlocks(grounded, ctx) ? 0 : Math.sign(delta)
  }
}

// ---------- blockCritical: đòn đánh vào phe này không chí mạng (Lucky Chant) ----------

const blockCritical: FieldHookHandler = {
  scopes: SIDE_ONLY,
  validateParams: validateEmptyParams,
  blocksCritical: () => true,
  aiBenefit: () => 1
}

// ---------- protectFrom: chặn skill của phe địch trong lượt (Wide Guard, Quick Guard...) ----------

interface ProtectFromParams {
  /** Chỉ skill nhắm các kiểu này (Wide Guard: allEnemies); bỏ trống = mọi skill nhắm địch. */
  targets?: SkillTarget[]
  /** Chỉ skill thuộc các nhóm này (Crafty Shield: status, Mat Block: gây sát thương). */
  categories?: SkillCategory[]
  /** Chỉ skill có priority ≥ số này (Quick Guard: 1). */
  minPriority?: number
}

/** Danh sách không rỗng, không lặp, mỗi phần tử thuộc `allowed`. */
function checkSubsetList(value: unknown, allowed: readonly string[], field: string): string[] {
  if (value === undefined) return []
  const valid =
    Array.isArray(value) &&
    value.length > 0 &&
    new Set(value).size === value.length &&
    value.every((item) => allowed.includes(item))
  return valid ? [] : [`${field} phải là danh sách không lặp gồm ${allowed.join(' / ')}`]
}

const protectFrom: FieldHookHandler = {
  scopes: SIDE_ONLY,
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = [
      ...checkSubsetList(obj.targets, ['enemy', 'allEnemies'], 'targets'),
      ...checkSubsetList(obj.categories, SKILL_CATEGORIES, 'categories')
    ]
    if (obj.minPriority !== undefined) issues.push(...checkInteger(obj.minPriority, 'minPriority'))
    return issues
  },
  protectsFrom(params, skill, priority) {
    const { targets, categories, minPriority } = params as ProtectFromParams
    return (
      (targets === undefined || targets.includes(skill.target)) &&
      (categories === undefined || categories.includes(skill.category)) &&
      (minPriority === undefined || priority >= minPriority)
    )
  },
  // Chỉ có ích khi địch dùng đúng loại skill bị chặn, mà AI không đoán lệnh địch: không cộng điểm.
  aiBenefit: () => 0
}

// ---------- moneyMultiplier: nhân tiền thưởng khi thắng (Happy Hour) ----------

const moneyMultiplier: FieldHookHandler = {
  scopes: SIDE_ONLY,
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.multiplier, 'multiplier', 0) : ['params phải là object']
  },
  moneyMultiplier: (params) => (params as { multiplier: number }).multiplier,
  // Không đổi kết quả trận.
  aiBenefit: () => 0
}

// ---------- secondaryChance: nhân tỉ lệ hiệu ứng phụ skill của phe (Rainbow của Pledge) ----------

const secondaryChance: FieldHookHandler = {
  scopes: SIDE_ONLY,
  validateParams(params) {
    const obj = asObject(params)
    return obj
      ? checkNumber(obj.multiplier, 'multiplier', Number.MIN_VALUE)
      : ['params phải là object']
  },
  secondaryChanceMultiplier: (params) => (params as { multiplier: number }).multiplier,
  aiBenefit: () => 1
}

export const SIDE_FIELD_HOOKS: Readonly<Record<string, FieldHookHandler>> = {
  secondaryChance,
  damageTakenMultiplier,
  blockStatLower,
  entryDamage,
  entryStatus,
  entryStage,
  blockCritical,
  protectFrom,
  moneyMultiplier
}
