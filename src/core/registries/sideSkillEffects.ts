// Hiệu ứng skill lên cả một phe trên sân (mục "Skill" ở battle.md), dùng được trên mọi skill kể cả
// chiêu tấn công (chiêu Max / G-Max): đổi bậc, hồi máu, chữa trạng thái, gây trạng thái. Phe tính
// từ quái dùng: ally = quái dùng + đồng đội còn sống trên sân, foe = mọi quái địch còn sống trên
// sân. Chạy một lần cho cả chiêu (perSkill), khi trúng ít nhất một mục tiêu. Gộp vào SKILL_EFFECTS.

import { asObject, checkNumber, minBig, pick, rollPercent } from '../shared'
import { getMaxHp, isFainted, percentOfMaxHp } from '../monster'
import type { Monster, StatName } from '../model'
import { isBattleStageStat } from './paramChecks'
import {
  boostedDelta,
  effectChance,
  shiftedChance,
  noChanges,
  otherSide,
  type SkillEffectAiContext,
  type SkillEffectHandler
} from './skillEffectTypes'
import { statusAiValue } from './statusAiValue'

type Side = 'ally' | 'foe'

const SIDES: readonly string[] = ['ally', 'foe']

/** Quái trên sân thuộc phe: phe mình là quái trong đội của quái dùng (team). */
function sideMonsters(
  side: Side,
  onField: readonly Monster[],
  team: readonly Monster[]
): Monster[] {
  const inTeam = (monster: Monster): boolean => team.some((member) => member.id === monster.id)
  return onField.filter((monster) => (side === 'ally' ? inTeam(monster) : !inTeam(monster)))
}

/** Quái trên sân của phe theo góc nhìn AI. */
const aiSideMonsters = (side: Side, ctx: SkillEffectAiContext): readonly Monster[] =>
  side === 'ally' ? ctx.allies : ctx.foes

/** side hợp lệ; `allyOnly`: hiệu ứng có lợi (hồi máu, chữa) chỉ cho phe mình. */
function checkSide(value: unknown, allyOnly: boolean): string[] {
  if (allyOnly) return value === 'ally' ? [] : ['side chỉ được là "ally"']
  return SIDES.includes(String(value)) ? [] : ['side phải là "ally" hoặc "foe"']
}

// ---------- sideStatStage: đổi bậc cả phe (chiêu Max) ----------

interface SideStatStageParams {
  side: Side
  stats: Exclude<StatName, 'hp'>[]
  delta: number
}

const sideStatStage: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkSide(obj.side, false)
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
    return issues
  },
  apply(params, { onField, team, rng }) {
    const { side, stats, delta } = params as SideStatStageParams
    const stageChanges = sideMonsters(side, onField, team).flatMap((monster) =>
      stats.map((stat) => ({ monsterId: monster.id, stat, delta }))
    )
    return { ...noChanges(rng), stageChanges }
  },
  styled(params, mod) {
    const typed = params as SideStatStageParams
    return { ...typed, delta: boostedDelta(typed.delta, mod.stageBonus, typed.side === 'ally') }
  },
  aiValue(params, ctx) {
    const { side, stats, delta } = params as SideStatStageParams
    const count = side === 'ally' ? ctx.allies.length : -ctx.foes.length
    return count * stats.length * delta * ctx.data.config.ai.stageValuePerStep
  }
}

// ---------- sideHeal: hồi % max HP cả phe mình (kiểu G-Max Finale) ----------

interface SideHealParams {
  side: 'ally'
  /** % max HP của từng quái được hồi, > 0 và ≤ 100. */
  percent: number
}

const sideHeal: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [
      ...checkSide(obj.side, true),
      ...checkNumber(obj.percent, 'percent', Number.MIN_VALUE, 100)
    ]
  },
  // Lượng theo max HP từng quái; kẹp, bỏ quái gục, hệ số môi trường do trận đấu xử lý (heal).
  apply(params, { data, onField, team, rng }) {
    const { side, percent } = params as SideHealParams
    const heals = sideMonsters(side, onField, team).map((monster) => ({
      monsterId: monster.id,
      amount: percentOfMaxHp(getMaxHp(data, monster), percent)
    }))
    return { ...noChanges(rng), heals }
  },
  aiValue(params, ctx) {
    const { side, percent } = params as SideHealParams
    const { data } = ctx
    return aiSideMonsters(side, ctx).reduce((sum, monster) => {
      if (isFainted(data, monster)) return sum
      const maxHp = getMaxHp(data, monster)
      const healed = minBig(percentOfMaxHp(maxHp, percent), monster.damageTaken)
      return sum + healed.div(maxHp).toNumber() * data.config.ai.healWeight
    }, 0)
  }
}

