// Cuồng bạo (docs/rules/frenzy.md): vai trò của quái trong trận, số theo vai trò, ngưỡng HP sau
// trait. Điểm DUY NHẤT trả lời "quái này có cuồng bạo được không, ngưỡng bao nhiêu"; luồng trong
// trận (kích hoạt cuối lượt, hành động thêm, mất điều khiển) ở battle/frenzy.ts.

import type {
  BattleSide,
  BattleState,
  FrenzyRole,
  FrenzyRoleNumbers,
  GameData,
  Monster,
  MonsterBattleContext
} from '../model'
import { forEachTraitHook } from './traitHooks'

/**
 * Vai trò cuồng bạo của quái trong trận; null = không bao giờ cuồng bạo. Quái hoang (không có chủ)
 * luôn có (Thiên Kiếp thì không); quái có chủ (người chơi, NPC) khi race khó kiểm soát (`tamed`),
 * không thì khi chưa khế ước (`unbound`, chỉ quái người chơi; quái NPC luôn đã khế ước).
 */
export function frenzyRole(
  data: GameData,
  battle: BattleState,
  { side, monster }: { side: BattleSide; monster: Monster }
): FrenzyRole | null {
  const isWild = side === 'enemy' && battle.trainer === null
  if (!isWild) {
    if (data.races[monster.raceId]?.frenzyProne) return 'tamed'
    return monster.contractRealm === null ? 'unbound' : null
  }
  if (battle.tribulation) return null
  if (battle.special?.kind === 'worldBoss') return 'worldBoss'
  return battle.isBoss ? 'boss' : 'wild'
}

/** Số cuồng bạo của vai trò. */
export const frenzyNumbers = (data: GameData, role: FrenzyRole): FrenzyRoleNumbers =>
  data.config.frenzy.roles[role]

/**
 * Ngưỡng HP kích hoạt (% max HP) của quái theo vai trò, cộng điểm % của trait (kiểu Cuồng tính);
 * null = trait chặn cuồng bạo (kiểu Điềm tĩnh).
 */
export function frenzyThreshold(
  data: GameData,
  { monster, role, ctx }: { monster: Monster; role: FrenzyRole; ctx?: MonsterBattleContext }
): number | null {
  let prevented = false
  let bonus = 0
  forEachTraitHook(
    data,
    monster,
    (handler, params, scale) => {
      if (handler.preventsFrenzy?.(params)) prevented = true
      bonus += handler.frenzyThresholdPercent?.(params, scale) ?? 0
    },
    ctx
  )
  return prevented ? null : frenzyNumbers(data, role).hpThresholdPercent + bonus
}
