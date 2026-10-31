// Trait cuối lượt và trạng thái (mục "Trait cuối lượt và trạng thái" ở battle-traits.md): bước trait cuối
// lượt (tự chữa trạng thái, hồi / mất máu, tự mất máu khi máu thấp, gây mất máu cho địch, đổi bậc
// kiểu Speed Boost) và chữa trạng thái khi rời sân / hết trận (kiểu Natural Cure).

import { getCurrentHp, getMaxHp, isFainted, percentOfMaxHp } from '../monster'
import {
  cureOnLeaveTraitId,
  forEachTraitHook,
  isIndirectDamageImmune,
  leaveHeal,
  traitFoeTurnEndDamage,
  traitSelfTurnEndDamage,
  traitTurnEndCureChances
} from '../registries'
import { maxBig, rollPercent } from '../shared'
import type { BattleSide, GameData, Monster } from '../model'
import { Draft, aliveOnField, log, monsterBattleContext, opponentOf, monsterField } from './draft'
import { heal, loseHp } from './hpChanges'
import { triggerStageTraits } from './stageChanges'
import { cureAllStatuses, hazardDamageFactor } from './statuses'

const logTraits = (d: Draft, monsterId: string, traitIds: readonly string[]): void => {
  for (const traitId of traitIds) log(d, { type: 'traitTriggered', monsterId, traitId })
}

/**
 * Quái mất `percent`% max HP của nó vì trait cuối lượt (× `factor`: boss hoang ½ khi do trait của
 * quái khác), làm tròn lên, tối thiểu 1, log `traitDamage`. Miễn sát thương gián tiếp (kiểu Magic
 * Guard) thì không mất. Trả về true nếu có mất máu.
 */
function loseTurnEndHp(
  data: GameData,
  d: Draft,
  {
    monster,
    percent,
    factor,
    source
  }: { monster: Monster; percent: number; factor: number; source?: Monster }
): boolean {
  if (isFainted(data, monster) || isIndirectDamageImmune(data, monster)) return false
  const amount = maxBig(1, percentOfMaxHp(getMaxHp(data, monster).times(factor), percent))
  // Trait của quái khác: sát thương gián tiếp (qua bước giảm trừ); trait của chính nó: tự mất máu.
  loseHp(
    data,
    d,
    monster,
    amount,
    (dealt) => ({ type: 'traitDamage', monsterId: monster.id, amount: dealt }),
    source ? { kind: 'indirect', source } : { kind: 'cost' }
  )
  return true
}

/** Tự chữa mọi trạng thái theo tỉ lệ (kiểu Shed Skin); không có trạng thái thì không tốn RNG. */
function cureByChance(data: GameData, d: Draft, monster: Monster): void {
  for (const { chance, traitId } of traitTurnEndCureChances(data, monster)) {
    if (monster.statuses.length === 0) return
    let cured: boolean
    ;[cured, d.rng] = rollPercent(d.rng, chance)
    if (!cured) continue
    log(d, { type: 'traitTriggered', monsterId: monster.id, traitId })
    cureAllStatuses(data, d, monster)
  }
}

/** Hồi / mất máu theo % max HP (regen, regenInWeather; âm = mất máu do trait). */
function regenerate(data: GameData, d: Draft, monster: Monster): void {
  let healPercent = 0
  forEachTraitHook(data, monster, (handler, params, scale) => {
    if (handler.onTurnEnd) {
      healPercent += handler.onTurnEnd(params, scale, {
        data,
        monster,
        field: monsterField(data, d, monster)
      }).healPercent
    }
  })
  if (healPercent > 0) heal(data, d, monster, percentOfMaxHp(getMaxHp(data, monster), healPercent))
  if (healPercent < 0) loseTurnEndHp(data, d, { monster, percent: -healPercent, factor: 1 })
}

