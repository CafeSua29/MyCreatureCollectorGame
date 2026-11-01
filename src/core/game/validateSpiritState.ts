// Kiểm tra phần khí linh ngoài món / túi trong save (docs/rules/artifact-spirits.md): cặp khí linh
// đang phối ở Linh trì. Khí linh trên món và trong kho kiểm tra ở inventory/validateEquipment.ts.
// Gọi từ validateGameState.

import { validateArtifactSpirit } from '../inventory'
import type { GameData } from '../model'
import { asObject, checkInteger } from '../shared'

/** Một cặp ở Linh trì: hai khí linh đã thu phục, mỗi con một loại, khác loại nhau; readyDay ≥ 0. */
function checkPool(data: GameData, value: unknown, path: string, issues: string[]): void {
  const pool = asObject(value)
  if (!pool) {
    issues.push(`${path} phải là { first, second, readyDay }`)
    return
  }
  for (const key of ['first', 'second'] as const) {
    issues.push(
      ...validateArtifactSpirit(data, pool[key], { path: `${path}.${key}`, subduedOnly: true })
    )
  }
  const first = asObject(pool.first)?.typeIds
  const second = asObject(pool.second)?.typeIds
  if (Array.isArray(first) && Array.isArray(second)) {
    if (first.length !== 1 || second.length !== 1 || first[0] === second[0]) {
      issues.push(`${path}: phối linh cần hai khí linh một loại, khác loại nhau`)
    }
  }
  issues.push(...checkInteger(pool.readyDay, `${path}.readyDay`, 0))
  for (const key of Object.keys(pool)) {
    if (!['first', 'second', 'readyDay'].includes(key)) issues.push(`${path}: trường lạ "${key}"`)
  }
}

/** spiritPools: danh sách cặp khí linh ở Linh trì. */
export function validateSpiritState(data: GameData, state: Record<string, unknown>): string[] {
  const issues: string[] = []
  if (!Array.isArray(state.spiritPools)) return ['spiritPools phải là danh sách']
  state.spiritPools.forEach((pool: unknown, i) =>
    checkPool(data, pool, `spiritPools[${i}]`, issues)
  )
  return issues
}
