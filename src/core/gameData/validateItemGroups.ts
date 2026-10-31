// Kiểm tra config.itemGroups (nhóm vật phẩm cho nguyên liệu "món bất kỳ trong nhóm";
// docs/rules/alchemy.md) và id nhóm được tham chiếu từ chỗ khác.

import type { GameData } from '../model'
import { asObject } from '../shared'
import { checkStackItemId } from './checks'

/** Mỗi nhóm: danh sách không rỗng các vật phẩm gộp chồng, không trùng. */
export function checkItemGroups(data: GameData, issues: string[]): void {
  const groups = asObject(data.config.itemGroups)
  if (!groups) {
    issues.push('config.itemGroups phải là object')
    return
  }
  for (const [groupId, itemIds] of Object.entries(groups)) {
    const at = `config.itemGroups.${groupId}`
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      issues.push(`${at} phải là danh sách vật phẩm không rỗng`)
      continue
    }
    for (const itemId of itemIds) {
      if (typeof itemId !== 'string') issues.push(`${at}: id vật phẩm phải là chuỗi`)
      else issues.push(...checkStackItemId(data, itemId, at))
    }
    if (new Set(itemIds).size !== itemIds.length) issues.push(`${at} bị trùng vật phẩm`)
  }
}

/** Id nhóm tham chiếu phải có trong config.itemGroups. */
export function checkItemGroupId(data: GameData, groupId: unknown, at: string): string[] {
  const groups = asObject(data.config.itemGroups)
  if (typeof groupId === 'string' && groups && Object.hasOwn(groups, groupId)) return []
  return [`${at}: nhóm vật phẩm không tồn tại "${String(groupId)}"`]
}
