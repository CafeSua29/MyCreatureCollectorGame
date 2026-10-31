// Registry hiệu ứng skill. Thêm hiệu ứng mới = thêm handler vào SKILL_EFFECTS,
// rồi khai báo { type, params } trong skills.json.
//
// Handler không sửa state: nó trả về mô tả thay đổi, battle/executeSkill.ts áp vào trận.
// Hiệu ứng chạy cho mỗi mục tiêu bị trúng, sau phần sát thương (nếu có). `timing` của handler
// quyết định chạy sau từng đòn, một lần sau đòn cuối, hay một lần cho cả chiêu (mọi mục tiêu).
// Mỗi handler tự chấm giá trị của mình cho AI trận đấu (`aiValue`), nên thêm hiệu ứng mới không
// phải sửa AI. Kiểu dùng chung ở skillEffectTypes.ts, hiệu ứng đặt môi trường ở fieldSkillEffects.ts.

import {
  asObject,
  checkEnumList,
  checkInteger,
  checkNumber,
  minBig,
  pick,
  rollPercent
} from '../shared'
import { getMaxHp, isFainted, percentOfMaxHp } from '../monster'
import type { GameData, Monster, Skill, SkillTarget, StageStat } from '../model'
import { isBattleStageStat } from './paramChecks'
import { statLowerBlockingField } from './fieldQueries'
import { stageTraitEffects, statLowerBlockingTrait } from './stageTraitQueries'
import { FIELD_SKILL_EFFECTS } from './fieldSkillEffects'
import { SUPPORT_SKILL_EFFECTS } from './supportSkillEffects'
import { TRANSFORM_SKILL_EFFECTS } from './transformSkillEffects'
import { SIDE_SKILL_EFFECTS } from './sideSkillEffects'
import { statusAiValue } from './statusAiValue'

export { statusAiValue }
import {
  boostedDelta,
  effectChance,
  shiftedChance,
  noChanges,
  otherSide,
  type PassOn,
  type SkillEffectHandler
} from './skillEffectTypes'

/** Mục tiêu nhắm phe mình (hiệu ứng lên `target` là quái ta). */
export const ALLY_TARGETS: readonly SkillTarget[] = ['self', 'ally', 'allAllies']

// ---------- statStage: tăng / giảm bậc chỉ số ----------

/** Tổng bậc quái tự đổi khi bị phe địch hạ bậc (trait stageOnStatLowered lên chính nó). */
const defiantSteps = (data: GameData, monster: Monster): number =>
  stageTraitEffects(data, monster, 'statLowered').reduce(
    (sum, { effect }) => sum + (effect.target === 'self' ? effect.stages : 0),
    0
  )

interface StatStageParams {
  who: 'self' | 'target'
  stat: StageStat
  delta: number
  /** %; bỏ trống = 100. */
  chance?: number
}

