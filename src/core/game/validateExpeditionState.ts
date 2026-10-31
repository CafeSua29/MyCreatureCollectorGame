// Kiểm tra phần thám hiểm trong save (docs/rules/expeditions.md): bảng, đội đang đi, việc của quái
// khớp đội.

import type { GameData } from '../model'
import { asObject, checkInteger } from '../shared'

function checkActive(
  data: GameData,
  value: unknown,
  { at, storage }: { at: string; storage: readonly Record<string, unknown>[] },
  issues: string[]
): string | null {
  const active = asObject(value)
  if (!active) {
    issues.push(`${at} phải là object`)
    return null
  }
  const id = typeof active.id === 'string' && /^x\d+$/.test(active.id) ? active.id : null
  if (!id) issues.push(`${at}.id phải có dạng "x<số>"`)
  if (
    typeof active.expeditionId !== 'string' ||
    !Object.hasOwn(data.expeditions, active.expeditionId)
  ) {
    issues.push(`${at}.expeditionId: thám hiểm không tồn tại "${String(active.expeditionId)}"`)
  }
  issues.push(...checkInteger(active.endDay, `${at}.endDay`, 0))
  const ids = active.monsterIds
  if (!Array.isArray(ids) || ids.length === 0) {
    issues.push(`${at}.monsterIds phải là danh sách không rỗng`)
    return id
  }
  if (new Set(ids).size !== ids.length) issues.push(`${at}.monsterIds bị lặp`)
  // Quái tọa hóa khi đang đi đã rời kho: chỉ quái còn trong kho phải mang đúng việc.
  for (const monsterId of ids) {
    const monster = storage.find((m) => m.id === monsterId)
    if (monster && asObject(monster.assignment)?.id !== id) {
      issues.push(`${at}: quái "${String(monsterId)}" không mang việc của đội này`)
    }
  }
  return id
}

/** expeditions: bảng là mẫu tồn tại không lặp, đội đang đi hợp lệ; quái có việc phải thuộc một đội. */
export function validateExpeditionState(
  data: GameData,
  value: unknown,
  { storage, party }: { storage: unknown; party: unknown }
): string[] {
  const expeditions = asObject(value)
  if (!expeditions) return ['expeditions phải là object']
  const issues = [
    ...checkInteger(expeditions.refreshDay, 'expeditions.refreshDay', 0),
    ...checkInteger(expeditions.nextId, 'expeditions.nextId', 1)
  ]
  const board = expeditions.board
  if (!Array.isArray(board)) issues.push('expeditions.board phải là danh sách')
  else {
    for (const id of board) {
      if (typeof id !== 'string' || !Object.hasOwn(data.expeditions, id)) {
        issues.push(`expeditions.board: thám hiểm không tồn tại "${String(id)}"`)
      }
    }
    if (new Set(board).size !== board.length) issues.push('expeditions.board bị lặp')
  }
  const stored = (Array.isArray(storage) ? storage : []).flatMap((m) => {
    const monster = asObject(m)
    return monster ? [monster] : []
  })
  const activeIds: string[] = []
  const active = expeditions.active
  if (!Array.isArray(active)) issues.push('expeditions.active phải là danh sách')
  else {
    active.forEach((entry, i) => {
      const id = checkActive(
        data,
        entry,
        { at: `expeditions.active[${i}]`, storage: stored },
        issues
      )
      if (id) activeIds.push(id)
    })
    if (new Set(activeIds).size !== activeIds.length) issues.push('expeditions.active: id bị trùng')
  }
  const next = typeof expeditions.nextId === 'number' ? expeditions.nextId : Infinity
  if (activeIds.some((id) => Number(id.slice(1)) >= next)) {
    issues.push('expeditions.nextId phải lớn hơn mọi id đội')
  }
  for (const monster of stored) {
    const id = asObject(monster.assignment)?.id
    if (id !== undefined && !activeIds.includes(String(id))) {
      issues.push(`quái "${String(monster.id)}" mang việc "${String(id)}" không có đội nào`)
    }
  }
  for (const entry of Array.isArray(party) ? party : []) {
    if (asObject(entry)?.assignment) {
      issues.push(`quái "${String(asObject(entry)?.id)}" trong đội không được có việc`)
    }
  }
  return issues
}
