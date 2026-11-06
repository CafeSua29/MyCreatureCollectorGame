// Registry hook của môi trường trong trận (thời tiết, địa hình, hiệu ứng theo phe; mục "Môi
// trường" ở battle.md). Thêm cơ chế mới = thêm một handler vào FIELD_HOOKS, rồi khai báo hook
// { type, params } trong fieldEffects.json. Thêm môi trường mới chỉ cần dữ liệu. Không viết
// if/else theo id môi trường.
//
// Mỗi handler cài một hoặc nhiều "pha" (như hook trait / trạng thái); pha nào không cài thì môi
// trường không tác động ở pha đó. Mọi handler tự chấm lợi / hại cho AI (`aiBenefit`) và khai báo
// lớp được dùng (`scopes`). File này: hook toàn sân và hook dùng chung; hook chỉ của hiệu ứng
// theo phe ở sideFieldHooks.ts, chỉ của hiệu ứng toàn sân đặc biệt ở roomHooks.ts. Kiểu handler ở fieldHookUtils.ts, tra cứu tổng hợp ở
// fieldQueries.ts.

import { asObject, checkNumber } from '../shared'
import {
  SKILL_CATEGORIES,
  isOffensiveTarget,
  type GameData,
  type Skill,
  type SkillCategory,
  type StatName
} from '../model'
import { checkIdList, isStageStat } from './paramChecks'
import {
  ANY_SCOPE,
  GLOBAL_ONLY,
  GLOBAL_OR_ROOM,
  checkElementFilter,
  checkElements,
  checkGroundedFlag,
  elementPasses,
  groundedBlocks,
  hasElement,
  hasSkill,
  monsterPasses,
  multiplierSign,
  type ElementFilter,
  type FieldHookHandler,
  type FieldMonsterContext
} from './fieldHookUtils'
import { ROOM_HOOKS } from './roomHooks'
import { SIDE_FIELD_HOOKS } from './sideFieldHooks'

// ---------- elementDamageMultiplier: nhân sát thương skill các hệ (mưa: nước × 1,5) ----------
// Dùng cả cho room (Mud Sport: điện × 1/3).

interface ElementDamageParams {
  elementIds: string[]
  multiplier: number
  /** attacker: chỉ khi quái đánh đứng trên mặt đất; defender: chỉ khi quái nhận đứng trên đất. */
  grounded?: 'attacker' | 'defender'
}

const elementDamageMultiplier: FieldHookHandler = {
  scopes: GLOBAL_OR_ROOM,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = [
      ...checkNumber(obj.multiplier, 'multiplier', 0),
      ...checkElements(data, obj.elementIds, 'elementIds')
    ]
    if (obj.grounded !== undefined && obj.grounded !== 'attacker' && obj.grounded !== 'defender') {
      issues.push('grounded phải là "attacker" hoặc "defender"')
    }
    return issues
  },
  damageMultiplier(params, { skill, attackerGrounded, defenderGrounded }) {
    const { elementIds, multiplier, grounded } = params as ElementDamageParams
    if (!elementIds.includes(skill.elementId)) return 1
    if (grounded === 'attacker' && !attackerGrounded) return 1
    if (grounded === 'defender' && !defenderGrounded) return 1
    return multiplier
  },
  aiBenefit(params, { data, monster, grounded: isOnGround }) {
    const { elementIds, multiplier, grounded } = params as ElementDamageParams
    // Hệ số lên quái nhận: có lợi cho quái đứng trên đất khi giảm sát thương (Misty: rồng × 0,5).
    if (grounded === 'defender') return isOnGround ? -multiplierSign(multiplier) : 0
    if (grounded === 'attacker' && !isOnGround) return 0
    const boosted = hasSkill(
      data,
      monster,
      (skill) => skill.power > 0 && elementIds.includes(skill.elementId)
    )
    return boosted ? multiplierSign(multiplier) : 0
  }
}

// ---------- accuracyMultiplier: nhân accuracy (sương mù: mọi skill × 0,85; Gravity × 5/3) ----------

interface AccuracyParams extends ElementFilter {
  multiplier: number
  /** Chỉ skill thuộc các nhóm này (kiểu địa hình pha lê: skill status); bỏ trống = mọi nhóm. */
  categories?: SkillCategory[]
}

// Bỏ trống elementIds / exceptElementIds = mọi hệ (bão tuyết: mọi skill trừ hệ băng).
const affectsAccuracy = (params: AccuracyParams, skill: Skill): boolean =>
  elementPasses(params, skill.elementId) &&
  (params.categories === undefined || params.categories.includes(skill.category))

/** categories?: danh sách nhóm skill hợp lệ, không rỗng, không lặp. */
function checkCategories(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length === 0)
    return ['categories phải là danh sách không rỗng']
  const issues = value
    .filter((category) => !(SKILL_CATEGORIES as readonly unknown[]).includes(category))
    .map((category) => `categories: nhóm skill lạ "${String(category)}"`)
  if (new Set(value).size !== value.length) issues.push('categories bị lặp')
  return issues
}

