// Trait chạy trốn (mục "Trait chạy trốn" ở battle-traits.md): lệnh chạy trốn của người chơi theo trait
// kiểu Run Away (vượt room chặn chạy trốn như Pokémon) và quái tự bỏ chạy cuối lượt khi máu thấp
// (Bản năng sinh tồn): quái hoang rời trận không cho thưởng, quái ta tự rút về dự bị.

import { getCurrentHp, getMaxHp, isFainted } from '../monster'
import { traitFleeChance, traitLowHpFleeChances, type TraitChance } from '../registries'
import { rollPercent } from '../shared'
import type { BattleSide, GameData, Monster } from '../model'
import {
  Draft,
  aliveOnField,
  canEnterSlot,
  clearOnFieldState,
  log,
  removeFromField,
  reservesOnSide,
  sideOf,
  slotsOf
} from './draft'
import { enterField } from './environment'

/** Trait chạy trốn kèm quái mang trait. */
export interface FleeTrait extends TraitChance {
  monsterId: string
}

/** Trait chạy trốn tốt nhất trong các quái ta còn sống trên sân; null = không có. */
export function playerFleeTrait(data: GameData, d: Draft): FleeTrait | null {
  let best: FleeTrait | null = null
  for (const { monster } of aliveOnField(data, d, 'player')) {
    const found = traitFleeChance(data, monster)
    if (found !== null && (best === null || found.chance > best.chance)) {
      best = { ...found, monsterId: monster.id }
    }
  }
  return best
}

/** Trait làm quái tự bỏ chạy lượt này (tung lần lượt từng tỉ lệ); null = ở lại. */
function rollLowHpFlee(data: GameData, d: Draft, monster: Monster): string | null {
  const hpRatio = getCurrentHp(data, monster).div(getMaxHp(data, monster)).toNumber()
  for (const { chance, traitId } of traitLowHpFleeChances(data, monster, hpRatio)) {
    let fled: boolean
    ;[fled, d.rng] = rollPercent(d.rng, chance)
    if (fled) return traitId
  }
  return null
}

/** Quái hoang bỏ chạy: rời trận hẳn (không EXP, tiền, đồ rơi), như bị bắt nhưng không vào đội. */
export function wildFlees(data: GameData, d: Draft, monster: Monster): void {
  d.battle.enemies = d.battle.enemies.filter((m) => m.id !== monster.id)
  removeFromField(d, 'enemy', monster.id)
  clearOnFieldState(data, d, monster.id)
  log(d, { type: 'wildFled', monsterId: monster.id })
}

/** Phe này có quái tự bỏ chạy được không: boss hoang không chạy, quái ta cần dự bị để rút về. */
function canFleeFrom(data: GameData, d: Draft, side: BattleSide): boolean {
  if (side === 'enemy' && !d.battle.trainer) return !d.battle.isBoss
  return reservesOnSide(data, d, side).length > 0
}

/**
 * Cuối lượt (sau mọi bước khác): quái còn sống trên sân có trait kiểu Bản năng sinh tồn mà máu ≤
 * ngưỡng thì tung tỉ lệ bỏ chạy. Quái ta rút về, quái dự bị còn sống đầu tiên vào thay.
 */
export function fleesAtTurnEnd(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { slot, monster } of aliveOnField(data, d, side)) {
      if (!canFleeFrom(data, d, side)) break
      const traitId = rollLowHpFlee(data, d, monster)
      if (traitId === null) continue
      log(d, { type: 'traitTriggered', monsterId: monster.id, traitId })
      retreat(data, d, { side, slot, monster })
    }
  }
}

/**
 * Quái tự rời sân: quái hoang (không có ngự thú sư) bỏ chạy khỏi trận; quái có chủ rút về, quái dự
 * bị còn sống đầu tiên vào được ô thì vào thay (không có thì ở lại).
 */
function retreat(
  data: GameData,
  d: Draft,
  { side, slot, monster }: { side: BattleSide; slot: number; monster: Monster }
): void {
  if (side === 'enemy' && !d.battle.trainer) {
    wildFlees(data, d, monster)
    return
  }
  // Quái lớn chỉ vào khi mọi ô khác trống (docs/rules/monster-size.md).
  const slots = slotsOf(d.battle, side)
  const incoming = reservesOnSide(data, d, side).find((reserve) =>
    canEnterSlot(data, slots, { slot, monster: reserve })
  )
  if (incoming) enterField(data, d, { side, slot, monster: incoming })
}

/**
 * Wimp Out / Emergency Exit (hiệu ứng `retreat`): quái còn sống trên sân tự rời sân giữa lượt; boss
 * hoang không chạy (như trait bỏ chạy).
 */
export function retreatFromField(data: GameData, d: Draft, monster: Monster): void {
  if (isFainted(data, monster)) return
  const side = sideOf(d, monster.id)
  const slot = slotsOf(d.battle, side).indexOf(monster.id)
  if (slot < 0 || !canFleeFrom(data, d, side)) return
  retreat(data, d, { side, slot, monster })
}
