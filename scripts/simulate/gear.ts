// "Người chơi" của script mô phỏng lắp trang bị rơi được (mục "Chơi liên tục" ở simulation.md):
// chấm điểm cả bộ đồ trên quái (bậc cao trước, rồi số thưởng bộ, rồi giá gốc; docs/rules/equipment-sets.md);
// còn ô trống thì lắp món làm điểm cao nhất, đủ ô thì đổi một món khi điểm cả bộ đồ tăng ngặt (điểm
// luôn tăng nên không đổi qua đổi lại mãi). Chỉ dùng action public qua @core.

import {
  EQUIPMENT_RARITIES,
  canWearEquipment,
  equipmentSlotCount,
  findEquipmentItem,
  STAT_NAMES,
  computeStats,
  equipmentSetStates,
  type EquippedItem,
  type EquipmentInstance,
  type GameData,
  type GameState,
  type StatPercentSourceId
} from '@core'
import { simAct } from './events'

/** Điểm một bậc hiếm (lớn hơn mọi phần điểm khác của một món). */
const RARITY_SCORE = 1_000_000
/** Điểm mỗi thưởng bộ (nhỏ hơn một bậc: món bậc cao vẫn thắng món chỉ góp bộ). */
const SET_SCORE = RARITY_SCORE / 2

/** Tổng số thưởng bộ (lần kích hoạt + mốc) của các món đang lắp. */
const setBonusCount = (data: GameData, equipment: readonly EquippedItem[]): number =>
  equipmentSetStates(data, equipment).reduce((sum, state) => sum + state.activeBonuses, 0)

/** Điểm riêng một món: bậc rồi giá gốc. */
function itemScore(data: GameData, instance: EquipmentInstance): number {
  const price = findEquipmentItem(data, instance.baseItemId)?.price ?? 0
  return EQUIPMENT_RARITIES.indexOf(instance.rarity) * RARITY_SCORE + price
}

/** Điểm cả bộ đồ trên quái: tổng điểm từng món + điểm thưởng bộ. */
function loadoutScore(data: GameData, equipment: readonly EquippedItem[]): number {
  const items = equipment.reduce(
    (sum, entry) => sum + (entry.storage === 'instance' ? itemScore(data, entry.instance) : 0),
    0
  )
  return items + setBonusCount(data, equipment) * SET_SCORE
}

/** Số thưởng bộ trung bình mỗi quái `monsterIds` trong đội (cột setBonuses). */
export function averageSetBonuses(
  data: GameData,
  state: GameState,
  monsterIds: ReadonlySet<string>
): number {
  const team = state.party.filter((m) => monsterIds.has(m.id))
  if (team.length === 0) return 0
  return (
    team.reduce((sum, monster) => sum + setBonusCount(data, monster.equipment), 0) / team.length
  )
}

/** Một bước lắp đồ: lắp món vào ô trống (slotIndex null) hoặc thay món ở ô slotIndex. */
interface GearMove {
  instanceId: string
  slotIndex: number | null
}

/**
 * Bước lắp đồ tốt nhất cho bộ đồ `equipment`: còn ô trống thì lắp món làm điểm cả bộ đồ cao nhất;
 * đủ ô thì thay món ở ô làm điểm tăng nhiều nhất, chỉ khi tăng ngặt. Không có bước nào thì null.
 */
function bestMove(
  data: GameData,
  {
    equipment,
    candidates,
    slots
  }: {
    equipment: readonly EquippedItem[]
    candidates: readonly EquipmentInstance[]
    slots: number
  }
): GearMove | null {
  const asEntry = (instance: EquipmentInstance): EquippedItem => ({ storage: 'instance', instance })
  const options: { move: GearMove; after: EquippedItem[] }[] = []
  for (const candidate of candidates) {
    if (equipment.length < slots) {
      const move = { instanceId: candidate.id, slotIndex: null }
      options.push({ move, after: [...equipment, asEntry(candidate)] })
      continue
    }
    equipment.forEach((entry, index) => {
      if (entry.storage !== 'instance') return
      const after = equipment.map((other, i) => (i === index ? asEntry(candidate) : other))
      options.push({ move: { instanceId: candidate.id, slotIndex: index }, after })
    })
  }
  let best: { move: GearMove; score: number } | null = null
  for (const { move, after } of options) {
    const score = loadoutScore(data, after)
    if (!best || score > best.score) best = { move, score }
  }
  if (!best) return null
  if (best.move.slotIndex !== null && best.score <= loadoutScore(data, equipment)) return null
  return best.move
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
      const candidates = state.inventory.equipment.filter((instance) =>
        canWearEquipment(data, monster, instance)
      )
      const move = bestMove(data, { equipment: monster.equipment, candidates, slots })
      if (!move) break
      if (move.slotIndex !== null) {
        state = simAct(data, state, {
          type: 'unequipItem',
          monsterId: id,
          slotIndex: move.slotIndex
        })
      }
      state = simAct(data, state, {
        type: 'equipItem',
        monsterId: id,
        item: { storage: 'instance', instanceId: move.instanceId }
      })
    }
  }
  return state
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
