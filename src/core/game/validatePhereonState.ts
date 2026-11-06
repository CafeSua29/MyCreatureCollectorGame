// Kiểm tra phần save của phòng ấp (docs/rules/hatchery.md) và tinh chất (docs/rules/essences.md). Gọi từ
// validateGameState.

import type { GameData } from '../model'
import { asObject } from '../shared'

type Raw = Record<string, unknown>

/** hatchery.rooms: tối đa roomCount phòng, môi trường tồn tại; trứng đặt đúng phòng, không quá sức chứa. */
export function validateHatcheryState(data: GameData, state: Raw): string[] {
  const config = data.config.hatchery
  const hatchery = asObject(state.hatchery)
  if (!hatchery || !Array.isArray(hatchery.rooms)) return ['hatchery.rooms phải là danh sách']
  const issues: string[] = []
  if (hatchery.rooms.length > config.roomCount) {
    issues.push(`hatchery.rooms: tối đa ${config.roomCount} phòng`)
  }
  hatchery.rooms.forEach((room, index) => {
    const obj = asObject(room)
    const habitatId = obj?.habitatId
    if (!config.habitats.some((habitat) => habitat.id === habitatId)) {
      issues.push(`hatchery.rooms[${index}].habitatId lạ "${String(habitatId)}"`)
    }
    const upgrades = Array.isArray(obj?.upgrades) ? obj.upgrades : null
    if (!upgrades) issues.push(`hatchery.rooms[${index}].upgrades phải là danh sách`)
    else {
      if (upgrades.length > config.upgradeCap) {
        issues.push(`hatchery.rooms[${index}]: tối đa ${config.upgradeCap} nâng cấp`)
      }
      if (new Set(upgrades).size !== upgrades.length) {
        issues.push(`hatchery.rooms[${index}].upgrades bị trùng`)
      }
      for (const id of upgrades) {
        if (!config.upgrades.some((upgrade) => upgrade.id === id)) {
          issues.push(`hatchery.rooms[${index}].upgrades: nâng cấp lạ "${String(id)}"`)
        }
      }
    }
    const hatcherId = obj?.hatcherId
    if (hatcherId !== null) {
      const storage = Array.isArray(state.storage) ? state.storage : []
      const hatcher = storage.map((entry) => asObject(entry)).find((m) => m?.id === hatcherId)
      const assignment = asObject(hatcher?.assignment)
      // Quái đã mất (tọa hóa...) thì phòng coi như không có người ấp, không phải save hỏng.
      if (hatcher && (assignment?.kind !== 'hatchery' || assignment.id !== `room-${index}`)) {
        issues.push(
          `hatchery.rooms[${index}].hatcherId: "${String(hatcherId)}" không phải người ấp của phòng`
        )
      }
    }
  })
  const eggs = Array.isArray(state.eggs) ? state.eggs : []
  const used = new Map<number, number>()
  for (const egg of eggs) {
    const roomIndex = asObject(egg)?.roomIndex
    if (roomIndex === undefined) continue
    if (
      !Number.isSafeInteger(roomIndex) ||
      Number(roomIndex) < 0 ||
      Number(roomIndex) >= config.roomCount
    ) {
      issues.push(`eggs: roomIndex không hợp lệ "${String(roomIndex)}"`)
      continue
    }
    const count = (used.get(Number(roomIndex)) ?? 0) + 1
    used.set(Number(roomIndex), count)
    if (count > config.eggsPerRoom)
      issues.push(`eggs: phòng ${String(roomIndex)} quá ${config.eggsPerRoom} trứng`)
  }
  return issues
}

/** essences: tinh chất đã có và lựa chọn đang chờ đều tồn tại, không lặp. */
export function validateEssenceState(data: GameData, state: Raw): string[] {
  const essences = asObject(state.essences)
  if (!essences || !Array.isArray(essences.owned)) return ['essences.owned phải là danh sách']
  const issues: string[] = []
  if (new Set(essences.owned).size !== essences.owned.length) issues.push('essences.owned bị trùng')
  const unknown = (id: unknown): boolean =>
    typeof id !== 'string' || !Object.hasOwn(data.essences, id)
  for (const id of essences.owned) {
    if (unknown(id)) issues.push(`essences.owned: tinh chất lạ "${String(id)}"`)
  }
  if (essences.offer === null) return issues
  if (!Array.isArray(essences.offer))
    return [...issues, 'essences.offer phải là null hoặc danh sách']
  for (const id of essences.offer) {
    if (unknown(id)) issues.push(`essences.offer: tinh chất lạ "${String(id)}"`)
  }
  return issues
}
