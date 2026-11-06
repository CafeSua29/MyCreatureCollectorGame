// Registry hook của trạng thái bất thường. Thêm cơ chế mới = thêm một handler vào STATUS_HOOKS,
// rồi khai báo hook { type, params } trong statuses.json. Không viết if/else theo id trạng thái.
//
// Mỗi handler cài một hoặc nhiều "pha" (như hook trait); pha nào không cài thì trạng thái không
// tác động ở pha đó. Sát thương trạng thái tính theo % max HP để vẫn đúng khi chỉ số scale vô hạn.

import { asObject, checkEnumList, checkNumber } from '../shared'
import {
  SKILL_CATEGORIES,
  type GameData,
  type Monster,
  type NonHpStat,
  type SkillCategory,
  type StatName,
  type StatusInstance
} from '../model'
import { isStageStat } from './paramChecks'
import { SIRALIM_STATUS_HOOKS } from './siralimStatusHooks'

/** Trạng thái đang có trên quái lúc chạy hook. */
export interface StatusHookContext {
  /**
   * Số cuối lượt đã qua kể từ khi dính, tính cả lượt này (1 ở cuối lượt đầu tiên). Chỉ đúng với
   * trạng thái thời hạn cố định (hook cần nó khai báo requiresFixedDuration).
   */
  turnsElapsed: number
  /** Sức mạnh (%) của trạng thái (StatusInstance.potency), mặc định 100. */
  potency: number
  /** Hệ của quái mang trạng thái (Salt Cure mất nhiều hơn với hệ Nước / Thép). */
  elementIds: readonly string[]
}

export interface StatusHookHandler {
  /** Trả về danh sách lỗi; rỗng nếu params hợp lệ. Gọi khi kiểm tra dữ liệu lúc khởi động. */
  validateParams(params: unknown, data: GameData): string[]
  /** Hook cần thời hạn cố định (min = max) để đếm số lượt đã qua; dữ liệu sai thì báo lỗi. */
  requiresFixedDuration?(params: unknown): boolean
  /** Hệ số nhân chỉ số (bước trạng thái của computeStats). */
  statMultiplier?(params: unknown): { stat: Exclude<StatName, 'hp'>; multiplier: number }
  /** Hệ số nhân sát thương khi quái mang trạng thái dùng skill thuộc category này. */
  damageDealtMultiplier?(params: unknown, category: SkillCategory): number
  /** % max HP mất mỗi cuối lượt (khi quái ở trên sân). */
  turnEndDamagePercent?(params: unknown, ctx: StatusHookContext): number
  /** Máu dùng để tính turnEndDamagePercent; bỏ trống = max HP. */
  turnEndDamageBasis?(params: unknown): HpBasis
  /** % mất lượt khi tới lượt dùng skill. */
  skipTurnChance?(params: unknown): number
  /**
   * % trạng thái tự hết ngay lúc tới lượt dùng skill, trước khi xét mất lượt (đông lạnh của Pokémon:
   * 20% tan rồi hành động luôn).
   */
  endBeforeMoveChance?(params: unknown): number
  /** Trạng thái hết khi trúng đòn skill gây sát thương hệ `elementId` (đông lạnh: hệ Lửa). */
  endsOnElementHit?(params: unknown, elementId: string): boolean
  /**
   * Tự đánh mình thay vì dùng skill (lú lẫn của Pokémon): tỉ lệ % và sức mạnh đòn (công / thủ của
   * chính quái, không hệ, không chí mạng).
   */
  selfHit?(params: unknown): SelfHitParams
  /** Hết trạng thái khi quái mất máu vì skill / trait của quái khác (kiểu ngủ của Siralim). */
  endsOnDamage?(params: unknown): boolean
  /** % tan mỗi cuối lượt (Frozen: 25%, gấp đôi sau mỗi lượt). */
  endChanceAtTurnEnd?(params: unknown, ctx: StatusHookContext): number
  /** Loại skill quái mang trạng thái không dùng được (Scorned / Silenced). */
  blockedCategories?(params: unknown): readonly SkillCategory[]
  /** Mục tiêu skill đơn của quái mang trạng thái chọn ngẫu nhiên trong các địch (Blind). */
  randomizesTarget?(params: unknown): boolean
  /** % skill gây hại của quái mang trạng thái nhắm sang đồng đội (Confused). */
  confusionChance?(params: unknown): number
  /** Quái mang trạng thái không được tăng bậc / chỉ số (Feared). */
  blocksStatGain?(params: unknown): boolean
  /** Quái mang trạng thái không bị giảm bậc / chỉ số (Warded). */
  blocksStatLoss?(params: unknown): boolean
  /** Không hồi được máu; mất máu bằng % lượng hồi (Blighted). */
  healBlockDamagePercent?(params: unknown): number
  /** Mỗi lần gây sát thương bằng skill thì mất máu tính theo chỉ số của mục tiêu (Cursed). */
  recoilOnDamage?(params: unknown): { stat: NonHpStat; percent: number }
  /** Cuối lượt nổ: mất % max HP × potency rồi hết trạng thái (Bomb). */
  detonatePercent?(params: unknown): number
  /** Trạng thái là khiên hút sát thương theo `amount` (Barrier); tối đa % chỉ số cao nhất. */
  barrierCapPercent?(params: unknown): number
  /** Cuối lượt mất máu bằng `amount` × potency của trạng thái (Mania). */
  dealsAmountAtTurnEnd?(params: unknown): boolean
  /** Chặn hoàn toàn đòn / spell kế tiếp rồi hết (Shelled). */
  blocksNextHit?(params: unknown): boolean
  /** Địch không nhắm được quái mang trạng thái bằng skill đơn mục tiêu (Invisible). */
  untargetable?(params: unknown): boolean
  /** Hết trạng thái sau khi quái dùng skill thuộc các loại này (null = sau mọi hành động). */
  endsAfterAction?(params: unknown): readonly SkillCategory[] | null
  /** Cuối lượt tự phòng thủ / khiêu khích cho lượt sau (Defensive / Taunting). */
  autoGuard?(params: unknown): 'defend' | 'provoke'
  /** Luôn đi cuối trong cùng mức priority; cuối lượt % thoát mỗi lần tung (Snared). */
  stuckAtBottom?(params: unknown): { breakChance: number }
  /**
   * Skill gây sát thương của quái mang trạng thái hồi máu mục tiêu thay vì gây sát thương, hồi máu
   * đồng đội thì gây sát thương; hết khi tổng lượng đổi ≥ `amount` (Inverted).
   */
  inverts?(params: unknown): { amountPercentOfMaxHp: number }
  /** Gục thì sống lại với % max HP rồi hết trạng thái (Rebirth). */
  rebirthPercent?(params: unknown): number
}

