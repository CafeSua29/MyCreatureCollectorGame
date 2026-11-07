// Thầy thuốc ở thị trấn (docs/rules/marks.md mục "Luật chung"): chữa sẹo, bỏ đột biến / ám ảnh theo ý
// người chơi, giá treatCostPerLevel × cấp dấu × tầng cao nhất. Thích nghi / chiến tích không bỏ được; bỏ ám ảnh bằng
// tiền thì không nhận chiến tích vượt qua nỗi sợ.

import { ActionError, spendMoney, toBig, type Decimal } from '../shared'
import { assertNotBusy, markLogEntries, noteMarkChanges, removeMark } from '../monster'
import { findMark, findMarkDef } from '../registries'
import {
  appendLog,
  dayOf,
  type GameData,
  type GameState,
  type MarkDef,
  type MarkKind,
  type Monster
} from '../model'

/** Loại dấu Thầy thuốc bỏ được (bảng theo loại: thêm loại mà thiếu mục thì TypeScript báo). */
const TREATABLE: Readonly<Record<MarkKind, boolean>> = {
  scar: true,
  mutation: true,
  trauma: true,
  adaptation: false,
  trophy: false
}

/** Thầy thuốc bỏ được dấu loại này không. */
export const isMarkTreatable = (def: MarkDef): boolean => TREATABLE[def.kind]

/** Giá chữa một dấu cấp `level`: treatCostPerLevel × cấp × tầng cao nhất (như giá cấy ghép). */
export const treatMarkCost = (data: GameData, level: number, highestFloor: number): Decimal =>
  toBig(data.config.marks.treatCostPerLevel).times(level).times(Math.max(1, highestFloor))

/** Lệnh chữa dấu: quái, id dấu, đối tượng (dấu theo đối tượng). */
export interface TreatMarkOrder {
  monsterId: string
  markId: string
  targetId?: string
}

/** Thầy thuốc: bỏ một sẹo / đột biến / ám ảnh của quái ở đội hoặc kho, trả tiền theo cấp dấu. */
export function treatMark(data: GameData, state: GameState, order: TreatMarkOrder): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const { monsterId, markId, targetId } = order
  const monster =
    state.party.find((m) => m.id === monsterId) ?? state.storage.find((m) => m.id === monsterId)
  if (!monster) throw new ActionError('monsterNotOwned', { monsterId })
  assertNotBusy(monster)
  const mark = findMark(monster, markId, targetId)
  if (!mark) throw new ActionError('markNotFound', { monsterId, markId })
  const def = findMarkDef(data, markId)
  if (!def || !isMarkTreatable(def)) throw new ActionError('markNotTreatable', { markId })
  const paid = spendMoney(state, treatMarkCost(data, mark.level, state.highestFloor))
  const removed = removeMark(monster, mark, 'treated')
  const treated = noteMarkChanges(data, removed.monster, removed.changes, dayOf(state.time))
  const update = (monsters: Monster[]): Monster[] =>
    monsters.map((m) => (m.id === monsterId ? treated : m))
  return appendLog(
    { ...paid, party: update(paid.party), storage: update(paid.storage) },
    ...markLogEntries(monsterId, removed.changes)
  )
}
