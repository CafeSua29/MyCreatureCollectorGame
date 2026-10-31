// Phản tổ (docs/rules/bloodline.md mục "Phản tổ hoàn toàn"): huyết mạch chính đạt 100% thì quái biến
// thành một loài tổ của nhóm đó (ở thị trấn, trả tiền theo level). Người chơi có thể không làm.

import { addMilestone, assertNotBusy, genderAfterEvolution, offerSkills } from '../monster'
import { canHaveGmaxFactor } from '../inventory'
import { keepValidBloodlines, mainBloodline, MAX_PURITY } from '../registries'
import { ActionError, levelCost, spendMoney } from '../shared'
import { dayOf, type GameData, type GameState, type Monster, type NormalSpecies } from '../model'
import { locateOwned } from './owned'

/**
 * Đổi quái thành loài tổ: loài, loài gốc, race, hệ theo loài tổ (như tiến hóa); giữ level, EXP, gen,
 * trait, skill...; skill trong learnset loài tổ có level ≤ level quái đưa qua offerSkills (còn ô thì
 * học, đủ ô thì chờ học); bỏ hướng tiến hóa chờ, nhóm vừa phản tổ và nhóm loài tổ không thuộc.
 */
function becomeAncestor(
  data: GameData,
  monster: Monster,
  {
    ancestor,
    groupId,
    gender,
    day
  }: { ancestor: NormalSpecies; groupId: string; gender: Monster['gender']; day: number }
): Monster {
  const newSkills = ancestor.learnset
    .filter((entry) => entry.level <= monster.level)
    .sort((a, b) => a.level - b.level)
    .map((entry) => entry.skillId)
  const atavized: Monster = {
    ...monster,
    gender,
    speciesId: ancestor.id,
    baseSpeciesId: ancestor.id,
    raceId: ancestor.raceId,
    elementIds: [...ancestor.elementIds],
    // Race mới không có nhân hình thì về bản thể (vẫn giữ mốc đã hóa hình), như tiến hóa.
    humanForm:
      monster.humanForm === 'human' && !data.races[ancestor.raceId].humanForm
        ? 'beast'
        : monster.humanForm,
    pendingEvolutionIds: [],
    gmaxFactor: monster.gmaxFactor && canHaveGmaxFactor(data, ancestor.id),
    bloodlines: keepValidBloodlines(
      data,
      monster.bloodlines.filter((entry) => entry.groupId !== groupId),
      ancestor.id
    )
  }
  const change = { fromSpeciesId: monster.speciesId, toSpeciesId: ancestor.id }
  const offered = offerSkills(data, atavized, newSkills).monster
  return addMilestone(data, offered, { day, kind: 'atavized', ...change })
}

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
  const paid = spendMoney(
    state,
    levelCost(data.config.bloodline.atavismCostPerLevel, monster.level)
  )
  // Loài tổ là loài thường (kiểm tra dữ liệu bloodlines.json).
  const ancestor = data.species[ancestorSpeciesId] as NormalSpecies
  const [gender, rng] = genderAfterEvolution(data, paid.rng, monster, ancestor.id)
  const atavized = becomeAncestor(data, monster, {
    ancestor,
    groupId: main.groupId,
    gender,
    day: dayOf(state.time)
  })
  return locateOwned({ ...paid, rng }, monsterId).replace(atavized)
}
