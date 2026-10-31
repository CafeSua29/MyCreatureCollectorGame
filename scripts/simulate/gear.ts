// "Người chơi" của script mô phỏng lắp trang bị rơi được (mục "Chơi liên tục" ở simulation.md):
// luật đơn giản, bậc cao trước (cùng bậc thì giá gốc cao trước); đủ ô thì thay món kém nhất nếu món
// trong túi tốt hơn. Chỉ dùng action public qua @core.

import {
  EQUIPMENT_RARITIES,
  canWearEquipment,
  equipmentSlotCount,
  findEquipmentItem,
  STAT_NAMES,
  computeStats,
  type EquipmentInstance,
  type GameData,
  type GameState,
  type Monster,
  type StatPercentSourceId
} from '@core'
import { simAct } from './events'

/** Điểm so sánh món: bậc (cao hơn tốt hơn), rồi giá gốc. */
function gearScore(data: GameData, instance: EquipmentInstance): number {
  const price = findEquipmentItem(data, instance.baseItemId)?.price ?? 0
  return EQUIPMENT_RARITIES.indexOf(instance.rarity) * 1_000_000 + price
}

/** Lắp đồ tốt nhất trong túi cho các quái `monsterIds` (theo thứ tự đội). */
export function autoEquip(
  data: GameData,
  state: GameState,
  monsterIds: ReadonlySet<string>
): GameState {
  const slots = equipmentSlotCount(data, state)
  for (const id of state.party.map((m) => m.id)) {
    if (!monsterIds.has(id)) continue
    for (;;) {
      const monster = state.party.find((m) => m.id === id)
      if (!monster) break
      const next = bestCandidate(data, state, monster)
      if (!next) break
      if (monster.equipment.length < slots) {
        state = equip(data, state, id, next.id)
        continue
      }
      const worst = worstSlot(data, monster)
      if (worst === null || worst.score >= gearScore(data, next)) break
      state = simAct(data, state, {
        type: 'unequipItem',
        monsterId: id,
        slotIndex: worst.index
      })
      state = equip(data, state, id, next.id)
    }
  }
  return state
}

const equip = (
  data: GameData,
  state: GameState,
  monsterId: string,
  instanceId: string
): GameState =>
  simAct(data, state, {
    type: 'equipItem',
    monsterId,
    item: { storage: 'instance', instanceId }
  })

/** Món tốt nhất trong túi quái lắp được. */
function bestCandidate(
  data: GameData,
  state: GameState,
  monster: Monster
): EquipmentInstance | null {
  let best: EquipmentInstance | null = null
  for (const instance of state.inventory.equipment) {
    if (!canWearEquipment(data, monster, instance)) continue
    if (!best || gearScore(data, instance) > gearScore(data, best)) best = instance
  }
  return best
}

/** Ô có món kém nhất (chỉ xét trang bị). */
function worstSlot(data: GameData, monster: Monster): { index: number; score: number } | null {
  let worst: { index: number; score: number } | null = null
  monster.equipment.forEach((entry, index) => {
    if (entry.storage !== 'instance') return
    const score = gearScore(data, entry.instance)
    if (!worst || score < worst.score) worst = { index, score }
  })
  return worst
}

/**
 * Trung bình % chỉ số của một nguồn (trung bình 6 chỉ số: trang bị, hồn tinh...) của các quái
 * `monsterIds` trong đội.
 */
export function averageSourcePercent(
  data: GameData,
  state: GameState,
  monsterIds: ReadonlySet<string>,
  source: StatPercentSourceId
): number {
  const team = state.party.filter((m) => monsterIds.has(m.id))
  if (team.length === 0) return 0
  const total = team.reduce((sum, monster) => {
    const percent = computeStats(data, monster).percentBySource[source]
    return sum + STAT_NAMES.reduce((acc, stat) => acc + percent[stat], 0) / STAT_NAMES.length
  }, 0)
  return total / team.length
}