const accuracyMultiplier: FieldHookHandler = {
  scopes: GLOBAL_OR_ROOM,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkNumber(obj.multiplier, 'multiplier', Number.MIN_VALUE),
      ...checkElementFilter(data, obj),
      ...checkCategories(obj.categories)
    ]
  },
  accuracyMultiplier(params, skill) {
    const typed = params as AccuracyParams
    return affectsAccuracy(typed, skill) ? typed.multiplier : 1
  },
  aiBenefit(params, { data, monster }) {
    const typed = params as AccuracyParams
    // Accuracy chỉ tung khi nhắm địch.
    const affected = hasSkill(
      data,
      monster,
      (skill) => isOffensiveTarget(skill.target) && affectsAccuracy(typed, skill)
    )
    return affected ? multiplierSign(typed.multiplier) : 0
  }
}

// ---------- statMultiplier: nhân một chỉ số (bão cát: đá thủ đặc biệt × 1,5; Tailwind: tốc độ × 2) ----------

interface StatMultiplierParams extends ElementFilter {
  stat: Exclude<StatName, 'hp'>
  multiplier: number
  /** Chỉ quái đứng trên mặt đất (địa hình đầm lầy: tốc độ × 0,75). */
  grounded?: true
}

// Bỏ trống elementIds / exceptElementIds = mọi quái chịu môi trường (theo phe: mọi quái của phe).
const affectsMonster = (params: StatMultiplierParams, ctx: FieldMonsterContext): boolean =>
  !groundedBlocks(params.grounded, ctx) && monsterPasses(params, ctx.monster)

const statMultiplier: FieldHookHandler = {
  scopes: ANY_SCOPE,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = [
      ...checkNumber(obj.multiplier, 'multiplier', 0),
      ...checkElementFilter(data, obj),
      ...checkGroundedFlag(obj.grounded)
    ]
    // HP không nhân: max HP đổi theo môi trường sẽ làm lệch máu đã mất (damageTaken).
    if (!isStageStat(obj.stat)) {
      issues.push('stat phải là chỉ số khác hp')
    }
    return issues
  },
  statMultiplier(params, ctx) {
    const typed = params as StatMultiplierParams
    return affectsMonster(typed, ctx) ? { stat: typed.stat, multiplier: typed.multiplier } : null
  },
  aiBenefit(params, ctx) {
    const typed = params as StatMultiplierParams
    return affectsMonster(typed, ctx) ? multiplierSign(typed.multiplier) : 0
  }
}

// ---------- turnEndDamage: mất % max HP cuối lượt, trừ các hệ miễn (bão cát, tuyết) ----------

interface TurnEndDamageParams {
  percent: number
  immuneElementIds: string[]
  /** Chỉ quái đứng trên mặt đất (địa hình núi lửa). */
  grounded?: true
}

const damagePercent = (params: unknown, ctx: FieldMonsterContext): number => {
  const { percent, immuneElementIds, grounded } = params as TurnEndDamageParams
  const immune =
    ctx.immuneToFieldDamage ||
    hasElement(ctx.monster, immuneElementIds) ||
    groundedBlocks(grounded, ctx)
  return immune ? 0 : percent
}

const turnEndDamage: FieldHookHandler = {
  scopes: ANY_SCOPE,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100),
      ...checkIdList(obj.immuneElementIds, 'immuneElementIds', data.elements, {
        label: 'hệ',
        allowEmpty: true
      }),
      ...checkGroundedFlag(obj.grounded)
    ]
  },
  turnEndDamagePercent: damagePercent,
  aiBenefit: (params, ctx) => -Math.sign(damagePercent(params, ctx))
}

// ---------- turnEndHeal: hồi % max HP cuối lượt (địa hình cỏ, quái đứng trên đất) ----------

interface TurnEndHealParams {
  percent: number
  grounded?: true
}

const healPercent = (params: unknown, ctx: FieldMonsterContext): number => {
  const { percent, grounded } = params as TurnEndHealParams
  return groundedBlocks(grounded, ctx) ? 0 : percent
}

const turnEndHeal: FieldHookHandler = {
  scopes: ANY_SCOPE,
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100),
      ...checkGroundedFlag(obj.grounded)
    ]
  },
  turnEndHealPercent: healPercent,
  aiBenefit: (params, ctx) => Math.sign(healPercent(params, ctx))
}

// ---------- healMultiplier: nhân lượng hồi máu (đất nguyền: × 0,5) ----------

interface HealMultiplierParams {
  multiplier: number
  grounded?: true
}

const healFactor = (params: unknown, ctx: FieldMonsterContext): number => {
  const { multiplier, grounded } = params as HealMultiplierParams
  return groundedBlocks(grounded, ctx) ? 1 : multiplier
}

const healMultiplier: FieldHookHandler = {
  scopes: ANY_SCOPE,
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [...checkNumber(obj.multiplier, 'multiplier', 0), ...checkGroundedFlag(obj.grounded)]
  },
  healMultiplier: healFactor,
  aiBenefit: (params, ctx) => multiplierSign(healFactor(params, ctx))
}

