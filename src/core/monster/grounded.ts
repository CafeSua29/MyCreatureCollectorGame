// Quái đứng trên mặt đất (mục "Môi trường" ở battle-environment.md): địa hình chỉ tác dụng lên quái này.

import { hasTraitFlag, isGroundingForced } from '../registries'
import type { BattleField, GameData, Monster } from '../model'

/**
 * Đứng trên mặt đất: không có hệ `airborne` (hệ Bay) và không có trait không chạm đất; room ép
 * đứng trên mặt đất (Gravity) thì mọi quái đều đứng trên mặt đất. `field`: môi trường của trận
 * (bỏ trống = ngoài trận hoặc chỉ xét bản thân quái).
 */
export function isGrounded(data: GameData, monster: Monster, field?: BattleField): boolean {
  if (field && isGroundingForced(data, field)) return true
  if (hasTraitFlag(data, monster, (handler, params) => handler.isForcedGrounded?.(params)))
    return true
  if (monster.elementIds.some((elementId) => data.elements[elementId].airborne)) return false
  return !hasTraitFlag(data, monster, (handler, params) => handler.isAirborne?.(params))
}
