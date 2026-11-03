// Cuồng bạo (docs/rules/frenzy.md): vai trò của quái trong trận, số theo vai trò, ngưỡng HP sau
// trait. Điểm DUY NHẤT trả lời "quái này có cuồng bạo được không, ngưỡng bao nhiêu"; luồng trong
// trận (kích hoạt cuối lượt, hành động thêm, mất điều khiển) ở battle/frenzy.ts.

import type {
  BattleSide,
  BattleState,
  Difficulty,
  FrenzyRole,
  FrenzyRoleNumbers,
  GameData,
  Monster,
  MonsterBattleContext
} from '../model'
import { forEachTraitHook } from './traitHooks'
import { difficultyNumbers } from './challenge'

/** Vai trò của quái hoang chịu độ khó (docs/rules/challenge-modes.md); boss thế giới không. */
const DIFFICULTY_ROLES: readonly FrenzyRole[] = ['wild', 'boss']

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

/**
 * Số cuồng bạo của vai trò; quái hoang / boss cộng thêm ngưỡng HP và tỉ lệ hành động thêm theo độ
 * khó của trận (kẹp 0–100).
 */
export function frenzyNumbers(
  data: GameData,
  role: FrenzyRole,
  difficulty: Difficulty
): FrenzyRoleNumbers {
  const numbers = data.config.frenzy.roles[role]
  if (!DIFFICULTY_ROLES.includes(role)) return numbers
  const { frenzyThresholdPercent, frenzyExtraActionPercent } = difficultyNumbers(data, difficulty)
  const clamp = (value: number): number => Math.min(100, Math.max(0, value))
  return {
    ...numbers,
    hpThresholdPercent: clamp(numbers.hpThresholdPercent + frenzyThresholdPercent),
    extraActionChance: clamp(numbers.extraActionChance + frenzyExtraActionPercent)
  }
}

/**
 * Ngưỡng HP kích hoạt (% max HP) của quái theo vai trò, cộng điểm % của trait (kiểu Cuồng tính);
 * null = trait chặn cuồng bạo (kiểu Điềm tĩnh).
 */
export function frenzyThreshold(
  data: GameData,
  {
    monster,
    role,
    difficulty,
    ctx
  }: { monster: Monster; role: FrenzyRole; difficulty: Difficulty; ctx?: MonsterBattleContext }
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
  return prevented ? null : frenzyNumbers(data, role, difficulty).hpThresholdPercent + bonus
}
