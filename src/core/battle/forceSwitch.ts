// Ép đổi quái (docs/rules/pokemon-moves.md mục "Ép đổi quái"): Roar, Whirlwind, Dragon Tail,
// Circle Throw đẩy mục tiêu ra, quái dự bị ngẫu nhiên vào thay; quái hoang bị đẩy thì bỏ đi khỏi trận
// như Pokémon. Không đẩy được: boss hoang, quái đang biến hình Dynamax, quái mang hook chống đẩy
// (Ingrain, Suction Cups), phe không còn quái dự bị vào được ô đó.

import { activeTransform, isFainted } from '../monster'
import { hasTraitFlag } from '../registries'
import { pick } from '../shared'
import type { GameData, Monster } from '../model'
import {
  Draft,
  canEnterSlot,
  log,
  monsterBattleContext,
  reservesOnSide,
  sideOf,
  slotsOf
} from './draft'
import { enterField } from './environment'
import { wildFlees } from './fleeTraits'

/** Quái không bị ép rời sân: boss hoang, Dynamax, hook chống đẩy. */
function resistsForceSwitch(data: GameData, d: Draft, target: Monster): boolean {
  if (d.battle.isBoss && sideOf(d, target.id) === 'enemy') return true
  if (activeTransform(target)?.kind === 'dynamax') return true
  // Commander: Dondozo đang được chỉ huy không bị đẩy ra (như Pokémon).
  if (d.battle.volatiles[target.id]?.commandedBy) return true
  return hasTraitFlag(
    data,
    target,
    (handler, params) => handler.resistsForceSwitch?.(params),
    monsterBattleContext(data, d, target)
  )
}

/** Ép một quái rời sân (sau đòn / skill trúng nó). */
export function forceSwitchOut(data: GameData, d: Draft, targetId: string): void {
  const side = sideOf(d, targetId)
  const slot = slotsOf(d.battle, side).indexOf(targetId)
  if (slot < 0) return
  const target =
    d.battle.enemies.find((m) => m.id === targetId) ?? d.party.find((m) => m.id === targetId)
  if (!target || isFainted(data, target)) return
  if (resistsForceSwitch(data, d, target)) {
    log(d, { type: 'forceSwitchFailed', monsterId: targetId })
    return
  }
  // Quái hoang (không có ngự thú sư) bị đẩy thì bỏ đi khỏi trận.
  if (side === 'enemy' && !d.battle.trainer) {
    log(d, { type: 'forcedOut', monsterId: targetId })
    wildFlees(data, d, target)
    return
  }
  const slots = slotsOf(d.battle, side)
  const reserves = reservesOnSide(data, d, side).filter((monster) =>
    canEnterSlot(data, slots, { slot, monster })
  )
  if (reserves.length === 0) {
    log(d, { type: 'forceSwitchFailed', monsterId: targetId })
    return
  }
  let incoming: Monster
  ;[incoming, d.rng] = pick(d.rng, reserves)
  log(d, { type: 'forcedOut', monsterId: targetId })
  enterField(data, d, { side, slot, monster: incoming })
}
