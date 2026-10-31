// Tra cứu hook trait lượt và hành động (actionTraitHooks.ts) trên một quái. Dùng cho thứ tự hành
// động (battle/turn.ts), guard theo priority (Quick Guard) và mất lượt / skill ngẫu nhiên
// (battle/actionTraits.ts), chạy trốn và tự bỏ chạy (battle/fleeTraits.ts).

import type { GameData, Monster, MonsterBattleContext, Skill } from '../model'
import { activeSkillFieldModifiers } from './fieldQueries'
import {
  forEachTraitHook,
  hasTraitFlag,
  type HookSourceKind,
  type TraitHookHandler
} from './traitHooks'

/** Một tỉ lệ % (đã nhân hệ số cấp, kẹp 100) kèm trait (hoặc trạng thái, món...) gây ra. */
export interface TraitChance {
  chance: number
  traitId: string
  source: HookSourceKind
}

/** Priority của skill khi quái này dùng: priority gốc + trait (kiểu Prankster). */
export function skillPriority(
  data: GameData,
  monster: Monster,
  skill: Skill,
  ctx?: MonsterBattleContext
): number {
  let priority = skill.priority
  const fullHp = monster.damageTaken.lte(0)
  // Priority theo môi trường của skill (Grassy Glide trên địa hình cỏ).
  if (ctx) {
    for (const modifier of activeSkillFieldModifiers(data, ctx.field, skill, monster)) {
      priority += modifier.priority ?? 0
    }
  }
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      priority += handler.priorityBonus?.(params, skill.category) ?? 0
      priority += handler.conditionalPriorityBonus?.(params, skill, fullHp) ?? 0
    },
    ctx
  )
  return priority
}

/**
 * Id trait đã cộng priority cho skill mà khiến skill thất bại lên `target` (Prankster trước hệ Bóng
 * tối, như Pokémon từ thế hệ 7); null = không.
 */
export function priorityBoostBlockerTraitId(
  data: GameData,
  { user, skill, target }: { user: Monster; skill: Skill; target: Monster },
  ctx?: MonsterBattleContext
): string | null {
  let found: string | null = null
  forEachTraitHook(
    data,
    user,
    (handler, params, _scale, traitId) => {
      if (found !== null) return
      if (handler.boostFailsAgainst?.(params, skill.category, target.elementIds)) found = traitId
    },
    ctx
  )
  return found
}

/** Quái đi sau quái không mang trait trong cùng mức priority (kiểu Stall). */
export const traitActsLast = (
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): boolean => hasTraitFlag(data, monster, (handler, params) => handler.actsLast?.(params), ctx)

/** Trait làm quái mất lượt dùng skill xen kẽ (kiểu Truant): id trait đầu tiên, hoặc null. */
export function alternateSkipTraitId(
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): string | null {
  let found: string | null = null
  forEachTraitHook(
    data,
    monster,
    (handler, params, _scale, traitId) => {
      if (found === null && handler.skipsAlternateTurns?.(params)) found = traitId
    },
    ctx
  )
  return found
}

/** Tỉ lệ từ một pha theo tỉ lệ của mọi trait, theo thứ tự trait rồi hook. */
function traitChances(
  data: GameData,
  monster: Monster,
  phase: (handler: TraitHookHandler, params: unknown, scale: number) => number | undefined,
  ctx?: MonsterBattleContext
): TraitChance[] {
  const result: TraitChance[] = []
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale, traitId, source) => {
      const chance = phase(handler, params, scale)
      if (chance !== undefined) result.push({ chance, traitId, source: source.kind })
    },
    ctx
  )
  return result
}

/** Các tỉ lệ mất lượt khi dùng skill (skipTurnChance). */
export const traitSkipTurnChances = (
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): TraitChance[] =>
  traitChances(
    data,
    monster,
    (handler, params, scale) => handler.skipTurnChancePercent?.(params, scale),
    ctx
  )

/** Các tỉ lệ đi trước trong cùng mức priority (actFirstChance), theo tỉ lệ máu hiện tại. */
export const traitActFirstChances = (
  data: GameData,
  monster: Monster,
  { hpRatio, ctx }: { hpRatio: number; ctx?: MonsterBattleContext }
): TraitChance[] =>
  traitChances(
    data,
    monster,
    (handler, params, scale) => handler.actFirstChancePercent?.(params, scale, hpRatio),
    ctx
  )

/** Các tỉ lệ dùng skill ngẫu nhiên thay lệnh đã chọn (randomSkillChance). */
export const traitRandomSkillChances = (
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): TraitChance[] =>
  traitChances(
    data,
    monster,
    (handler, params, scale) => handler.randomSkillChancePercent?.(params, scale),
    ctx
  )

/** Tỉ lệ chạy trốn cao nhất từ trait của quái (kiểu Run Away); null = không có trait. */
export function traitFleeChance(
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): TraitChance | null {
  let best: TraitChance | null = null
  for (const entry of traitChances(
    data,
    monster,
    (handler, params, scale) => handler.fleeChancePercent?.(params, scale),
    ctx
  )) {
    if (best === null || entry.chance > best.chance) best = entry
  }
  return best
}

/** Các tỉ lệ tự bỏ chạy cuối lượt ở tỉ lệ máu `hpRatio` (fleeWhenLowHp). */
export const traitLowHpFleeChances = (
  data: GameData,
  monster: Monster,
  hpRatio: number,
  ctx?: MonsterBattleContext
): TraitChance[] =>
  traitChances(
    data,
    monster,
    (handler, params, scale) => handler.lowHpFleeChancePercent?.(params, scale, hpRatio),
    ctx
  )
