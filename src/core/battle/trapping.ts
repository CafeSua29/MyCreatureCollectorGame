// Giữ chân (docs/rules/pokemon-moves.md mục "Trói và giữ chân"): quái mang hook `trapped` (trạng thái
// Bind / Mean Look, ability Shadow Tag qua hào quang lên địch) không đổi quái, không chạy trốn được;
// hệ mang `trapImmune` (hệ Ma) không bị giữ chân.

import { hasTraitFlag } from '../registries'
import type { GameData, Monster } from '../model'
import { Draft, aliveOnField, monsterBattleContext } from './draft'

/** Quái đang bị giữ chân (không đổi quái / chạy trốn được). */
export function isTrapped(data: GameData, d: Draft, monster: Monster): boolean {
  // Commander: Dondozo đang được chỉ huy và Tatsugiri trong miệng nó không rời sân được (kể cả hệ Ma).
  const volatile = d.battle.volatiles[monster.id]
  if (volatile?.commandedBy || volatile?.commanding || volatile?.carriedBy) return true
  if (monster.elementIds.some((id) => data.elements[id]?.trapImmune)) return false
  return hasTraitFlag(
    data,
    monster,
    (handler, params) => handler.isTrapped?.(params, monster.elementIds),
    monsterBattleContext(data, d, monster)
  )
}

/** Quái phe người chơi trên sân bị giữ chân đầu tiên (chặn chạy trốn); null = không. */
export function trappedPlayerMonster(data: GameData, d: Draft): Monster | null {
  return (
    aliveOnField(data, d, 'player').find(({ monster }) => isTrapped(data, d, monster))?.monster ??
    null
  )
}
