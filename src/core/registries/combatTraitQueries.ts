// Tra cứu tổng hợp hook trait của công thức sát thương, chí mạng và trúng đòn (combatTraitHooks.ts,
// passiveTraitHooks.ts). Mọi phần trăm từ nhiều trait cộng với nhau rồi mới áp (như luật áp trait);
// tỉ lệ "độc lập" của trait Siralim (né, chí mạng thêm) tung gộp: 1 − Π(1 − p).

import type { GameData, Monster, MonsterBattleContext, Skill } from '../model'
import { forEachTraitHook, hasTraitFlag, type TraitHookHandler } from './traitHooks'
import type { DslView } from './traitConditions'
import { percentToMultiplier } from './traitHookUtils'

/** Hai bên của một đòn kèm bối cảnh trận (bỏ trống = ngoài trận). */
export interface StrikeView {
  data: GameData
  attacker: Monster
  defender: Monster
  attackerCtx?: MonsterBattleContext
  defenderCtx?: MonsterBattleContext
  skill: Skill
  /** Đòn do trait / minion gây ra (không phải lượt của quái đánh). */
  reactive?: boolean
}

/** Góc nhìn điều kiện từ phía bên đánh (self = bên đánh). */
export const attackerView = (s: StrikeView): DslView => ({
  data: s.data,
  self: s.attacker,
  selfCtx: s.attackerCtx,
  attacker: s.attacker,
  attackerCtx: s.attackerCtx,
  target: s.defender,
  targetCtx: s.defenderCtx,
  other: s.defender,
  otherCtx: s.defenderCtx,
  skill: s.skill,
  reactive: s.reactive
})

/** Góc nhìn điều kiện từ phía bên nhận (self = bên nhận). */
export const defenderView = (s: StrikeView): DslView => ({
  data: s.data,
  self: s.defender,
  selfCtx: s.defenderCtx,
  attacker: s.attacker,
  attackerCtx: s.attackerCtx,
  target: s.defender,
  targetCtx: s.defenderCtx,
  other: s.attacker,
  otherCtx: s.attackerCtx,
  skill: s.skill,
  reactive: s.reactive
})

/** Tổng % của một pha số trên mọi hook có tác dụng lên quái (đã nhân hệ số). */
export function sumTraitPercent(
  data: GameData,
  monster: Monster,
  read: (handler: TraitHookHandler, params: unknown, scale: number) => number | undefined,
  ctx?: MonsterBattleContext
): number {
  let total = 0
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale) => {
      total += read(handler, params, scale) ?? 0
    },
    ctx
  )
  return total
}

/** Gộp các tỉ lệ độc lập (%): 1 − Π(1 − p), kẹp [0, 100]. */
export function combineIndependent(chances: readonly number[]): number {
  const miss = chances.reduce((product, chance) => product * (1 - clampPercent(chance) / 100), 1)
  return clampPercent((1 - miss) * 100)
}

/** Các tỉ lệ độc lập (khác 0) của một pha trên mọi hook có tác dụng lên quái. */
function independentChances(
  data: GameData,
  monster: Monster,
  read: (handler: TraitHookHandler, params: unknown, scale: number) => number | undefined,
  ctx?: MonsterBattleContext
): number[] {
  const chances: number[] = []
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale) => {
      const chance = read(handler, params, scale) ?? 0
      if (chance > 0) chances.push(chance)
    },
    ctx
  )
  return chances
}

const clampPercent = (percent: number): number => Math.min(100, Math.max(0, percent))

/** % thủ của mục tiêu mà quái đánh bỏ qua, kẹp [0, 100]. */
export function traitDefenseIgnoredPercent(s: StrikeView): number {
  const view = attackerView(s)
  return clampPercent(
    sumTraitPercent(
      s.data,
      s.attacker,
      (handler, params, scale) =>
        (handler.defenseIgnoredPercent?.(params, scale) ?? 0) +
        (handler.contextDefenseIgnoredPercent?.(params, scale, view) ?? 0),
      s.attackerCtx
    )
  )
}

/** Hệ số STAB của quái: lớn nhất giữa STAB chung và mọi trait stabMultiplier (không cộng dồn). */
export function traitStabMultiplier(
  data: GameData,
  attacker: Monster,
  base: number,
  ctx?: MonsterBattleContext
): number {
  let best = base
  forEachTraitHook(
    data,
    attacker,
    (handler, params, scale) => {
      const value = handler.stabMultiplier?.(params, scale)
      if (value !== undefined) best = Math.max(best, value)
    },
    ctx
  )
  return best
}