// ---------- turnEndStatusChance: cuối lượt có tỉ lệ dính trạng thái (chướng khí: 10% độc) ----------

interface TurnEndStatusChanceParams {
  statusId: string
  chance: number
  immuneElementIds: string[]
  grounded?: true
}

const statusChanceFor = (
  params: unknown,
  ctx: FieldMonsterContext
): { statusId: string; chance: number } | null => {
  const { statusId, chance, immuneElementIds, grounded } = params as TurnEndStatusChanceParams
  if (groundedBlocks(grounded, ctx) || hasElement(ctx.monster, immuneElementIds)) return null
  return { statusId, chance }
}

const turnEndStatusChance: FieldHookHandler = {
  scopes: ANY_SCOPE,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkIdList([obj.statusId], 'statusId', data.statuses, { label: 'trạng thái' }),
      ...checkNumber(obj.chance, 'chance', Number.MIN_VALUE, 100),
      ...checkIdList(obj.immuneElementIds, 'immuneElementIds', data.elements, {
        label: 'hệ',
        allowEmpty: true
      }),
      ...checkGroundedFlag(obj.grounded)
    ]
  },
  turnEndStatusChance: statusChanceFor,
  // Dính trạng thái bất lợi; miễn nhiễm hệ / trait thì trận đấu tự bỏ qua (không tung).
  aiBenefit: (params, ctx) => (statusChanceFor(params, ctx) ? -1 : 0)
}

// ---------- blockStatus: không dính trạng thái (địa hình điện: chặn ngủ) ----------

interface BlockStatusParams {
  /** Bỏ trống = mọi trạng thái. */
  statusIds?: string[]
  grounded?: true
}

const blockStatus: FieldHookHandler = {
  scopes: ANY_SCOPE,
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkGroundedFlag(obj.grounded)
    if (obj.statusIds !== undefined) {
      issues.push(
        ...checkIdList(obj.statusIds, 'statusIds', data.statuses, { label: 'trạng thái' })
      )
    }
    return issues
  },
  blocksStatus(params, ctx, statusId) {
    const { statusIds, grounded } = params as BlockStatusParams
    if (groundedBlocks(grounded, ctx)) return false
    return statusIds === undefined || statusIds.includes(statusId)
  },
  // Có lợi cho quái được chặn (Safeguard chỉ phe mình); môi trường toàn sân chặn cho cả hai phe
  // nên phần lợi của hai phe phần lớn triệt tiêu.
  aiBenefit: (params, ctx) => (groundedBlocks((params as BlockStatusParams).grounded, ctx) ? 0 : 1)
}

// ---------- blockElementSkills: skill gây sát thương các hệ thất bại (Heavy Rain: hệ Lửa) ----------

interface ElementListParams {
  elementIds: string[]
}

const checkElementList = (params: unknown, data: GameData): string[] => {
  const obj = asObject(params)
  return obj ? checkElements(data, obj.elementIds, 'elementIds') : ['params phải là object']
}

// Như thời tiết nguyên thủy của Pokémon: chiêu gây sát thương hệ bị chặn thất bại (hệ sau khi
// đổi theo môi trường, nên Weather Ball vẫn dùng được); chiêu trạng thái vẫn dùng được.
const blockElementSkills: FieldHookHandler = {
  scopes: GLOBAL_ONLY,
  validateParams: checkElementList,
  blocksSkill: (params, skill) =>
    skill.category !== 'status' &&
    (params as ElementListParams).elementIds.includes(skill.elementId),
  aiBenefit(params, ctx) {
    const { elementIds } = params as ElementListParams
    const blocked = hasSkill(
      ctx.data,
      ctx.monster,
      (skill) => skill.category !== 'status' && elementIds.includes(skill.elementId)
    )
    return blocked ? -1 : 0
  }
}

// ---------- neutralizeWeakness: hệ của bên nhận hết bị khắc (gió bí ẩn của Delta Stream: hệ Bay) ----------

// Như Pokémon: phần khắc chế > 1 của bảng hệ lên các hệ này thành 1 (kháng, miễn nhiễm giữ nguyên).
const neutralizeWeakness: FieldHookHandler = {
  scopes: GLOBAL_ONLY,
  validateParams: checkElementList,
  neutralizesWeaknessOf: (params, elementId) =>
    (params as ElementListParams).elementIds.includes(elementId),
  aiBenefit: (params, ctx) =>
    hasElement(ctx.monster, (params as ElementListParams).elementIds) ? 1 : 0
}

// ---------- Registry ----------

export const FIELD_HOOKS: Readonly<Record<string, FieldHookHandler>> = {
  elementDamageMultiplier,
  accuracyMultiplier,
  statMultiplier,
  turnEndDamage,
  turnEndHeal,
  healMultiplier,
  turnEndStatusChance,
  blockStatus,
  blockElementSkills,
  neutralizeWeakness,
  ...SIDE_FIELD_HOOKS,
  ...ROOM_HOOKS
}