const statStage: SkillEffectHandler = {
  // Đổi bậc một lần cho cả chiêu, kể cả chiêu đánh nhiều lần.
  timing: 'afterHits',
  userOnly: (params) => (params as StatStageParams).who === 'self',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues: string[] = []
    if (obj.who !== 'self' && obj.who !== 'target') issues.push('who phải là "self" hoặc "target"')
    if (!isBattleStageStat(obj.stat)) {
      issues.push('stat phải là chỉ số có bậc trận')
    }
    if (!Number.isSafeInteger(obj.delta) || obj.delta === 0) {
      issues.push('delta phải là số nguyên khác 0')
    }
    if (obj.chance !== undefined) issues.push(...checkNumber(obj.chance, 'chance', 0))
    return issues
  },
  apply(params, { user, target, rng, chanceMultiplier }) {
    const { who, stat, delta, chance } = params as StatStageParams
    const [hit, next] = rollPercent(rng, effectChance(chance, chanceMultiplier))
    const monsterId = who === 'self' ? user.id : target.id
    return { ...noChanges(next), stageChanges: hit ? [{ monsterId, stat, delta }] : [] }
  },
  styled(params, mod) {
    const typed = params as StatStageParams
    const chance = shiftedChance(typed.chance, mod.chanceShift)
    return {
      ...typed,
      delta: boostedDelta(typed.delta, mod.stageBonus, typed.who === 'self' || mod.targetsAlly),
      ...(chance === undefined ? {} : { chance })
    }
  },
  aiValue(params, { data, user, target, targetIsAlly, stages, field, side, chanceMultiplier }) {
    const { who, stat, delta, chance } = params as StatStageParams
    const affected = who === 'self' ? user : target
    const isAlly = who === 'self' || targetIsAlly
    // Hiệu ứng theo phe (Mist) chặn quái khác hạ bậc: vô ích.
    const affectedSide = isAlly ? side : otherSide(side)
    const lowersOther = delta < 0 && affected.id !== user.id
    if (lowersOther && statLowerBlockingField(data, field, affectedSide)) return 0
    // Trait miễn hạ bậc (kiểu Clear Body) cũng làm hiệu ứng vô ích.
    if (lowersOther && statLowerBlockingTrait(data, affected, stat) !== null) return 0
    // Chỉ tính số bậc thực đổi được: đã chạm giới hạn thì hiệu ứng vô ích.
    const { min, max } = data.config.battleStage
    const current = stages[affected.id]?.[stat] ?? 0
    const steps = Math.min(max, Math.max(min, current + delta)) - current
    const odds = effectChance(chance, chanceMultiplier) / 100
    const value = steps * data.config.ai.stageValuePerStep * odds
    if (isAlly) return value
    // Hạ bậc địch có trait kiểu Defiant: trừ phần bậc địch tự tăng lại.
    const backfire = steps < 0 ? defiantSteps(data, affected) : 0
    return -value - backfire * data.config.ai.stageValuePerStep * odds
  }
}

// ---------- drain: hồi máu theo % sát thương đã gây ----------

const drain: SkillEffectHandler = {
  timing: 'perHit',
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkNumber(obj.percent, 'percent', 0) : ['params phải là object']
  },
  apply(params, { user, target, damageDealt, rng }) {
    const amount = damageDealt.times((params as { percent: number }).percent).div(100)
    return {
      ...noChanges(rng),
      heals: amount.gt(0) ? [{ monsterId: user.id, amount, drainedFrom: target.id }] : []
    }
  },
  aiValue(params, { data, user, expectedDamage }) {
    // Chỉ máu đã mất mới hồi được; tính theo tỉ lệ max HP để không phụ thuộc độ lớn chỉ số.
    const amount = expectedDamage.times((params as { percent: number }).percent).div(100)
    const healed = minBig(amount, user.damageTaken)
    return healed.div(getMaxHp(data, user)).toNumber() * data.config.ai.healWeight
  }
}

// ---------- heal: hồi % max HP của quái được hồi ----------

interface HealParams {
  /** % max HP của quái được hồi, > 0 và ≤ 100. */
  percent: number
  /** Bỏ trống = self. target chỉ cho skill nhắm phe mình (không hồi máu cho địch). */
  who?: 'self' | 'target'
}

const healedMonster = (params: unknown, user: Monster, target: Monster): Monster =>
  (params as HealParams).who === 'target' ? target : user