/** Tổng bậc chí mạng trait của bên đánh cộng thêm (hook critStage). */
export function traitCritStages(s: StrikeView): number {
  let stages = 0
  forEachTraitHook(
    s.data,
    s.attacker,
    (handler, params) => {
      stages += handler.critStages?.(params) ?? 0
    },
    s.attackerCtx
  )
  return stages
}

/**
 * Tỉ lệ chí mạng (%) sau trait: bên nhận miễn chí mạng hoặc bên đánh không gây được chí mạng thì 0;
 * bên đánh luôn chí mạng thì 100; không thì tỉ lệ chung × (1 + % trait), gộp độc lập với tỉ lệ
 * chí mạng thêm (kiểu Savage); kẹp tối đa 100.
 */
export function traitCritChance(s: StrikeView, base: number): number {
  const { data, attacker, defender, attackerCtx, defenderCtx } = s
  if (
    hasTraitFlag(data, defender, (handler, params) => handler.blocksCritical?.(params), defenderCtx)
  ) {
    return 0
  }
  const view = attackerView(s)
  if (
    hasTraitFlag(
      data,
      attacker,
      (handler, params) => handler.preventsOwnCritical?.(params, view),
      attackerCtx
    )
  ) {
    return 0
  }
  if (
    hasTraitFlag(
      data,
      attacker,
      (handler, params) => handler.guaranteesCritical?.(params, view),
      attackerCtx
    )
  ) {
    return 100
  }
  const percent = sumTraitPercent(
    data,
    attacker,
    (handler, params, scale) => handler.critChancePercent?.(params, scale),
    attackerCtx
  )
  const bonus = independentChances(
    data,
    attacker,
    (handler, params, scale) => handler.bonusCritChance?.(params, scale, view),
    attackerCtx
  )
  return combineIndependent([Math.min(100, base * percentToMultiplier(percent)), ...bonus])
}

/** Hệ số chí mạng sau trait của bên đánh. */
export function traitCritMultiplier(s: StrikeView, base: number): number {
  const view = attackerView(s)
  const percent = sumTraitPercent(
    s.data,
    s.attacker,
    (handler, params, scale) =>
      (handler.critDamagePercent?.(params, scale) ?? 0) +
      (handler.contextCritDamagePercent?.(params, scale, view) ?? 0),
    s.attackerCtx
  )
  return base * percentToMultiplier(percent)
}

/**
 * Hệ số accuracy từ trait: (1 + % accuracy của người đánh, kể cả hào quang của địch đặt lên nó) ×
 * (1 − % né của mục tiêu, kẹp [0, 100]). Mỗi thừa số không xuống dưới 0. Không có mục tiêu thì
 * không tính né.
 */
export function traitAccuracyFactor(
  data: GameData,
  {
    user,
    target,
    userCtx,
    targetCtx
  }: {
    user: Monster
    target?: Monster
    userCtx?: MonsterBattleContext
    targetCtx?: MonsterBattleContext
  }
): number {
  const percent = sumTraitPercent(
    data,
    user,
    (handler, params, scale) => handler.accuracyPercent?.(params, scale),
    userCtx
  )
  const accuracy = percentToMultiplier(percent)
  if (!target) return accuracy
  const evasion = clampPercent(
    sumTraitPercent(
      data,
      target,
      (handler, params, scale) => handler.evasionPercent?.(params, scale),
      targetCtx
    )
  )
  return accuracy * (1 - evasion / 100)
}

/**
 * Tỉ lệ (%) bên nhận né độc lập sau khi đã trúng accuracy (trait / buff kiểu Agile của Siralim):
 * 0 khi bên nhận không né được (kiểu Stone) hoặc đòn không thể né (trait của bên đánh).
 */
export function traitDodgeChance(s: StrikeView): number {
  const { data, attacker, defender, attackerCtx, defenderCtx } = s
  if (
    hasTraitFlag(
      data,
      defender,
      (handler, params) => handler.preventsDodge?.(params, defenderView(s)),
      defenderCtx
    )
  ) {
    return 0
  }
  const aView = attackerView(s)
  if (
    hasTraitFlag(
      data,
      attacker,
      (handler, params) => handler.ignoresDodge?.(params, aView),
      attackerCtx
    )
  ) {
    return 0
  }
  const view = defenderView(s)
  return combineIndependent(
    independentChances(
      data,
      defender,
      (handler, params, scale) => handler.dodgeChance?.(params, scale, view),
      defenderCtx
    )
  )
}

/** Tỉ lệ (%) bỏ qua hoàn toàn một lần mất máu của quái (view: self = quái nhận), gộp độc lập. */
export function traitNegateChance(view: DslView): number {
  return combineIndependent(
    independentChances(
      view.data,
      view.self,
      (handler, params, scale) => handler.negateDamageChance?.(params, scale, view),
      view.selfCtx
    )
  )
}
