// Tra cứu hook trait khi trúng đòn / hạ gục (hitTraitHooks.ts) trên một quái. Dùng cho trận
// (battle/hitTraits.ts) và AI. Phần trăm từ nhiều trait cộng với nhau rồi mới áp (như luật áp
// trait); kèm danh sách trait có tác dụng để trận ghi log `traitTriggered`.

import type { GameData, Monster, MonsterBattleContext, SkillCategory } from '../model'
import type { StatusChance } from './hitTraitHooks'
import { forEachTraitHook, type TraitHookHandler } from './traitHooks'
import { percentToMultiplier } from './traitHookUtils'

/** Tổng % của một pha trên mọi trait của quái và các trait góp phần (khác 0). */
export interface TraitPercentTotal {
  percent: number
  traitIds: string[]
}

/** Đọc một pha % trên mọi trait của quái (đã nhân hệ số cấp). */
export function sumByTrait(
  data: GameData,
  monster: Monster,
  read: (handler: TraitHookHandler, params: unknown, scale: number) => number | undefined,
  ctx?: MonsterBattleContext
): TraitPercentTotal {
  const total: TraitPercentTotal = { percent: 0, traitIds: [] }
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale, traitId) => {
      const percent = read(handler, params, scale) ?? 0
      if (percent === 0) return
      total.percent += percent
      if (!total.traitIds.includes(traitId)) total.traitIds.push(traitId)
    },
    ctx
  )
  return total
}

/** % sát thương gây ra quái hồi lại (hút máu). */
export const traitLifesteal = (
  data: GameData,
  attacker: Monster,
  ctx?: MonsterBattleContext
): TraitPercentTotal =>
  sumByTrait(
    data,
    attacker,
    (handler, params, scale) => handler.lifestealPercent?.(params, scale),
    ctx
  )

/** % max HP quái tự mất sau một lần dùng skill gây sát thương (kiểu Life Orb). */
export const traitRecoil = (
  data: GameData,
  attacker: Monster,
  ctx?: MonsterBattleContext
): TraitPercentTotal =>
  sumByTrait(
    data,
    attacker,
    (handler, params, scale) => handler.recoilPercent?.(params, scale),
    ctx
  )

/** % max HP quái hồi khi hạ gục một địch. */
export const traitKnockoutHeal = (
  data: GameData,
  attacker: Monster,
  ctx?: MonsterBattleContext
): TraitPercentTotal =>
  sumByTrait(
    data,
    attacker,
    (handler, params, scale) => handler.knockoutHealPercent?.(params, scale),
    ctx
  )

/** % max HP quái đánh mất khi đánh trúng `defender` bằng skill loại `category`. */
export const traitRetaliation = (
  data: GameData,
  defender: Monster,
  category: SkillCategory,
  ctx?: MonsterBattleContext
): TraitPercentTotal =>
  sumByTrait(
    data,
    defender,
    (handler, params, scale) => handler.retaliatePercent?.(params, scale, category),
    ctx
  )

/** % max HP quái đánh mất khi hạ gục `defender`. */
export const traitKnockedOutRetaliation = (
  data: GameData,
  defender: Monster,
  ctx?: MonsterBattleContext
): TraitPercentTotal =>
  sumByTrait(
    data,
    defender,
    (handler, params, scale) => handler.knockedOutRetaliatePercent?.(params, scale),
    ctx
  )

/** Ngưỡng % máu hạ ngay của quái (lớn nhất giữa các trait, không cộng dồn); null = không có. */
export function traitExecuteThreshold(
  data: GameData,
  attacker: Monster,
  ctx?: MonsterBattleContext
): { percent: number; traitId: string } | null {
  let best: { percent: number; traitId: string } | null = null
  forEachTraitHook(
    data,
    attacker,
    (handler, params, _scale, traitId) => {
      const percent = handler.executeBelowPercent?.(params)
      if (percent !== undefined && (best === null || percent > best.percent)) {
        best = { percent, traitId }
      }
    },
    ctx
  )
  return best
}

/** Một trạng thái có thể gây, kèm trait gây ra nó. */
export interface TraitStatusChance extends StatusChance {
  traitId: string
}

/** Trạng thái theo thứ tự trait rồi hook, đọc từ một pha trạng thái. */
function statusChances(
  data: GameData,
  monster: Monster,
  read: (handler: TraitHookHandler, params: unknown, scale: number) => StatusChance[] | undefined,
  ctx?: MonsterBattleContext
): TraitStatusChance[] {
  const result: TraitStatusChance[] = []
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale, traitId) => {
      for (const entry of read(handler, params, scale) ?? []) result.push({ ...entry, traitId })
    },
    ctx
  )
  return result
}

/** Trạng thái quái gây lên mục tiêu khi đánh trúng bằng skill loại `category`. */
export const traitAttackStatuses = (
  data: GameData,
  attacker: Monster,
  category: SkillCategory,
  ctx?: MonsterBattleContext
): TraitStatusChance[] =>
  statusChances(
    data,
    attacker,
    (handler, params, scale) => handler.attackStatuses?.(params, scale, category),
    ctx
  )

/** Trạng thái quái đánh dính khi đánh trúng `defender` bằng skill loại `category`. */
export const traitHitStatuses = (
  data: GameData,
  defender: Monster,
  category: SkillCategory,
  ctx?: MonsterBattleContext
): TraitStatusChance[] =>
  statusChances(
    data,
    defender,
    (handler, params, scale) => handler.hitStatuses?.(params, scale, category),
    ctx
  )

/** Hệ số nhân tỉ lệ hiệu ứng phụ của skill quái dùng (1 = không đổi). */
export function traitSecondaryChanceMultiplier(
  data: GameData,
  user: Monster,
  ctx?: MonsterBattleContext
): number {
  const { percent } = sumByTrait(
    data,
    user,
    (handler, params, scale) => handler.secondaryChancePercent?.(params, scale),
    ctx
  )
  return percentToMultiplier(percent)
}