// ---------- sideCureStatus: chữa mọi trạng thái cả phe mình trên sân (kiểu G-Max Sweetness) ----------

const statusValue = (ctx: SkillEffectAiContext, monster: Monster): number =>
  monster.statuses.reduce(
    (sum, { statusId }) => sum + ctx.data.config.ai.statusWeights[statusId],
    0
  )

const sideCureStatus: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkSide(obj.side, true) : ['params phải là object']
  },
  apply(params, { onField, team, rng }) {
    const { side } = params as { side: 'ally' }
    const statusCures = sideMonsters(side, onField, team)
      .filter((monster) => monster.statuses.length > 0)
      .map((monster) => monster.id)
    return { ...noChanges(rng), statusCures }
  },
  aiValue(params, ctx) {
    const { side } = params as { side: 'ally' }
    return aiSideMonsters(side, ctx).reduce((sum, monster) => sum + statusValue(ctx, monster), 0)
  }
}

// ---------- sideApplyStatus: gây trạng thái lên cả phe (kiểu G-Max Volt Crash, Befuddle) ----------

interface SideApplyStatusParams {
  side: Side
  /** Mỗi quái tung đều một trạng thái trong danh sách (Befuddle: độc / tê liệt / ngủ). */
  statusIds: string[]
  /** %; bỏ trống = 100. */
  chance?: number
}

const sideApplyStatus: SkillEffectHandler = {
  timing: 'perSkill',
  validateParams(params, data) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkSide(obj.side, false)
    const ids = obj.statusIds
    if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) {
      issues.push('statusIds phải là danh sách không lặp, không rỗng')
    } else {
      for (const id of ids) {
        if (typeof id !== 'string' || !(id in data.statuses)) {
          issues.push(`trạng thái không tồn tại "${String(id)}"`)
        }
      }
    }
    if (obj.chance !== undefined) issues.push(...checkNumber(obj.chance, 'chance', 0, 100))
    return issues
  },
  apply(params, { onField, team, rng, chanceMultiplier }) {
    const { side, statusIds, chance } = params as SideApplyStatusParams
    let next = rng
    const statusChanges: { monsterId: string; statusId: string }[] = []
    for (const monster of sideMonsters(side, onField, team)) {
      let hit: boolean
      ;[hit, next] = rollPercent(next, effectChance(chance, chanceMultiplier))
      if (!hit) continue
      let statusId = statusIds[0]
      if (statusIds.length > 1) [statusId, next] = pick(next, statusIds)
      statusChanges.push({ monsterId: monster.id, statusId })
    }
    return { ...noChanges(next), statusChanges }
  },
  styled(params, mod) {
    const typed = params as SideApplyStatusParams
    const chance = shiftedChance(typed.chance, mod.chanceShift)
    return chance === undefined ? typed : { ...typed, chance }
  },
  aiValue(params, ctx) {
    const { side, statusIds, chance } = params as SideApplyStatusParams
    const odds = effectChance(chance, ctx.chanceMultiplier) / 100
    const monsterSide = side === 'ally' ? ctx.side : otherSide(ctx.side)
    const value = aiSideMonsters(side, ctx).reduce((sum, monster) => {
      const average =
        statusIds.reduce(
          (total, statusId) =>
            total + statusAiValue(ctx.data, ctx.field, { monster, side: monsterSide }, statusId),
          0
        ) / statusIds.length
      return sum + average * odds
    }, 0)
    return side === 'ally' ? -value : value
  }
}

export const SIDE_SKILL_EFFECTS: Readonly<Record<string, SkillEffectHandler>> = {
  sideStatStage,
  sideHeal,
  sideCureStatus,
  sideApplyStatus
}
