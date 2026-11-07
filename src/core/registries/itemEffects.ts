// Registry hiệu ứng vật phẩm dùng lên một quái của ta (trong và ngoài trận). Thêm hiệu ứng mới =
// thêm handler vào ITEM_EFFECTS, rồi khai báo { type, params } trong items.json.
// applyItemToMonster chọn cách áp theo category của item.

import { raceMatchesAny } from './races'
import { withWorkTrait } from './work'
import { addPurity, purityOf } from './bloodlines'
import {
  asObject,
  assertNever,
  checkInteger,
  checkNumber,
  maxBig,
  toBig,
  type Decimal,
  createRng,
  type RngState
} from '../shared'
import { canHaveGmaxFactor } from '../inventory'
import { autoEvolve, evolveVia, stoneEvolution } from '../progression'
import {
  ABILITY_SLOT_CHANGES,
  POLARITY_CHANGES,
  type PolarityChange,
  changePolarity,
  addEffortValues,
  changedAbilitySlot,
  type AbilitySlotChange,
  effortTotal,
  emptyEffortValues,
  expCandyScale,
  monsterExpForLevel,
  gainExp,
  getMaxHp,
  marksOfKind,
  percentOfMaxHp,
  removeMark,
  rollPartMarkGain
} from '../monster'
import {
  STAT_NAMES,
  WORK_TYPES,
  type BattleEvent,
  type ConsumableItem,
  type EffectDef,
  type FavoriteFields,
  type GameData,
  type Item,
  type MarkInstance,
  type Monster,
  type StatName,
  type WorkType
} from '../model'
import { changeAffinity } from './affinity'
import { TREASURE_EFFECTS } from './treasureEffects'
import type { EvolutionScene } from './evolutionConditions'

export interface ItemEffectContext {
  data: GameData
  monster: Monster
  maxHp: Decimal
  /** Số lần quái đã dùng đúng vật phẩm này trước lần này (Monster.itemUseCounts; kháng đan). */
  useCount: number
  /** Tầng cao nhất từng đạt (kẹo EXP nhân hệ số theo tầng). */
  highestFloor: number
  /** Số cái dùng một lần; luôn 1 với hiệu ứng không có allowsCount. */
  count: number
  /** RNG cho hiệu ứng ngẫu nhiên (applyRandom). */
  rng: RngState
  /** Quái đúng khẩu vị của vật phẩm (favoriteRaceIds / favoriteElementIds; treasures.md). */
  favorite: boolean
  /** Skill người chơi chọn lúc dùng (hiệu ứng needsSkill). */
  skillId?: string
}

export interface ItemEffectHandler {
  validateParams(params: unknown, data: GameData): string[]
  /** Trả về quái mới, hoặc null nếu hiệu ứng không có tác dụng (ví dụ hồi máu khi đã đầy). */
  apply(params: unknown, ctx: ItemEffectContext): Monster | null
  /**
   * Hiệu ứng giảm dần theo số lần dùng: dùng có tác dụng thì đếm thêm một lần vào itemUseCounts
   * của quái (một lần mỗi lần dùng vật phẩm, dù vật phẩm có nhiều hiệu ứng).
   */
  countsUses?: true
  /**
   * Dùng nhiều cái một lần được (action useItem có count; kẹo EXP như Pokémon): handler tự nhân
   * theo ctx.count, áp một lần cho cả lượt dùng.
   */
  allowsCount?: true
  /**
   * Điểm AI của hiệu ứng lên quái (cùng thang điểm lệnh của AI trận; kỹ năng ngự thú sư nhắm quái
   * ta); bỏ trống = 0 (AI không chủ động dùng).
   */
  aiValue?(params: unknown, ctx: ItemEffectAiContext): number
  /** Hiệu ứng có ngẫu nhiên: dùng thay cho apply, trả kèm RNG mới. */
  applyRandom?(params: unknown, ctx: ItemEffectContext): [Monster | null, RngState]
  /** Cần skill chọn lúc dùng (useItem có skillId; Ngộ Đạo Trà). */
  needsSkill?: true
}

/** Bối cảnh chấm điểm AI của hiệu ứng vật phẩm. */
export interface ItemEffectAiContext {
  data: GameData
  monster: Monster
  maxHp: Decimal
}