/** Tự mất máu khi máu ≤ ngưỡng (tính sau khi hồi); trait của chính nó nên không giảm cho boss. */
function selfDamageWhileLowHp(data: GameData, d: Draft, monster: Monster): void {
  if (isFainted(data, monster)) return
  const hpRatio = getCurrentHp(data, monster).div(getMaxHp(data, monster)).toNumber()
  const total = traitSelfTurnEndDamage(data, monster, hpRatio)
  if (total.percent <= 0 || isIndirectDamageImmune(data, monster)) return
  logTraits(d, monster.id, total.traitIds)
  loseTurnEndHp(data, d, { monster, percent: total.percent, factor: 1 })
}

/** Mọi địch còn sống trên sân mất % max HP của chúng (boss hoang ½), cộng % các trait rồi áp một lần. */
function damageFoes(data: GameData, d: Draft, monster: Monster, side: BattleSide): void {
  if (isFainted(data, monster)) return
  const total = traitFoeTurnEndDamage(data, monster)
  if (total.percent <= 0) return
  const foeSide = opponentOf(side)
  const factor = hazardDamageFactor(data, d, foeSide)
  const foes = aliveOnField(data, d, foeSide).filter(
    (entry) => !isIndirectDamageImmune(data, entry.monster)
  )
  if (foes.length === 0) return
  logTraits(d, monster.id, total.traitIds)
  for (const { monster: foe } of foes) {
    loseTurnEndHp(data, d, { monster: foe, percent: total.percent, factor, source: monster })
  }
}

/**
 * Bước trait cuối lượt cho mọi quái còn trên sân: tự chữa trạng thái → hồi / mất máu → tự mất máu
 * khi máu thấp → gây mất máu cho địch → đổi bậc (stageOnTurnEnd, kiểu Speed Boost) nếu quái đã
 * trên sân từ đầu lượt (như Pokémon: quái vừa vào giữa lượt thì chưa).
 */
export function traitsAtTurnEnd(data: GameData, d: Draft): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const { monster } of aliveOnField(data, d, side)) {
      cureByChance(data, d, monster)
      regenerate(data, d, monster)
      selfDamageWhileLowHp(data, d, monster)
      damageFoes(data, d, monster, side)
      const firstTurn = d.battle.volatiles[monster.id]?.firstTurn
      if (!isFainted(data, monster) && firstTurn !== undefined && firstTurn <= d.battle.turn) {
        triggerStageTraits(data, d, monster, 'turnEnd')
      }
    }
  }
}

/**
 * Quái còn sống rời sân (đổi quái, rút về) hoặc hết trận khi đang trên sân: trait kiểu Natural Cure
 * chữa mọi trạng thái. Không có trạng thái thì không ghi log.
 */
export function cureOnLeave(data: GameData, d: Draft, monster: Monster): void {
  if (isFainted(data, monster) || monster.statuses.length === 0) return
  const traitId = cureOnLeaveTraitId(data, monster)
  if (traitId === null) return
  log(d, { type: 'traitTriggered', monsterId: monster.id, traitId })
  cureAllStatuses(data, d, monster)
}

/** Rời sân còn sống: hồi % max HP theo trait kiểu Regenerator (không áp khi hết trận). */
export function healOnLeave(data: GameData, d: Draft, monster: Monster): void {
  if (isFainted(data, monster)) return
  const found = leaveHeal(data, monster, monsterBattleContext(data, d, monster))
  if (!found) return
  log(d, { type: 'traitTriggered', monsterId: monster.id, traitId: found.traitId })
  heal(data, d, monster, percentOfMaxHp(getMaxHp(data, monster), found.percent))
}

/** Hết trận: quái ta còn sống đang trên sân được chữa trạng thái nếu có trait kiểu Natural Cure. */
export function cureOnBattleEnd(data: GameData, d: Draft): void {
  for (const { monster } of aliveOnField(data, d, 'player')) cureOnLeave(data, d, monster)
}
