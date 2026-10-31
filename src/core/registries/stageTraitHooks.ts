// Hook trait bậc trận (mục "Trait" ở stats-traits.md, "Bậc trận" ở battle.md): đổi bậc khi vào sân
// (kiểu Intimidate), cuối lượt (Speed Boost), khi hạ gục địch (Moxie), khi bị địch hạ bậc
// (Defiant); miễn bị hạ bậc (Clear Body); % chỉ số theo số địch đã hạ. Cùng quy ước với
// traitHooks.ts. Số bậc không đổi theo cấp trait; chỉ % chỉ số nhân hệ số cấp.

import { asObject } from '../shared'
import type { PartialStats, StageStat, StatName } from '../model'
import { checkStageChange, isBattleStageStat } from './paramChecks'
import type { TraitHookHandler } from './traitHooks'
import { checkConditionalPercent, scaleStats } from './traitHookUtils'

/** Lúc hook đổi bậc chạy. */
export type StageTraitEvent = 'entry' | 'turnEnd' | 'knockout' | 'statLowered'

export const STAGE_TRAIT_TARGETS = ['self', 'allEnemies'] as const
/** Quái bị đổi bậc: chính quái mang trait, hoặc mọi địch còn sống trên sân. */
export type StageTraitTarget = (typeof STAGE_TRAIT_TARGETS)[number]

export interface StageTraitEffect {
  target: StageTraitTarget
  stat: Exclude<StatName, 'hp'>
  stages: number
}

// ---------- stageOnEntry: đổi bậc khi vào sân (kiểu Intimidate) ----------

const stageOnEntry: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkStageChange(obj.stat, obj.stages, 'stages')
    if (!(STAGE_TRAIT_TARGETS as readonly unknown[]).includes(obj.target)) {
      issues.push(`target phải là một trong: ${STAGE_TRAIT_TARGETS.join(', ')}`)
    }
    return issues
  },
  stageOnEvent: (params, event) => (event === 'entry' ? (params as StageTraitEffect) : null)
}

// ---------- stageOnTurnEnd / stageOnKnockout / stageOnStatLowered: tự đổi bậc mình ----------

/** Hook `{ stat, stages }` đổi bậc chính quái mang trait khi `event` xảy ra. */
function selfStageOn(event: StageTraitEvent): TraitHookHandler {
  return {
    validateParams(params) {
      const obj = asObject(params)
      return obj ? checkStageChange(obj.stat, obj.stages, 'stages') : ['params phải là object']
    },
    stageOnEvent(params, happened) {
      if (happened !== event) return null
      const { stat, stages } = params as Omit<StageTraitEffect, 'target'>
      return { target: 'self', stat, stages }
    }
  }
}

// ---------- statLowerImmunity: quái khác không hạ bậc được (kiểu Clear Body) ----------

const statLowerImmunity: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    if (obj.stats === 'all') return []
    const stats = obj.stats
    if (
      !Array.isArray(stats) ||
      stats.length === 0 ||
      !stats.every(isBattleStageStat) ||
      new Set(stats).size !== stats.length
    ) {
      return ['stats phải là "all" hoặc danh sách không rỗng, không lặp các chỉ số có bậc trận']
    }
    return []
  },
  blocksStatLower(params, stat) {
    const { stats } = params as { stats: 'all' | readonly StageStat[] }
    return stats === 'all' || stats.includes(stat)
  }
}

// ---------- statModifierAfterKnockout: % chỉ số × số địch đã hạ trong lần ra sân này ----------

const statModifierAfterKnockout: TraitHookHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkConditionalPercent(obj.percent) : ['params phải là object']
  },
  modifyStats(params, scale, { battle }) {
    const knockouts = battle?.knockouts ?? 0
    const percent: PartialStats = knockouts
      ? scaleStats((params as { percent: PartialStats }).percent, scale * knockouts)
      : {}
    return { flat: {}, percent }
  }
}

export const STAGE_TRAIT_HOOKS: Readonly<Record<string, TraitHookHandler>> = {
  stageOnEntry,
  stageOnTurnEnd: selfStageOn('turnEnd'),
  stageOnKnockout: selfStageOn('knockout'),
  stageOnStatLowered: selfStageOn('statLowered'),
  statLowerImmunity,
  statModifierAfterKnockout
}