const heal: SkillEffectHandler = {
  // Hồi một lần cho cả chiêu, sau đòn cuối (mục "Skill" ở battle.md).
  timing: 'afterHits',
  userOnly: (params) => (params as HealParams).who !== 'target',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100)
    if (obj.who !== undefined && obj.who !== 'self' && obj.who !== 'target') {
      issues.push('who phải là "self" hoặc "target"')
    }
    return issues
  },
  checkTarget(params, target) {
    const who = asObject(params)?.who
    return who === 'target' && !ALLY_TARGETS.includes(target)
      ? ['who "target" chỉ dùng cho skill nhắm phe mình (self / ally / allAllies)']
      : []
  },
  // Lượng hồi theo max HP; làm tròn, kẹp max HP, bỏ quái gục, hệ số môi trường do trận đấu xử lý
  // (hàm heal dùng chung của battle/draft.ts).
  apply(params, { data, user, target, rng }) {
    const monster = healedMonster(params, user, target)
    const amount = percentOfMaxHp(getMaxHp(data, monster), (params as HealParams).percent)
    return { ...noChanges(rng), heals: [{ monsterId: monster.id, amount }] }
  },
  aiValue(params, { data, user, target }) {
    // Cùng công thức với drain: chỉ máu đã mất mới hồi được, tính theo tỉ lệ max HP.
    const monster = healedMonster(params, user, target)
    const maxHp = getMaxHp(data, monster)
    if (isFainted(data, monster)) return 0
    const healed = minBig(
      percentOfMaxHp(maxHp, (params as HealParams).percent),
      monster.damageTaken
    )
    return healed.div(maxHp).toNumber() * data.config.ai.healWeight
  }
}

// ---------- applyStatus: gây trạng thái bất thường lên mục tiêu ----------

interface ApplyStatusParams {
  statusId: string
  /** %; bỏ trống = 100. */
  chance?: number
  /** Số lượt cố định thay thời hạn của trạng thái (Psychic Noise: 2). */
  turns?: number
}

const applyStatus: SkillEffectHandler = {
  // Gây một lần cho cả chiêu, kể cả chiêu đánh nhiều lần.
  timing: 'afterHits',
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues: string[] = []
    if (typeof obj.statusId !== 'string' || !(obj.statusId in data.statuses)) {
      issues.push(`trạng thái không tồn tại "${String(obj.statusId)}"`)
    }
    if (obj.chance !== undefined) issues.push(...checkNumber(obj.chance, 'chance', 0, 100))
    if (obj.turns !== undefined) issues.push(...checkInteger(obj.turns, 'turns', 1))
    return issues
  },
  apply(params, { target, rng, chanceMultiplier }) {
    const { statusId, chance, turns } = params as ApplyStatusParams
    const [hit, next] = rollPercent(rng, effectChance(chance, chanceMultiplier))
    return {
      ...noChanges(next),
      statusChanges: hit ? [{ monsterId: target.id, statusId, ...(turns ? { turns } : {}) }] : []
    }
  },
  styled(params, mod) {
    const typed = params as ApplyStatusParams
    const chance = shiftedChance(typed.chance, mod.chanceShift)
    return chance === undefined ? typed : { ...typed, chance }
  },
  aiValue(params, { data, target, targetIsAlly, field, side, chanceMultiplier }) {
    const { statusId, chance } = params as ApplyStatusParams
    if (targetIsAlly) return 0
    const value = statusAiValue(data, field, { monster: target, side: otherSide(side) }, statusId)
    return value * (effectChance(chance, chanceMultiplier) / 100)
  }
}

// ---------- applyRandomStatus: gây một trạng thái ngẫu nhiên trong danh sách (Tri Attack) ----------

interface ApplyRandomStatusParams {
  statusIds: string[]
  chance?: number
}

const applyRandomStatus: SkillEffectHandler = {
  timing: 'afterHits',
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkEnumList(obj.statusIds, 'statusIds', Object.keys(data.statuses))
    if (obj.chance !== undefined) issues.push(...checkNumber(obj.chance, 'chance', 0, 100))
    return issues
  },
  // Như Pokémon: tung tỉ lệ một lần, trúng thì chọn đều một trạng thái.
  apply(params, { target, rng, chanceMultiplier }) {
    const { statusIds, chance } = params as ApplyRandomStatusParams
    const [hit, afterRoll] = rollPercent(rng, effectChance(chance, chanceMultiplier))
    if (!hit) return noChanges(afterRoll)
    const [statusId, next] = pick(afterRoll, statusIds)
    return { ...noChanges(next), statusChanges: [{ monsterId: target.id, statusId }] }
  },
  styled(params, mod) {
    const typed = params as ApplyRandomStatusParams
    const chance = shiftedChance(typed.chance, mod.chanceShift)
    return chance === undefined ? typed : { ...typed, chance }
  },
  aiValue(params, { data, target, targetIsAlly, field, side, chanceMultiplier }) {
    const { statusIds, chance } = params as ApplyRandomStatusParams
    if (targetIsAlly) return 0
    const monster = { monster: target, side: otherSide(side) }
    const average =
      statusIds.reduce((sum, id) => sum + statusAiValue(data, field, monster, id), 0) /
      statusIds.length
    return average * (effectChance(chance, chanceMultiplier) / 100)
  }
}

