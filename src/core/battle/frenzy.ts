// Cuồng bạo trong trận (docs/rules/frenzy.md): kích hoạt cuối lượt (HP ≤ ngưỡng và phe đang thua, hoặc
// theo lượt với boss thế giới; một lần mỗi trận, giữ tới hết trận qua `usedOnce`), hành động thêm do
// AI chọn sau khi dùng skill (tối đa một lần mỗi lượt), quái người chơi cuồng bạo mất điều khiển (lệnh do AI chọn). % công /
// đặc công đi qua bối cảnh trận (`frenzyStatPercent`, monsterBattleContext).

import { getCurrentHp, getMaxHp } from '../monster'
import { frenzyNumbers, frenzyRole, frenzyThreshold } from '../registries'
import { BIG_ZERO, rollPercent, type Decimal } from '../shared'
import type { BattleSide, BattleState, GameData, Monster } from '../model'
import {
  Draft,
  aliveOnField,
  hasUsedOnce,
  log,
  markUsedOnce,
  monsterBattleContext,
  opponentOf,
  teamOf
} from './draft'
import { claimFrenzyRoll, insertExtraAction, type TurnAction } from './actionQueue'

/** Quái đang cuồng bạo (đã kích hoạt trong trận này). */
export const isFrenzied = (battle: BattleState, monsterId: string): boolean =>
  battle.usedOnce[monsterId]?.includes('frenzy') ?? false

/** Ô phe người chơi có quái cuồng bạo: người chơi không ra lệnh, AI chung chọn thay. */
export const frenziedPlayerSlots = (battle: BattleState): number[] =>
  battle.playerSlots.flatMap((id, slot) => (id !== null && isFrenzied(battle, id) ? [slot] : []))

function hpTotals(data: GameData, team: readonly Monster[]): { current: Decimal; max: Decimal } {
  let current = BIG_ZERO
  let max = BIG_ZERO
  for (const monster of team) {
    current = current.plus(getCurrentHp(data, monster))
    max = max.plus(getMaxHp(data, monster))
  }
  return { current, max }
}

/** Phe đang thua: tổng % HP cả phe (kể cả dự bị) thấp hơn phe địch. */
function isLosing(data: GameData, d: Draft, side: BattleSide): boolean {
  const own = hpTotals(data, teamOf(data, d, side))
  const foe = hpTotals(data, teamOf(data, d, opponentOf(side)))
  // own.current / own.max < foe.current / foe.max, nhân chéo để không chia cho 0.
  return own.current.times(foe.max).lt(foe.current.times(own.max))
}

/**
 * Quái thỏa điều kiện kích hoạt: vai trò kích hoạt theo lượt (`fromTurn`) thì tới lượt là đủ; không
 * thì phe đang thua và HP ≤ ngưỡng. Trait chặn cuồng bạo (ngưỡng null) chặn cả hai cách.
 */
function shouldFrenzy(
  data: GameData,
  d: Draft,
  { side, monster, losing }: { side: BattleSide; monster: Monster; losing: boolean }
): boolean {
  if (hasUsedOnce(d, monster.id, 'frenzy')) return false
  const role = frenzyRole(data, d.battle, { side, monster })
  if (role === null) return false
  const ctx = monsterBattleContext(data, d, monster)
  const threshold = frenzyThreshold(data, {
    monster,
    role,
    difficulty: d.battle.difficulty,
    ctx
  })
  if (threshold === null) return false
  // Kích hoạt cuối lượt fromTurn − 1: cuồng bạo có tác dụng từ lượt fromTurn.
  const { fromTurn } = frenzyNumbers(data, role, d.battle.difficulty)
  if (fromTurn !== undefined) return d.battle.turn >= fromTurn - 1
  if (!losing) return false
  return getCurrentHp(data, monster).times(100).lte(getMaxHp(data, monster).times(threshold))
}

/**
 * Bước cuối lượt: quái còn sống trên sân thỏa điều kiện (phe đang thua và HP ≤ ngưỡng, hoặc tới lượt
 * với vai trò kích hoạt theo lượt) thì cuồng bạo.
 */
export function frenzyAtTurnEnd(data: GameData, d: Draft): void {
  // Xét phe thua trước khi kích hoạt: cuồng bạo không đổi HP nên thứ tự quái không quan trọng.
  for (const side of ['player', 'enemy'] as const) {
    const losing = isLosing(data, d, side)
    for (const { monster } of aliveOnField(data, d, side)) {
      if (!shouldFrenzy(data, d, { side, monster, losing })) continue
      markUsedOnce(d, monster.id, 'frenzy')
      log(d, { type: 'frenzy', monsterId: monster.id })
    }
  }
}

/**
 * Sau khi quái cuồng bạo dùng skill: tung tỉ lệ (một lần mỗi lượt), trúng thì chèn một hành động
 * thêm ngay sau, lệnh do AI chung chọn lúc tới lượt (cả quái người chơi).
 */
export function rollFrenzyExtraAction(data: GameData, d: Draft, action: TurnAction): void {
  if (!isFrenzied(d.battle, action.monsterId)) return
  if (!claimFrenzyRoll(d, action.monsterId)) return
  const monster = teamOf(data, d, action.side).find((m) => m.id === action.monsterId)
  const role = monster && frenzyRole(data, d.battle, { side: action.side, monster })
  if (!role) return
  let hit: boolean
  ;[hit, d.rng] = rollPercent(
    d.rng,
    frenzyNumbers(data, role, d.battle.difficulty).extraActionChance
  )
  if (!hit) return
  insertExtraAction(d, { ...action })
  log(d, { type: 'frenzyAction', monsterId: action.monsterId })
}