const isFaintedAt = (monster: Monster, maxHp: Decimal): boolean => monster.damageTaken.gte(maxHp)

// ---------- healPercent: hồi % max HP, chỉ cho quái còn sống ----------

const healPercent: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent', 0) : ['params phải là object']
  },
  apply(params, { monster, maxHp }) {
    if (monster.damageTaken.lte(0) || isFaintedAt(monster, maxHp)) return null
    const amount = percentOfMaxHp(maxHp, (params as { percent: number }).percent)
    return { ...monster, damageTaken: maxBig(0, monster.damageTaken.minus(amount)) }
  },
  aiValue(params, { data, monster, maxHp }) {
    if (isFaintedAt(monster, maxHp)) return 0
    // Chỉ tính phần máu thực hồi được (đầy máu thì vô ích).
    const amount = percentOfMaxHp(maxHp, (params as { percent: number }).percent)
    const healed = amount.lt(monster.damageTaken) ? amount : monster.damageTaken
    return healed.div(maxHp).toNumber() * data.config.ai.healWeight
  }
}

// ---------- revive: hồi sinh quái đã gục với % max HP ----------

const revive: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj
      ? checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100)
      : ['params phải là object']
  },
  apply(params, { monster, maxHp }) {
    if (!isFaintedAt(monster, maxHp)) return null
    const restored = percentOfMaxHp(maxHp, (params as { percent: number }).percent)
    return { ...monster, damageTaken: maxBig(0, maxHp.minus(restored)) }
  },
  aiValue(params, { data, monster, maxHp }) {
    if (!isFaintedAt(monster, maxHp)) return 0
    const { healWeight, reviveBonus } = data.config.ai
    return ((params as { percent: number }).percent / 100) * healWeight + reviveBonus
  }
}

// ---------- swapGender: đổi gender ----------

const swapGender: ItemEffectHandler = {
  validateParams(params) {
    return asObject(params) ? [] : ['params phải là object']
  },
  apply(_params, { monster }) {
    // Quái không giới tính: không có tác dụng (mục "Loài không giới tính"), không mất thuốc.
    if (monster.gender === 'none') return null
    return { ...monster, gender: monster.gender === 'male' ? 'female' : 'male' }
  }
}

// ---------- setNature: đặt tính cách (Bạc Hà Tính Cách, docs/rules/natures.md) ----------

const setNature: ItemEffectHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return typeof obj.natureId === 'string' && obj.natureId in data.natures
      ? []
      : [`natureId: tính cách không tồn tại "${String(obj.natureId)}"`]
  },
  apply(params, { monster }) {
    const { natureId } = params as { natureId: string }
    // Đã đúng tính cách: không có tác dụng, không mất bạc hà.
    return monster.natureId === natureId ? null : { ...monster, natureId }
  }
}

// ---------- addWorkTrait: cấy trait làm việc (Phù cấy, như Passive Skill Implant; dwelling.md) ----------

const addWorkTrait: ItemEffectHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return typeof obj.traitId === 'string' && Object.hasOwn(data.workTraits, obj.traitId)
      ? []
      : [`traitId: trait làm việc không tồn tại "${String(obj.traitId)}"`]
  },
  apply(params, { data, monster }) {
    const { traitId } = params as { traitId: string }
    // Đã có, hoặc đủ chỗ mà không có trait cùng nhóm để thay: không có tác dụng, không mất phù.
    const workTraits = withWorkTrait(data, monster.workTraits, traitId)
    return workTraits.includes(traitId) && !monster.workTraits.includes(traitId)
      ? { ...monster, workTraits }
      : null
  }
}

// ---------- addWorkPoints: + % chỉ số làm việc (Sách làm việc, như Work Suitability Manual) ----------

const addWorkPoints: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...((WORK_TYPES as readonly unknown[]).includes(obj.workType)
        ? []
        : [`workType phải là ${WORK_TYPES.join(' / ')}`]),
      ...checkInteger(obj.percent, 'percent', 1)
    ]
  },
  apply(params, { monster }) {
    const { workType, percent } = params as { workType: WorkType; percent: number }
    const current = monster.workPoints[workType] ?? 0
    const next = Math.min(Number.MAX_SAFE_INTEGER, current + percent)
    return { ...monster, workPoints: { ...monster.workPoints, [workType]: next } }
  }
}