// ---------- forceSwitch: ép mục tiêu rời sân (Roar, Whirlwind, Dragon Tail, Circle Throw) ----------

/** Hiệu ứng không có params. */
const validateNoParams = (params: unknown): string[] => {
  const obj = asObject(params)
  return obj && Object.keys(obj).length === 0 ? [] : ['hiệu ứng này không có params']
}

const forceSwitch: SkillEffectHandler = {
  // Sau đòn (Dragon Tail đánh rồi mới đẩy), một lần cho mỗi mục tiêu.
  timing: 'afterHits',
  validateParams: validateNoParams,
  apply(_params, { target, rng }) {
    return { ...noChanges(rng), forceSwitches: [target.id] }
  },
  // Đẩy địch ra phá thế trận và bỏ bậc trận của nó: điểm nhỏ cố định theo trọng số môi trường.
  // Không có quái dự bị vào thay (quái hoang: bỏ chạy, mất thưởng) hoặc boss (không bị đẩy): 0.
  aiValue: (_params, { data, targetIsAlly, foeReserves, isBoss }) =>
    targetIsAlly || isBoss === true || foeReserves.length === 0 ? 0 : data.config.ai.fieldWeight
}

// ---------- switchOut: quái dùng skill rút về, quái dự bị vào thay (kiểu U-turn) ----------

const PASS_ONS: readonly PassOn[] = ['all', 'substitute']

const switchOut: SkillEffectHandler = {
  // Một lần cho cả chiêu, sau mọi hiệu ứng khác; chỉ khi trúng ít nhất một mục tiêu.
  timing: 'perSkill',
  switchesUserOut: true,
  // passOn: truyền trạng thái tạm cho quái vào thay (all: bậc trận, thế thân, Perish Song như
  // Baton Pass; substitute: chỉ thế thân như Shed Tail); bỏ trống = không truyền (U-turn).
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = Object.keys(obj).some((key) => key !== 'passOn')
      ? ['hook này chỉ có tham số passOn']
      : []
    if (obj.passOn !== undefined && !(PASS_ONS as readonly unknown[]).includes(obj.passOn)) {
      issues.push('passOn phải là "all" hoặc "substitute"')
    }
    return issues
  },
  apply(params, { rng }) {
    const { passOn } = params as { passOn?: PassOn }
    return { ...noChanges(rng), switchOut: passOn === undefined ? {} : { passOn } }
  },
  // AI không đổi quái (mục "AI trận đấu"): rút về không cộng điểm, chỉ phần sát thương / hiệu ứng khác.
  aiValue: () => 0
}

// ---------- Registry ----------

export const SKILL_EFFECTS: Readonly<Record<string, SkillEffectHandler>> = {
  statStage,
  drain,
  heal,
  applyStatus,
  applyRandomStatus,
  forceSwitch,
  ...FIELD_SKILL_EFFECTS,
  ...SUPPORT_SKILL_EFFECTS,
  ...TRANSFORM_SKILL_EFFECTS,
  ...SIDE_SKILL_EFFECTS,
  switchOut
}

/** Skill có hiệu ứng làm quái dùng nó rút về (lệnh skill được kèm `switchTo`). */
export const skillSwitchesUserOut = (skill: Skill): boolean =>
  skill.effects.some((effect) => SKILL_EFFECTS[effect.type].switchesUserOut === true)
