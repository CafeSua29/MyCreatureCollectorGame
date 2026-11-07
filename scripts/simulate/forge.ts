// "Người chơi" ở Thợ rèn (mục "Thợ rèn" ở simulation-features.md, docs/rules/equipment-forge.md):
// về thị trấn thì phân giải đồ dư bậc từ FORGE_POLICY.salvageMinRarity (đồ thấp hơn vẫn bán lấy tiền,
// economy.ts), rồi cường hóa đồ đang lắp của đội mẫu, mỗi lần món cấp thấp nhất, tới khi hết đá,
// yêu đan (cấp cao) hoặc tiền; rồi đúc trang bị bằng yêu đan còn lại theo lô FORGE_POLICY.castCores
// (món gốc: còn ô trống thì món thường giá cao nhất, không thì món kém nhất đang lắp). Không tẩy luyện (khó chấm điểm dòng phụ), không luyện công thức
// luyện khí (yêu đan ưu tiên đúc; giả định của mô phỏng).

import {
  ActionError,
  EQUIPMENT_RARITIES,
  equipmentSlotCount,
  findEquipmentItem,
  getItemCount,
  imbueCoreItemId,
  imbueCost,
  imbuedElementId,
  isRandomEquipment,
  type EquipmentRarity,
  type GameData,
  type GameState
} from '@core'
import { simAct } from './events'

/** Giả định của mô phỏng, không phải luật game. */
export const FORGE_POLICY: { salvageMinRarity: EquipmentRarity; castCores: number } = {
  salvageMinRarity: 'rare',
  castCores: 3
}

/** Lỗi thiếu tài nguyên: dừng cường hóa / đúc (không phải lỗi của mô phỏng). */
const OUT_OF_RESOURCE: readonly string[] = ['notEnoughItem', 'notEnoughGroupItem', 'notEnoughMoney']

/** Phân giải mọi món trong túi bậc từ salvageMinRarity; trả state mới và số món đã phân giải. */
export function salvageSurplus(
  data: GameData,
  state: GameState
): { state: GameState; salvaged: number } {
  if (state.location.type !== 'town' || state.battle) return { state, salvaged: 0 }
  const minRank = EQUIPMENT_RARITIES.indexOf(FORGE_POLICY.salvageMinRarity)
  const instanceIds = state.inventory.equipment
    .filter((instance) => EQUIPMENT_RARITIES.indexOf(instance.rarity) >= minRank)
    .map((instance) => instance.id)
  if (instanceIds.length === 0) return { state, salvaged: 0 }
  return {
    state: simAct(data, state, { type: 'salvageEquipment', instanceIds }),
    salvaged: instanceIds.length
  }
}

/** Món đang lắp có cấp thấp nhất trên đội mẫu (hòa thì theo thứ tự đội, thứ tự ô). */
function lowestLevelGear(state: GameState, teamIds: ReadonlySet<string>): string | null {
  let best: { id: string; level: number } | null = null
  for (const monster of state.party) {
    if (!teamIds.has(monster.id)) continue
    for (const entry of monster.equipment) {
      if (entry.storage !== 'instance') continue
      if (best === null || entry.instance.level < best.level) {
        best = { id: entry.instance.id, level: entry.instance.level }
      }
    }
  }
  return best?.id ?? null
}

/** Cường hóa đồ đang lắp của đội mẫu tới khi hết đá / tiền; trả state mới và số lần cường hóa. */
export function enhanceTeamGear(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; enhances: number } {
  let enhances = 0
  for (;;) {
    const instanceId = lowestLevelGear(state, teamIds)
    if (instanceId === null) break
    try {
      state = simAct(data, state, { type: 'enhanceEquipment', instanceId })
      enhances++
    } catch (error) {
      if (error instanceof ActionError && OUT_OF_RESOURCE.includes(error.code)) break
      throw error
    }
  }
  return { state, enhances }
}

/** Món thường đúc được có giá gốc cao nhất (hòa: thứ tự trong items.json). */
function priciestCastable(data: GameData): string | null {
  let best: { itemId: string; price: number } | null = null
  for (const item of Object.values(data.items)) {
    if (item.category !== 'equipment' || !isRandomEquipment(data, item)) continue
    if (best === null || item.price > best.price) best = { itemId: item.id, price: item.price }
  }
  return best?.itemId ?? null
}