// ---------- cureAilment: chữa bệnh / chấn thương bậc ≤ tier (Thuốc trị thương, dwelling.md) ----------

const cureAilment: ItemEffectHandler = {
  validateParams: (params) => {
    const obj = asObject(params)
    return obj ? checkInteger(obj.tier, 'tier', 1) : ['params phải là object']
  },
  apply(params, { data, monster }) {
    const { tier } = params as { tier: number }
    const ailment = monster.ailment ? data.ailments[monster.ailment.id] : undefined
    // Không bệnh hoặc thuốc yếu hơn bệnh: không có tác dụng, không mất thuốc.
    return ailment && ailment.cureTier <= tier ? { ...monster, ailment: null } : null
  }
}

// ---------- clearWorkTraits: xóa mọi trait làm việc (Phù tẩy tâm, dwelling.md) ----------

const clearWorkTraits: ItemEffectHandler = {
  validateParams: (params) => (asObject(params) ? [] : ['params phải là object']),
  // Chưa có trait nào: không có tác dụng, không mất phù.
  apply: (_params, { monster }) =>
    monster.workTraits.length === 0 ? null : { ...monster, workTraits: [] }
}

// ---------- changeAbilitySlot: đổi ô ability (Ability Capsule / Patch, docs/rules/abilities.md) ----------

const changeAbilitySlot: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return (ABILITY_SLOT_CHANGES as readonly unknown[]).includes(obj.change)
      ? []
      : ['change phải là swapNormal hoặc toggleHidden']
  },
  apply(params, { data, monster }) {
    const { change } = params as { change: AbilitySlotChange }
    // Không đổi được (cùng ability, không có ô ẩn...): không có tác dụng, không mất vật phẩm.
    const slot = changedAbilitySlot(data, monster, change)
    return slot === null ? null : { ...monster, abilitySlot: slot }
  }
}

// ---------- addEffort: ± điểm nỗ lực một chỉ số (vitamin, lông vũ, quả mọng; effort-values.md) ----------

const addEffort: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues: string[] = []
    if (!Number.isSafeInteger(obj.amount) || obj.amount === 0) {
      issues.push(`amount phải là số nguyên khác 0, nhận ${String(obj.amount)}`)
    }
    if (!(STAT_NAMES as readonly unknown[]).includes(obj.stat)) {
      issues.push(`stat phải là chỉ số, nhận "${String(obj.stat)}"`)
    }
    return issues
  },
  // Đã chạm trần (tăng) hoặc 0 điểm (giảm): không có tác dụng, không mất vật phẩm. Không cho dùng
  // nhiều cái một lần để không mất phần vượt trần.
  apply(params, { data, monster }) {
    const { stat, amount } = params as { stat: StatName; amount: number }
    const changed = addEffortValues(data, monster, { [stat]: amount })
    return changed === monster ? null : changed
  }
}

// ---------- resetEffort: mọi điểm nỗ lực về 0 (Bánh Tẩy Tủy; effort-values.md) ----------

const resetEffort: ItemEffectHandler = {
  validateParams(params) {
    return asObject(params) ? [] : ['params phải là object']
  },
  apply(_params, { monster }) {
    if (effortTotal(monster.effortValues) === 0) return null
    return { ...monster, effortValues: emptyEffortValues() }
  }
}

// ---------- resetTalents: tẩy thiên phú (Vong Ưu Thủy, docs/rules/monster-talents.md) ----------

const resetTalents: ItemEffectHandler = {
  validateParams(params) {
    return asObject(params) ? [] : ['params phải là object']
  },
  apply(_params, { monster }) {
    // Điểm suy từ level / thức tỉnh nên xóa cấp là hoàn đủ điểm. Chưa nâng nút nào: không có tác
    // dụng, không mất vật phẩm.
    return Object.keys(monster.talentRanks).length === 0 ? null : { ...monster, talentRanks: {} }
  }
}

// ---------- cureStatus: chữa trạng thái bất thường (thuốc giải) ----------

