// "Người chơi" mua và dùng sách kỹ năng (mục "Sách kỹ năng" ở simulation.md): ở thị trấn mua Bí kíp
// trên kệ sách mà đội mẫu dùng được (đủ tiền); sau mỗi trận, mỗi cuốn trong
// túi dạy cho quái đội mẫu học được mà skill mạnh hơn skill yếu nhất đang biết (còn ô thì học luôn);
// Bí kíp mỗi cuốn một quái, Chân kinh dạy mọi quái hợp. Đủ ô thì skill vào chờ học, phần chọn skill
// chờ học (handlePendingSkills) thay skill yếu nhất như skill học theo level.

import {
  isSkillBookCompatible,
  itemBuyPrice,
  type GameData,
  type GameState,
  type Monster
} from '@core'
import { simAct, shopStock } from './events'

/** Quái nên học skill này: tương thích, chưa biết / chưa chờ, còn ô hoặc mạnh hơn skill yếu nhất. */
function wantsSkill(data: GameData, monster: Monster, skillId: string): boolean {
  if (monster.skillIds.includes(skillId) || monster.pendingSkillIds.includes(skillId)) return false
  if (!isSkillBookCompatible(data, monster, skillId)) return false
  if (monster.skillIds.length < data.config.maxSkills) return true
  const weakest = Math.min(...monster.skillIds.map((id) => data.skills[id].power))
  return data.skills[skillId].power > weakest
}

/** Có quái đội mẫu nên học skill này. */
const teamWants = (
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  skillId: string
): boolean => state.party.some((m) => teamIds.has(m.id) && wantsSkill(data, m, skillId))

/**
 * Ở thị trấn: mua mỗi Bí kíp trên kệ sách một cuốn nếu đội mẫu nên học và đủ tiền (theo thứ tự trên
 * kệ). Trả state mới và số cuốn đã mua.
 */
export function buySkillBooks(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; bought: number } {
  let bought = 0
  for (const entry of shopStock(state)) {
    if (entry.storage !== 'book' || !teamWants(data, state, teamIds, entry.skillId)) continue
    if (state.money.lt(itemBuyPrice(data, entry, state.highestFloor))) continue
    state = simAct(data, state, { type: 'buyItem', item: entry, count: 1 })
    bought++
  }
  return { state, bought }
}

/** Dùng sách trong túi lên quái đội mẫu; trả state mới và số lần dùng sách. */
export function teachSkillBooks(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; used: number } {
  let used = 0
  for (const book of state.inventory.books) {
    let left = book.reusable ? Infinity : book.count
    for (const { id } of state.party) {
      if (left === 0) break
      const monster = state.party.find((m) => m.id === id)
      if (!monster || !teamIds.has(id) || !wantsSkill(data, monster, book.skillId)) continue
      const item = { storage: 'book', skillId: book.skillId, reusable: book.reusable } as const
      state = simAct(data, state, { type: 'useSkillBook', monsterId: id, item })
      used++
      left--
    }
  }
  return { state, used }
}
