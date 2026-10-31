// Hiệu ứng skill hỗ trợ (mục "Skill" ở battle.md): chữa trạng thái (một quái / cả đội), xóa bậc
// trận toàn sân (Haze), đổi bậc theo hệ cho mọi quái trên sân (Flower Shield, Rototiller), đếm
// ngược gục (Perish Song), thế thân (Substitute), giảm lượt chờ của hold (Tĩnh Tâm Chú). Gộp vào
// registry SKILL_EFFECTS ở skillEffects.ts.

import { asObject, checkInteger, checkNumber } from '../shared'
import { heldSkills, isGrounded } from '../monster'
import type { BattleStages, GameData, Monster, StatName } from '../model'
import { isBattleStageStat } from './paramChecks'
import { checkElements, hasElement } from './fieldHookUtils'
import { boostedDelta, noChanges, type SkillEffectHandler } from './skillEffectTypes'
import { validateEmptyParams } from './traitHookUtils'

/** Tổng trọng số AI của các trạng thái quái đang dính (giá trị của việc chữa). */
const statusValue = (data: GameData, monster: Monster): number =>
  monster.statuses.reduce((sum, { statusId }) => sum + data.config.ai.statusWeights[statusId], 0)

const ALLY_ONLY = ['chỉ dùng cho skill nhắm phe mình (self / ally / allAllies)']

// ---------- cureStatus: chữa mọi trạng thái của mục tiêu (kiểu Jungle Healing) ----------

const cureStatus: SkillEffectHandler = {
  timing: 'afterHits',
  validateParams: validateEmptyParams,
  checkTarget: (_params, target) =>
    target === 'enemy' || target === 'allEnemies' ? ALLY_ONLY : [],
  apply: (_params, { target, rng }) => ({ ...noChanges(rng), statusCures: [target.id] }),
  aiValue: (_params, { data, target, targetIsAlly }) =>
    targetIsAlly ? statusValue(data, target) : 0
}

// ---------- cureTeamStatus: chữa mọi trạng thái của cả đội, kể cả dự bị (kiểu Heal Bell) ----------

// Luôn chữa đội của quái dùng, kể cả trên skill nhắm địch (Sparkly Swirl: đánh rồi chữa cả đội).
const cureTeamStatus: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams: validateEmptyParams,
  apply: (_params, { team, rng }) => ({
    ...noChanges(rng),
    statusCures: team.filter((monster) => monster.statuses.length > 0).map((m) => m.id)
  }),
  aiValue: (_params, { data, allies, allyReserves }) =>
    [...allies, ...allyReserves].reduce((sum, monster) => sum + statusValue(data, monster), 0)
}

// ---------- resetStages: mọi quái trên sân mất bậc trận (kiểu Haze) ----------

/** Tổng bậc (có dấu) của các quái. */
const stageSum = (
  monsters: readonly Monster[],
  stages: Readonly<Record<string, BattleStages>>
): number =>
  monsters.reduce(
    (sum, monster) =>
      sum + Object.values(stages[monster.id] ?? {}).reduce((total, step) => total + step, 0),
    0
  )

const resetStages: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams: validateEmptyParams,
  apply: (_params, { onField, rng }) => ({
    ...noChanges(rng),
    stageResets: onField.map((monster) => monster.id)
  }),
  // Có lợi khi địch đang được tăng bậc nhiều hơn phe mình.
  aiValue: (_params, { data, stages, allies, foes }) =>
    (stageSum(foes, stages) - stageSum(allies, stages)) * data.config.ai.stageValuePerStep
}

// ---------- consumeHeldItems: mọi quái trên sân ăn ngay đồ cầm có nhãn (kiểu Teatime) ----------

interface ConsumeHeldItemsParams {
  tags?: string[]
}

/** Số quái đang lắp đồ cầm có nhãn khớp (bỏ trống nhãn = mọi đồ cầm). */
function holdingCount(data: GameData, monsters: readonly Monster[], tags?: string[]): number {
  return monsters.filter((monster) =>
    monster.equipment.some((entry) => {
      if (entry.storage !== 'stack') return false
      const item = data.items[entry.itemId]
      return (
        item?.category === 'held' &&
        (tags === undefined || (item.tags ?? []).some((tag) => tags.includes(tag)))
      )
    })
  ).length
}

const consumeHeldItems: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const tags = obj.tags
    if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string'))) {
      return ['tags phải là danh sách chuỗi']
    }
    return []
  },
  apply: (params, { onField, rng }) => {
    const { tags } = params as ConsumeHeldItemsParams
    return {
      ...noChanges(rng),
      heldItemEats: onField.map((monster) => ({ monsterId: monster.id, ...(tags ? { tags } : {}) }))
    }
  },
  // Có lợi khi phe mình đang cầm nhiều món khớp hơn phe địch.
  aiValue: (params, { data, allies, foes }) => {
    const { tags } = params as ConsumeHeldItemsParams
    return (
      (holdingCount(data, allies, tags) - holdingCount(data, foes, tags)) *
      data.config.ai.spellEffectWeight
    )
  }
}

// ---------- fieldStatStage: đổi bậc mọi quái trên sân thuộc hệ (kiểu Flower Shield) ----------

interface FieldStatStageParams {
  stats: Exclude<StatName, 'hp'>[]
  delta: number
  /** Chỉ quái có ít nhất một hệ trong danh sách. */
  elementIds: string[]
  /** Chỉ quái đứng trên mặt đất (kiểu Rototiller). */
  grounded?: true
}