const cureStatus: ItemEffectHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    // Bỏ trống statusIds = chữa mọi trạng thái.
    if (obj.statusIds === undefined) return []
    if (!Array.isArray(obj.statusIds) || obj.statusIds.length === 0) {
      return ['statusIds phải là danh sách không rỗng (bỏ trống = chữa mọi trạng thái)']
    }
    return obj.statusIds.flatMap((statusId) =>
      typeof statusId === 'string' && statusId in data.statuses
        ? []
        : [`statusIds: trạng thái không tồn tại "${String(statusId)}"`]
    )
  },
  apply(params, { monster }) {
    const { statusIds } = params as { statusIds?: string[] }
    const kept = monster.statuses.filter(
      (status) => statusIds !== undefined && !statusIds.includes(status.statusId)
    )
    // Không có trạng thái nào để chữa: không có tác dụng, không mất thuốc.
    return kept.length === monster.statuses.length ? null : { ...monster, statuses: kept }
  },
  aiValue(params, { data, monster }) {
    const { statusIds } = params as { statusIds?: string[] }
    // Giá trị chữa một trạng thái = giá trị gây trạng thái đó lên địch (config.ai.statusWeights).
    return monster.statuses
      .filter((status) => statusIds === undefined || statusIds.includes(status.statusId))
      .reduce((sum, status) => sum + (data.config.ai.statusWeights[status.statusId] ?? 0), 0)
  }
}

// ---------- toggleGmaxFactor: bật / tắt Gmax Factor (Max Soup) ----------

const toggleGmaxFactor: ItemEffectHandler = {
  validateParams(params) {
    return asObject(params) ? [] : ['params phải là object']
  },
  apply(_params, { data, monster }) {
    // Quái không mang được Gmax Factor (quái fuse giữ cờ cũ, không đổi): không có tác dụng.
    if (monster.fused || !canHaveGmaxFactor(data, monster.speciesId)) return null
    return { ...monster, gmaxFactor: !monster.gmaxFactor }
  }
}

// ---------- dynamaxLevelUp: +levels cấp Dynamax, tối đa maxLevel (Dynamax Candy) ----------

const dynamaxLevelUp: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkInteger(obj.levels, 'levels', 1) : ['params phải là object']
  },
  apply(params, { data, monster }) {
    const { maxLevel } = data.config.transform.dynamax
    if (monster.dynamaxLevel >= maxLevel) return null
    const { levels } = params as { levels: number }
    return { ...monster, dynamaxLevel: Math.min(maxLevel, monster.dynamaxLevel + levels) }
  }
}

// ---------- addLifespan: + năm thọ nguyên, giảm dần theo số lần dùng (Thọ Nguyên Đan) ----------

const addLifespan: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.years, 'years', Number.MIN_VALUE) : ['params phải là object']
  },
  // Kháng đan (mục "Thọ Nguyên Đan"): × pillResistance^(số lần đã dùng đúng loại đan này). Tắt thọ
  // nguyên vẫn cộng năm, để dành cho lúc bật lại.
  apply(params, { data, monster, useCount }) {
    const { years } = params as { years: number }
    const gained = toBig(years).times(toBig(data.config.lifespan.pillResistance).pow(useCount))
    return { ...monster, lifespanBonusYears: monster.lifespanBonusYears.plus(gained) }
  },
  countsUses: true
}

/** Kẹo tăng thân mật mỗi viên (chủ project chốt: như Pokémon tăng thân mật mỗi lần lên level). */
const candyAffinity = (data: GameData, monster: Monster, count: number): Monster =>
  changeAffinity(data, monster, data.config.affinity.gain.candy * count)

// ---------- addAffinity: ± thân mật (vật phẩm cho ăn, docs/rules/affinity.md) ----------

const addAffinity: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return Number.isSafeInteger(obj.amount) && obj.amount !== 0
      ? []
      : [`amount phải là số nguyên khác 0, nhận ${String(obj.amount)}`]
  },
  // Không kháng (đã có trần); đã chạm trần / sàn thì không có tác dụng, không mất vật phẩm.
  apply(params, { data, monster }) {
    const changed = changeAffinity(data, monster, (params as { amount: number }).amount)
    return changed === monster ? null : changed
  }
}

// ---------- addPurity: + độ thuần một nhóm huyết mạch (Tinh huyết, docs/rules/bloodline.md) ----------

