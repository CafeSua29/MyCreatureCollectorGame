// Tra hook đổi dạng trong trận của quái (formTraitHooks.ts, docs/rules/battle-forms.md). Khóa bảng
// dạng là loài hiện tại của quái (dạng vùng miền là loài riêng: Darmanitan Galar → Zen Galar).

import type { Monster, MonsterBattleContext, GameData, Skill, SkillCategory } from '../model'
import type { DisguiseRule } from './formTraitHooks'
import { forEachTraitHook } from './traitHooks'

/** Dạng trước khi dùng skill (Stance Change): id dạng, null = về dạng thường, undefined = giữ. */
export function formBeforeSkill(
  data: GameData,
  monster: Monster,
  skill: Skill,
  ctx?: MonsterBattleContext
): string | null | undefined {
  let result: string | null | undefined
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      if (result !== undefined) return
      result = handler.formForSkill?.(params, monster.speciesId, skill)
    },
    ctx
  )
  return result
}

/** Dạng nhận khi rời sân (Zero to Hero); undefined = không có. */
export function formOnLeaveOf(
  data: GameData,
  monster: Monster,
  ctx?: MonsterBattleContext
): string | undefined {
  let result: string | undefined
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      result ??= handler.formOnLeave?.(params, monster.speciesId)
    },
    ctx
  )
  return result
}

/** Luật chặn đòn bằng dạng (Disguise, Ice Face) với đòn loại `category`; null = không có. */
export function disguiseRuleOf(
  data: GameData,
  monster: Monster,
  category: SkillCategory,
  ctx?: MonsterBattleContext
): DisguiseRule | null {
  let result: DisguiseRule | null = null
  forEachTraitHook(
    data,
    monster,
    (handler, params) => {
      result ??= handler.disguiseRule?.(params, monster.speciesId, category) ?? null
    },
    ctx
  )
  return result
}