/**
 * Món gốc để đúc: quái đội mẫu còn ô trống thì món thường giá gốc cao nhất; không thì món gốc của món
 * kém nhất (bậc thấp nhất) đang lắp.
 */
function castTarget(data: GameData, state: GameState, teamIds: ReadonlySet<string>): string | null {
  const team = state.party.filter((monster) => teamIds.has(monster.id))
  const slots = equipmentSlotCount(data, state)
  if (team.some((monster) => monster.equipment.length < slots)) return priciestCastable(data)
  let worst: { itemId: string; rank: number } | null = null
  for (const monster of team) {
    for (const entry of monster.equipment) {
      if (entry.storage !== 'instance') continue
      const item = findEquipmentItem(data, entry.instance.baseItemId)
      if (!item || !isRandomEquipment(data, item)) continue
      const rank = EQUIPMENT_RARITIES.indexOf(entry.instance.rarity)
      if (worst === null || rank < worst.rank) worst = { itemId: item.id, rank }
    }
  }
  return worst?.itemId ?? null
}

/** Yêu đan trong túi của hệ (0 nếu hệ không phụ linh được). */
function coresOf(data: GameData, state: GameState, elementId: string): number {
  const coreId = imbueCoreItemId(data, elementId)
  return coreId === null ? 0 : getItemCount(state.inventory, coreId)
}

/** Hệ đầu của quái đội mẫu (thứ tự đội), không trùng: hệ "người chơi" muốn phụ linh / đúc. */
const teamElements = (state: GameState, teamIds: ReadonlySet<string>): string[] => [
  ...new Set(
    state.party.flatMap((m) => (teamIds.has(m.id) && m.elementIds[0] ? [m.elementIds[0]] : []))
  )
]

/**
 * Phụ linh mọi món đang lắp chưa có dòng linh hệ bằng yêu đan hệ đầu của quái mang nó (đủ yêu đan
 * thì làm, thiếu thì bỏ qua món đó); trả số lần phụ linh.
 */
export function imbueTeamGear(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; imbues: number } {
  let imbues = 0
  for (const monster of state.party) {
    const elementId = monster.elementIds[0]
    if (!teamIds.has(monster.id) || elementId === undefined) continue
    for (const entry of monster.equipment) {
      if (entry.storage !== 'instance' || imbuedElementId(data, entry.instance) !== null) continue
      if (coresOf(data, state, elementId) < imbueCost(data, entry.instance, 1).cores) continue
      try {
        state = simAct(data, state, {
          type: 'imbueEquipment',
          instanceId: entry.instance.id,
          elementId
        })
        imbues++
      } catch (error) {
        if (error instanceof ActionError && OUT_OF_RESOURCE.includes(error.code)) break
        throw error
      }
    }
  }
  return { state, imbues }
}

/**
 * Đúc trang bị theo lô castCores yêu đan cùng hệ (hệ đầu của đội mẫu trước, rồi hệ bất kỳ đủ yêu đan)
 * tới khi không hệ nào đủ yêu đan / hết tiền; trả số lần đúc.
 */
export function castWithCores(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; casts: number } {
  const cores = Math.min(FORGE_POLICY.castCores, data.config.forge.cast.maxCores)
  const itemId = castTarget(data, state, teamIds)
  let casts = 0
  if (itemId === null) return { state, casts }
  for (;;) {
    // Hệ của đội trước (dòng linh hệ có ích), rồi mọi hệ phụ linh được (đồ mới vẫn có ích).
    const order = [...teamElements(state, teamIds), ...Object.keys(data.config.forge.imbue.lineIds)]
    const elementId = order.find((e) => coresOf(data, state, e) >= cores)
    if (elementId === undefined) break
    try {
      state = simAct(data, state, { type: 'castEquipment', itemId, elementId, cores })
      casts++
    } catch (error) {
      if (error instanceof ActionError && OUT_OF_RESOURCE.includes(error.code)) break
      throw error
    }
  }
  return { state, casts }
}