const addPurityEffect: ItemEffectHandler = {
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues =
      typeof obj.groupId === 'string' && Object.hasOwn(data.bloodlines, obj.groupId)
        ? []
        : [`groupId: nhóm huyết mạch không tồn tại "${String(obj.groupId)}"`]
    return [...issues, ...checkNumber(obj.amount, 'amount', Number.MIN_VALUE)]
  },
  // Chỉ quái thuộc nhóm; đã 100% thì không có tác dụng (không mất vật phẩm).
  apply(params, { data, monster }) {
    const { groupId, amount } = params as { groupId: string; amount: number }
    const changed = addPurity(data, monster, groupId, amount)
    return purityOf(changed, groupId) === purityOf(monster, groupId) ? null : changed
  }
}

// ---------- setPolarity: đá chuyển cực Âm / Dương (docs/rules/polarity.md) ----------

const setPolarity: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return (POLARITY_CHANGES as readonly unknown[]).includes(obj.change)
      ? []
      : [`change phải là ${POLARITY_CHANGES.join(' / ')}, nhận "${String(obj.change)}"`]
  },
  // Không đổi được (đã có cực / chưa có cực): không có tác dụng, không mất đá.
  apply: () => null,
  applyRandom(params, { data, monster, rng }) {
    return changePolarity(data, rng, monster, (params as { change: PolarityChange }).change)
  }
}

// ---------- mutate / cureScar: dấu ấn (Dị Biến Dịch, Sinh Cơ Đan; docs/rules/marks.md) ----------

const ITEM_MARK_ORIGIN = { source: 'item', floor: null } as const

const mutate: ItemEffectHandler = {
  validateParams: (params) => (asObject(params) ? [] : ['params phải là object']),
  // Không còn bộ phận nào nhận được đột biến: không có tác dụng, không mất đan.
  apply: () => null,
  applyRandom(_params, { data, monster, rng }) {
    const [result, after] = rollPartMarkGain(data, rng, {
      monster,
      kind: 'mutation',
      chance: 100,
      origin: ITEM_MARK_ORIGIN
    })
    return [result.changes.length > 0 ? result.monster : null, after]
  }
}

const cureScar: ItemEffectHandler = {
  validateParams: (params) => (asObject(params) ? [] : ['params phải là object']),
  // Chữa sẹo cấp cao nhất (cùng cấp: sẹo có trước); không có sẹo thì không mất đan.
  apply(_params, { data, monster }) {
    const scars = marksOfKind(data, monster, 'scar').map(({ mark }) => mark)
    const worst = scars.reduce<MarkInstance | undefined>(
      (best, mark) => (best === undefined || mark.level > best.level ? mark : best),
      undefined
    )
    return worst ? removeMark(monster, worst, 'item').monster : null
  }
}

// ---------- addExp: + EXP theo tầng cao nhất (Kẹo EXP) ----------

const addExp: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.baseExp, 'baseExp', Number.MIN_VALUE) : ['params phải là object']
  },
  // Không nhân các % EXP (trait, giai đoạn tuổi...): kẹo cho đúng số ghi trên kẹo × hệ số tầng.
  apply(params, { data, monster, highestFloor, count }) {
    const { baseExp } = params as { baseExp: number }
    const amount = toBig(baseExp).times(expCandyScale(data, highestFloor)).times(count).floor()
    if (amount.lte(0)) return null
    return candyAffinity(data, gainExp(data, monster, amount).monster, count)
  },
  allowsCount: true
}

// ---------- levelUp: + levels level bất kể level hiện tại (Kẹo Hiếm) ----------

const levelUp: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkInteger(obj.levels, 'levels', 1) : ['params phải là object']
  },
  // Như Kẹo Hiếm của Pokémon: EXP lên đúng mức tối thiểu của level đích.
  apply(params, { data, monster, count }) {
    const { levels } = params as { levels: number }
    const targetLevel = monster.level + levels * count
    // Level là number (big-numbers.md): vượt số nguyên an toàn thì coi như không có tác dụng.
    if (!Number.isSafeInteger(targetLevel)) return null
    const amount = maxBig(0, monsterExpForLevel(data, monster, targetLevel).minus(monster.exp))
    return candyAffinity(data, gainExp(data, monster, amount).monster, count)
  },
  allowsCount: true
}

// ---------- Registry ----------

