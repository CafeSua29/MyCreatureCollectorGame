// Thoái hóa (docs/rules/evolution-skills.md mục "Thoái hóa", De-digivolve của Digimon Story Cyber
// Sleuth): ở Phòng Thí Nghiệm, quái về một dạng trước trực tiếp để đi sang nhánh tiến hóa khác.
// Giữ level như tiến hóa (game này tiến hóa không về level 1); lần tự tiến hóa kế tiếp luôn hỏi.

import { preEvolutionsOf } from '../inventory'
import { addMilestone, assertNotBusy, changeSpecies } from '../monster'
import { assertPartyRoomAs, locateOwned } from '../roster'
import { ActionError, levelCost, spendMoney, type Decimal } from '../shared'
import { dayOf, type GameData, type GameState, type NormalSpecies } from '../model'

/** Lệnh thoái hóa: quái của người chơi về dạng trước `speciesId`. */
export interface DevolveOrder {
  monsterId: string
  speciesId: string
}

/** Giá thoái hóa quái ở level này: devolutionCostPerLevel × level. */
export const devolutionCost = (data: GameData, level: number): Decimal =>
  levelCost(data.config.devolutionCostPerLevel, level)

/**
 * Thoái hóa: ngoài trận, ở thị trấn, quái (đội / kho, không fuse, không đang làm việc) về dạng
 * trước trực tiếp `speciesId`; trả tiền, đổi loài bằng changeSpecies, đặt cờ vừa thoái hóa, thêm
 * mốc lý lịch "devolved".
 */
export function devolve(data: GameData, state: GameState, order: DevolveOrder): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const { monster } = locateOwned(state, order.monsterId)
  assertNotBusy(monster)
  if (monster.fused) throw new ActionError('fusedCannotDevolve', { monsterId: monster.id })
  if (!preEvolutionsOf(data, monster.speciesId).includes(order.speciesId)) {
    throw new ActionError('notPreEvolution', { monsterId: monster.id, speciesId: order.speciesId })
  }
  assertPartyRoomAs(data, state, order)
  const paid = spendMoney(state, devolutionCost(data, monster.level))
  // Dạng trước luôn là loài thường (preEvolutionsOf chỉ đọc hướng tiến hóa của loài thường).
  const species = data.species[order.speciesId] as NormalSpecies
  const changed = changeSpecies(data, monster, { target: species, rng: paid.rng })
  const devolved = addMilestone(
    data,
    { ...changed.monster, devolvedFromSpeciesId: monster.speciesId },
    {
      day: dayOf(state.time),
      kind: 'devolved',
      fromSpeciesId: monster.speciesId,
      toSpeciesId: species.id
    }
  )
  return locateOwned({ ...paid, rng: changed.rng }, monster.id).replace(devolved)
}