/** Lượng máu dùng để tính sát thương trạng thái theo %. */
export type HpBasis = 'max' | 'current'

// ---------- turnEndDamage: mất % max HP cuối lượt (độc, bỏng; độc nặng tăng dần) ----------

interface TurnEndDamageParams {
  percent: number
  /** Tăng dần như độc nặng của Pokémon: cuối lượt thứ n mất percent × n. */
  escalating?: true
  /** % thay thế khi quái mang có một trong các hệ này (Salt Cure: 25% với hệ Nước / Thép). */
  byElement?: { elementIds: string[]; percent: number }
  /** Tính theo máu hiện tại thay vì max HP (Bleeding của Siralim). */
  basis?: HpBasis
}

const turnEndDamage: StatusHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100)
    if (obj.escalating !== undefined && obj.escalating !== true) {
      issues.push('escalating chỉ được là true')
    }
    if (obj.byElement !== undefined) {
      const rule = asObject(obj.byElement)
      if (!Array.isArray(rule?.elementIds) || rule.elementIds.length === 0) {
        issues.push('byElement.elementIds phải là danh sách hệ')
      }
      issues.push(...checkNumber(rule?.percent, 'byElement.percent', Number.MIN_VALUE, 100))
    }
    if (obj.basis !== undefined && obj.basis !== 'max' && obj.basis !== 'current') {
      issues.push('basis phải là "max" hoặc "current"')
    }
    return issues
  },
  turnEndDamageBasis: (params) => (params as TurnEndDamageParams).basis ?? 'max',
  requiresFixedDuration: (params) => (params as TurnEndDamageParams).escalating === true,
  turnEndDamagePercent(params, { turnsElapsed, potency, elementIds }) {
    const { escalating, byElement } = params as TurnEndDamageParams
    const matches = byElement?.elementIds.some((id) => elementIds.includes(id)) === true
    const percent =
      matches && byElement ? byElement.percent : (params as TurnEndDamageParams).percent
    // Tăng dần vẫn không quá 100% max HP mỗi lượt; potency (trait tăng sức mạnh trạng thái) nhân thêm.
    const base = escalating ? Math.min(100, percent * turnsElapsed) : percent
    return base * (potency / 100)
  }
}

// ---------- skipTurn: % mất lượt (tê liệt 25%, ngủ 100%) ----------

const skipTurn: StatusHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj
      ? checkNumber(obj.chance, 'chance', Number.MIN_VALUE, 100)
      : ['params phải là object']
  },
  skipTurnChance(params) {
    return (params as { chance: number }).chance
  }
}

// ---------- selfHit: % tự đánh mình (lú lẫn Pokémon: 33%, sức mạnh 40) ----------

export interface SelfHitParams {
  chance: number
  power: number
}

const selfHit: StatusHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj
      ? [
          ...checkNumber(obj.chance, 'chance', Number.MIN_VALUE, 100),
          ...checkNumber(obj.power, 'power', Number.MIN_VALUE)
        ]
      : ['params phải là object']
  },
  selfHit: (params) => params as SelfHitParams
}