export const ITEM_EFFECTS: Readonly<Record<string, ItemEffectHandler>> = {
  changeAbilitySlot,
  healPercent,
  revive,
  swapGender,
  setNature,
  addWorkTrait,
  addWorkPoints,
  clearWorkTraits,
  cureAilment,
  addEffort,
  resetEffort,
  resetTalents,
  cureStatus,
  toggleGmaxFactor,
  dynamaxLevelUp,
  addLifespan,
  addExp,
  levelUp,
  addAffinity,
  addPurity: addPurityEffect,
  setPolarity,
  mutate,
  cureScar,
  ...TREASURE_EFFECTS
}

/** Vật phẩm cần chọn skill lúc dùng (có hiệu ứng needsSkill). */
export const itemNeedsSkill = (item: Item): boolean =>
  item.category === 'consumable' &&
  item.effects.some((effect) => ITEM_EFFECTS[effect.type].needsSkill === true)

/** Vật phẩm dùng được nhiều cái một lần: tiêu hao mà mọi hiệu ứng đều có allowsCount. */
export function itemAllowsCount(item: Item): boolean {
  return (
    item.category === 'consumable' &&
    item.effects.every((effect) => ITEM_EFFECTS[effect.type].allowsCount === true)
  )
}

/** Bối cảnh dùng vật phẩm lên quái ta. count bỏ trống = 1. */
export interface ItemApplyOptions {
  rng: RngState
  day: number
  highestFloor: number
  /** Hoàn cảnh xét tiến hóa (đội, nơi đang ở; evolutionScene ở world/). */
  scene: EvolutionScene
  count?: number
  /** Skill chọn lúc dùng (vật phẩm có hiệu ứng needsSkill). */
  skillId?: string
}

/** Bối cảnh áp danh sách hiệu ứng vật phẩm (applyItemEffects). */
export interface ItemEffectsOptions {
  highestFloor: number
  /** Số cái dùng một lần (chỉ hiệu ứng allowsCount nhân theo). */
  count: number
  /** Số lần đã dùng đúng vật phẩm này trước lần này (hiệu ứng giảm dần). */
  useCount: number
  /** RNG cho hiệu ứng ngẫu nhiên; bỏ trống = không có hiệu ứng ngẫu nhiên nào được dùng. */
  rng?: RngState
  favorite?: boolean
  skillId?: string
}

/**
 * Áp lần lượt một danh sách hiệu ứng vật phẩm (ITEM_EFFECTS) lên quái: dùng cho thuốc và kỹ năng
 * ngự thú sư nhắm quái ta. Trả về quái mới và có hiệu ứng đếm lượt dùng nào có tác dụng không;
 * null nếu không hiệu ứng nào có tác dụng.
 */
export function applyItemEffects(
  data: GameData,
  monster: Monster,
  effects: readonly EffectDef[],
  { highestFloor, count, useCount, rng, favorite = false, skillId }: ItemEffectsOptions
): { monster: Monster; countsUse: boolean; rng: RngState | undefined } | null {
  let current = monster
  let changed = false
  let countsUse = false
  for (const effect of effects) {
    const handler = ITEM_EFFECTS[effect.type]
    // Hiệu ứng ngẫu nhiên chỉ có khi nơi gọi đưa RNG (dùng vật phẩm ngoài trận).
    if (handler.applyRandom && rng === undefined) continue
    const ctx: ItemEffectContext = {
      data,
      monster: current,
      maxHp: getMaxHp(data, current),
      useCount,
      highestFloor,
      count: handler.allowsCount ? count : 1,
      // Chỉ applyRandom đọc rng, và đã chắc có rng ở trên; hiệu ứng khác nhận giá trị giữ chỗ.
      rng: rng ?? createRng(0),
      favorite,
      skillId
    }
    let result: Monster | null
    if (handler.applyRandom) [result, rng] = handler.applyRandom(effect.params, ctx)
    else result = handler.apply(effect.params, ctx)
    if (result) {
      current = result
      changed = true
      if (handler.countsUses) countsUse = true
    }
  }
  return changed ? { monster: current, countsUse, rng } : null
}

/** Quái đúng khẩu vị của vật phẩm: race trong favoriteRaceIds hoặc có hệ trong favoriteElementIds. */
export const isFavoriteItem = (
  data: GameData,
  item: FavoriteFields,
  monster: Pick<Monster, 'raceId' | 'elementIds'>
): boolean =>
  raceMatchesAny(data, monster.raceId, item.favoriteRaceIds ?? []) ||
  (item.favoriteElementIds?.some((id) => monster.elementIds.includes(id)) ?? false)