/** Quái được đổi bậc (cả hai phe). */
const affectedByFieldStage = (
  data: GameData,
  params: FieldStatStageParams,
  monsters: readonly Monster[],
  field?: Parameters<typeof isGrounded>[2]
): Monster[] =>
  monsters.filter(
    (monster) =>
      hasElement(monster, params.elementIds) &&
      (params.grounded !== true || isGrounded(data, monster, field))
  )

const fieldStatStage: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkElements(data, obj.elementIds, 'elementIds')
    const stats = obj.stats
    if (
      !Array.isArray(stats) ||
      stats.length === 0 ||
      !stats.every(isBattleStageStat) ||
      new Set(stats).size !== stats.length
    ) {
      issues.push('stats phải là danh sách không lặp các chỉ số khác hp')
    }
    if (!Number.isSafeInteger(obj.delta) || obj.delta === 0) {
      issues.push('delta phải là số nguyên khác 0')
    }
    if (obj.grounded !== undefined && obj.grounded !== true) {
      issues.push('grounded chỉ được là true')
    }
    return issues
  },
  apply(params, { data, onField, field, rng }) {
    const typed = params as FieldStatStageParams
    const stageChanges = affectedByFieldStage(data, typed, onField, field).flatMap((monster) =>
      typed.stats.map((stat) => ({ monsterId: monster.id, stat, delta: typed.delta }))
    )
    return { ...noChanges(rng), stageChanges }
  },
  styled(params, mod) {
    const typed = params as FieldStatStageParams
    // Đổi bậc cả hai phe theo hệ (kiểu Flower Shield): chỉ tăng bậc mới được thêm.
    return { ...typed, delta: boostedDelta(typed.delta, mod.stageBonus, true) }
  },
  aiValue(params, { data, field, allies, foes }) {
    const typed = params as FieldStatStageParams
    const count = (monsters: readonly Monster[]): number =>
      affectedByFieldStage(data, typed, monsters, field).length
    return (
      (count(allies) - count(foes)) *
      typed.stats.length *
      typed.delta *
      data.config.ai.stageValuePerStep
    )
  }
}

// ---------- perishSong: mọi quái trên sân gục sau `turns` lượt (kiểu Perish Song) ----------

const perishSong: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkInteger(obj.turns, 'turns', 1) : ['params phải là object']
  },
  apply(params, { onField, rng }) {
    const { turns } = params as { turns: number }
    return {
      ...noChanges(rng),
      perishStarts: onField.map((monster) => ({ monsterId: monster.id, turns }))
    }
  },
  // Mỗi quái sẽ gục coi như một lần hạ (koBonus): địch chưa đếm (trừ boss hoang) có lợi, quái ta
  // chưa đếm có hại (AI không đổi quái nên quái ta cũng gục).
  aiValue(_params, { data, allies, foes, volatiles = {}, isBoss = false }) {
    const fresh = (monsters: readonly Monster[]): number =>
      monsters.filter((monster) => volatiles[monster.id]?.perishTurns === undefined).length
    const foeCount = isBoss ? 0 : fresh(foes)
    return (foeCount - fresh(allies)) * data.config.ai.koBonus
  }
}

// ---------- reduceHold: giảm lượt chờ của mọi skill đang chờ của mục tiêu (Tĩnh Tâm Chú) ----------

const reduceHold: SkillEffectHandler = {
  timing: 'afterHits',
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkInteger(obj.turns, 'turns', 1) : ['params phải là object']
  },
  checkTarget: (_params, target) =>
    target === 'enemy' || target === 'allEnemies' ? ALLY_ONLY : [],
  apply(params, { target, rng }) {
    const { turns } = params as { turns: number }
    return { ...noChanges(rng), holdReductions: [{ monsterId: target.id, turns }] }
  },
  // Mỗi lượt chờ thực giảm một mức holdTurnWeight; ngoài trận / mục tiêu phe địch: 0.
  aiValue(params, { data, target, targetIsAlly, battleTurn, volatiles = {} }) {
    if (!targetIsAlly || battleTurn === undefined) return 0
    const { turns } = params as { turns: number }
    const held = heldSkills(data, { turn: battleTurn, volatiles }, target)
    const reduced = held.reduce((sum, { turnsLeft }) => sum + Math.min(turnsLeft, turns), 0)
    return reduced * data.config.ai.holdTurnWeight
  }
}

// ---------- substitute: tạo thế thân bằng % max HP của mình (kiểu Substitute) ----------

const substitute: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params) {
    const obj = asObject(params)
    return obj
      ? checkNumber(obj.hpCostPercent, 'hpCostPercent', Number.MIN_VALUE, 100)
      : ['params phải là object']
  },
  checkTarget: (_params, target) => (target === 'self' ? [] : ['chỉ dùng cho skill nhắm self']),
  apply(params, { rng }) {
    const { hpCostPercent } = params as { hpCostPercent: number }
    return { ...noChanges(rng), substitute: { hpCostPercent } }
  },
  // Thế thân đổi máu lấy việc chặn đòn / hiệu ứng: AI chưa chấm được (như rút về), chỉ dùng khi
  // không có lựa chọn nào có điểm.
  aiValue: () => 0
}

export const SUPPORT_SKILL_EFFECTS: Readonly<Record<string, SkillEffectHandler>> = {
  consumeHeldItems,
  cureStatus,
  cureTeamStatus,
  resetStages,
  fieldStatStage,
  perishSong,
  substitute,
  reduceHold
}
