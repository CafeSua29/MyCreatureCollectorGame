// Kiểm tra sức chứa trong save (docs/rules/capacity.md): số lần mở rộng, kho quái không vượt sức chứa.

import { asObject, checkInteger } from '../shared'
import { CAPACITY_KINDS, type GameData, type GameState } from '../model'
import { capacityOf } from '../registries'
import { checkKnownFields } from '../gameData'

/**
 * state.capacity: đủ mọi loại, nguyên ≥ 0; kho quái không vượt sức chứa (mọi đường vào kho đều chặn
 * khi đầy). Túi trang bị được vượt: đồ tự về túi khi quái chết hẳn không bị chặn.
 */
export function validateCapacityState(data: GameData, state: Record<string, unknown>): string[] {
  const capacity = asObject(state.capacity)
  if (!capacity) return ['capacity phải là object']
  const issues: string[] = []
  checkKnownFields(capacity, CAPACITY_KINDS, 'capacity', 'sức chứa', issues)
  for (const kind of CAPACITY_KINDS) {
    issues.push(...checkInteger(capacity[kind], `capacity.${kind}`, 0))
  }
  if (
    issues.length > 0 ||
    !Array.isArray(state.storage) ||
    !asObject(state.tamer) ||
    !asObject(state.ascension)
  ) {
    return issues
  }
  // Đã kiểm tra capacity / tamer / storage có đúng dạng ở trên và ở validateGameState.
  const holder = state as unknown as Pick<GameState, 'capacity' | 'tamer' | 'ascension'>
  const max = capacityOf(data, holder, 'storage')
  if (state.storage.length > max) {
    issues.push(`storage có ${state.storage.length} quái, vượt sức chứa ${max}`)
  }
  return issues
}