/**
 * Áp mọi hiệu ứng của vật phẩm tiêu hao; null nếu không hiệu ứng nào có tác dụng. Đúng khẩu vị thì
 * hiệu ứng thiên tài địa bảo mạnh hơn và + thân mật (docs/rules/treasures.md).
 */
function applyConsumable(
  data: GameData,
  monster: Monster,
  item: ConsumableItem,
  {
    highestFloor,
    count,
    rng,
    skillId
  }: { highestFloor: number; count: number; rng: RngState; skillId?: string }
): { monster: Monster; rng: RngState } | null {
  // Vật phẩm ném nhắm quái hoang (battle/battleItems.ts), không áp lên quái ta.
  if (item.target === 'enemy') return null
  const useCount = monster.itemUseCounts[item.id] ?? 0
  const favorite = isFavoriteItem(data, item, monster)
  const applied = applyItemEffects(data, monster, item.effects, {
    highestFloor,
    count,
    useCount,
    rng,
    favorite,
    skillId
  })
  if (!applied) return null
  const fed = favorite
    ? changeAffinity(data, applied.monster, data.config.treasures.favoriteAffinity)
    : applied.monster
  if (!applied.countsUse) return { monster: fed, rng: applied.rng ?? rng }
  const itemUseCounts = { ...fed.itemUseCounts, [item.id]: useCount + 1 }
  return { monster: { ...fed, itemUseCounts }, rng: applied.rng ?? rng }
}

/** Quái sau khi dùng vật phẩm và RNG sau khi tung (tiến hóa có thể tung giới tính). */
export interface ItemApplyResult {
  monster: Monster
  rng: RngState
  /** Log tiến hóa (nghiên cứu loài đếm "tiến hóa ra", docs/rules/species-research.md); không có = rỗng. */
  events: readonly BattleEvent[]
}

/**
 * Áp một vật phẩm lên một quái của ta, theo category. Trả về quái mới, hoặc null nếu không có
 * tác dụng (khi đó không được trừ vật phẩm). Nơi gọi đã kiểm tra item dùng được ở đâu
 * (assertUsableIn) và count (itemAllowsCount); category không áp lên quái ta (bóng, trang bị...)
 * luôn trả null.
 */
export function applyItemToMonster(
  data: GameData,
  monster: Monster,
  item: Item,
  { rng, day, highestFloor, scene, count = 1, skillId }: ItemApplyOptions
): ItemApplyResult | null {
  switch (item.category) {
    case 'consumable': {
      const result = applyConsumable(data, monster, item, { highestFloor, count, rng, skillId })
      if (!result) return null
      const consumed = result.monster
      rng = result.rng
      // Thuốc hồi máu thật (kể cả hồi sinh) tăng thân mật (docs/rules/affinity.md).
      const healed = consumed.damageTaken.lt(monster.damageTaken)
      const applied = healed
        ? changeAffinity(data, consumed, data.config.affinity.gain.potion)
        : consumed
      // Lên level bằng vật phẩm (kẹo) xét tiến hóa theo level ngay, như Kẹo Hiếm của Pokémon.
      if (applied.level <= monster.level) return { monster: applied, rng, events: [] }
      const evolved = autoEvolve(data, applied, { rng, day, scene })
      return { monster: evolved.monster, rng: evolved.rng, events: evolved.events }
    }
    case 'evolutionStone': {
      // Tiến hóa theo hướng cần chính đá này (mục Tiến hóa).
      const evolution = stoneEvolution(data, monster, { itemId: item.id, scene })
      if (!evolution) return null
      const result = evolveVia(data, monster, { evolution, rng, day })
      return { monster: result.monster, rng: result.rng, events: result.events }
    }
    case 'ball':
    case 'held':
    case 'equipment':
    case 'traitCrystal':
    case 'fusionAid':
    case 'keyItem':
    case 'megaStone':
    case 'teraShard':
    case 'zCrystal':
    case 'material':
    case 'formationScroll':
    case 'recipeScroll':
    case 'seed':
    case 'skillBook':
    case 'soulCrystal':
    case 'bait':
    case 'dish':
    case 'fishingLure':
    case 'charm':
      return null
    default:
      return assertNever(item, 'vật phẩm')
  }
}