// ---------- statMultiplier: nhân một chỉ số (tê liệt: tốc độ × 0,5) ----------

interface StatMultiplierParams {
  stat: Exclude<StatName, 'hp'>
  multiplier: number
}

const statMultiplier: StatusHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.multiplier, 'multiplier', 0)
    // HP không nhân: max HP đổi theo trạng thái sẽ làm lệch máu đã mất (damageTaken).
    if (!isStageStat(obj.stat)) {
      issues.push('stat phải là chỉ số khác hp')
    }
    return issues
  },
  statMultiplier(params) {
    const { stat, multiplier } = params as StatMultiplierParams
    return { stat, multiplier }
  }
}

// ---------- damageDealtMultiplier: nhân sát thương gây ra theo category skill (bỏng) ----------

interface DamageDealtParams {
  category: SkillCategory
  multiplier: number
}

const damageDealtMultiplier: StatusHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.multiplier, 'multiplier', 0)
    if (
      obj.category === 'status' ||
      !(SKILL_CATEGORIES as readonly unknown[]).includes(obj.category)
    ) {
      issues.push('category phải là "physical" hoặc "special"')
    }
    return issues
  },
  damageDealtMultiplier(params, category) {
    const { category: affected, multiplier } = params as DamageDealtParams
    return category === affected ? multiplier : 1
  }
}

// ---------- Registry ----------

// ---------- endBeforeMove: % tự hết lúc tới lượt (đông lạnh tan 20%) ----------

const endBeforeMove: StatusHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj
      ? checkNumber(obj.chance, 'chance', Number.MIN_VALUE, 100)
      : ['params phải là object']
  },
  endBeforeMoveChance: (params) => (params as { chance: number }).chance
}

// ---------- endsOnElementHit: hết khi trúng đòn hệ nhất định (đông lạnh: Lửa) ----------

const endsOnElementHit: StatusHookHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return checkEnumList(obj.elementIds, 'elementIds', Object.keys(data.elements))
  },
  endsOnElementHit: (params, elementId) =>
    (params as { elementIds: string[] }).elementIds.includes(elementId)
}

export const STATUS_HOOKS: Readonly<Record<string, StatusHookHandler>> = {
  turnEndDamage,
  skipTurn,
  endBeforeMove,
  endsOnElementHit,
  selfHit,
  statMultiplier,
  damageDealtMultiplier,
  ...SIRALIM_STATUS_HOOKS
}

/** Ngữ cảnh hook của một trạng thái đang có (số lượt đã qua suy ra từ thời hạn cố định). */
const statusHookContext = (
  data: GameData,
  status: StatusInstance,
  monster: Monster
): StatusHookContext => {
  const duration = data.statuses[status.statusId].duration
  // Trạng thái thời hạn cố định: suy số lượt đã qua từ thời hạn (save cũ không có turnsElapsed);
  // trạng thái không theo lượt / bị kéo dài mãi: đếm trên trạng thái.
  const turnsElapsed =
    duration && status.turnsLeft !== null && status.turnsElapsed === undefined
      ? Math.max(1, duration.max - status.turnsLeft + 1)
      : (status.turnsElapsed ?? 0) + 1
  return { turnsElapsed, potency: status.potency ?? 100, elementIds: monster.elementIds }
}

/** Gọi fn với mọi hook của mọi trạng thái đang có trên quái, theo thứ tự trạng thái. */
export function forEachStatusHook(
  data: GameData,
  monster: Monster,
  fn: (
    handler: StatusHookHandler,
    params: unknown,
    statusId: string,
    ctx: StatusHookContext
  ) => void
): void {
  for (const status of monster.statuses) {
    const ctx = statusHookContext(data, status, monster)
    for (const hook of data.statuses[status.statusId].hooks) {
      fn(STATUS_HOOKS[hook.type], hook.params, status.statusId, ctx)
    }
  }
}

/** Trạng thái đầu tiên (theo thứ tự trạng thái) có pha `read` trả giá trị khác undefined. */
export function findStatusHook<T>(
  data: GameData,
  monster: Monster,
  read: (handler: StatusHookHandler, params: unknown, ctx: StatusHookContext) => T | undefined
): { value: T; statusId: string } | null {
  let found: { value: T; statusId: string } | null = null
  forEachStatusHook(data, monster, (handler, params, statusId, ctx) => {
    if (found !== null) return
    const value = read(handler, params, ctx)
    if (value !== undefined) found = { value, statusId }
  })
  return found
}

/** Quái có trạng thái nào trả true cho pha bật / tắt `check` không. */
export const hasStatusFlag = (
  data: GameData,
  monster: Monster,
  check: (handler: StatusHookHandler, params: unknown) => boolean | undefined
): boolean =>
  findStatusHook(data, monster, (handler, params) => check(handler, params) || undefined) !== null
