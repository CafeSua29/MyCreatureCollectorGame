// Phản tổ (docs/rules/bloodline.md mục "Phản tổ hoàn toàn"): huyết mạch chính đạt 100% thì quái biến
// thành một loài tổ của nhóm đó (ở thị trấn, trả tiền theo level). Người chơi có thể không làm.
// Đổi loài theo luật chung changeSpecies (như tiến hóa: giữ level, EXP, gen, trait, skill, Bootleg...);
// bỏ nhóm vừa phản tổ, Gmax Factor chỉ giữ khi loài tổ có dạng Gigantamax.

import { addMilestone, assertNotBusy, changeSpecies } from '../monster'
import { canHaveGmaxFactor } from '../inventory'
import { mainBloodline, MAX_PURITY } from '../registries'
import { ActionError, levelCost, spendMoney } from '../shared'
import { dayOf, type GameData, type GameState, type NormalSpecies } from '../model'
import { assertPartyRoomAs, locateOwned } from './owned'

/**
 * Phản tổ: quái của người chơi (không fuse, không đang làm việc), huyết mạch chính 100%, loài tổ
 * thuộc nhóm của huyết mạch chính; ở thị trấn, ngoài trận, trả atavismCostPerLevel × level.
 */
export function atavize(
  data: GameData,
  state: GameState,
  { monsterId, ancestorSpeciesId }: { monsterId: string; ancestorSpeciesId: string }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const { monster } = locateOwned(state, monsterId)
  assertNotBusy(monster)
  if (monster.fused) throw new ActionError('fusedCannotAtavize', { monsterId })
  const main = mainBloodline(monster)
  if (!main || main.purity < MAX_PURITY) {
    throw new ActionError('purityTooLow', {
      monsterId,
      purity: main?.purity ?? 0,
      required: MAX_PURITY
    })
  }
  if (!data.bloodlines[main.groupId].ancestorSpeciesIds.includes(ancestorSpeciesId)) {
    throw new ActionError('notAncestor', { monsterId, speciesId: ancestorSpeciesId })
  }
  assertPartyRoomAs(data, state, { monsterId, speciesId: ancestorSpeciesId })
  const paid = spendMoney(
    state,
    levelCost(data.config.bloodline.atavismCostPerLevel, monster.level)
  )
  // Loài tổ là loài thường (kiểm tra dữ liệu bloodlines.json).
  const ancestor = data.species[ancestorSpeciesId] as NormalSpecies
  // Bỏ nhóm vừa phản tổ trước khi đổi loài; phần còn lại theo luật đổi loài chung (như tiến hóa).
  const withoutGroup = {
    ...monster,
    bloodlines: monster.bloodlines.filter((entry) => entry.groupId !== main.groupId)
  }
  const changed = changeSpecies(data, withoutGroup, { target: ancestor, rng: paid.rng })
  const atavized = addMilestone(
    data,
    {
      ...changed.monster,
      gmaxFactor: monster.gmaxFactor && canHaveGmaxFactor(data, ancestor.id)
    },
    {
      day: dayOf(state.time),
      kind: 'atavized',
      fromSpeciesId: monster.speciesId,
      toSpeciesId: ancestor.id
    }
  )
  return locateOwned({ ...paid, rng: changed.rng }, monsterId).replace(atavized)
}
