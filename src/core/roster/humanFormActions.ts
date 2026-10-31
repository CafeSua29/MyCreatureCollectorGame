// Action hóa hình (docs/rules/human-form.md): hóa hình ở thị trấn (1 Hóa Hình Đan + tiền theo level,
// chắc chắn thành công), đổi nhân hình ↔ bản thể ngoài trận (miễn phí, ở đâu cũng được).

import { addMilestone, humanFormBlocker, humanFormCost, isFainted } from '../monster'
import { removeItems } from '../inventory'
import { ActionError, malformedAction, spendMoney } from '../shared'
import { dayOf, type GameData, type GameState } from '../model'
import { locateOwned } from './owned'

/** Hóa hình: quái trong đội hoặc kho, không gục, không trọng thương; thành nhân hình ngay. */
export function takeHumanForm(data: GameData, state: GameState, monsterId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const { monster } = locateOwned(state, monsterId)
  if (isFainted(data, monster)) throw new ActionError('monsterFainted', { monsterId })
  if (monster.injuryBattlesLeft > 0) {
    throw new ActionError('injured', { monsterId, battlesLeft: monster.injuryBattlesLeft })
  }
  const reason = humanFormBlocker(data, monster)
  if (reason) throw new ActionError('cannotTakeHumanForm', { monsterId, reason })
  const paid = spendMoney(state, humanFormCost(data, monster))
  const inventory = removeItems(paid.inventory, data.config.humanForm.pillItemId, 1)
  const formed = addMilestone(
    data,
    { ...monster, humanForm: 'human' },
    { day: dayOf(state.time), kind: 'humanFormed' }
  )
  return locateOwned({ ...paid, inventory }, monsterId).replace(formed)
}

/**
 * Đổi nhân hình ↔ bản thể (ngoài trận). Chưa hóa hình, hoặc race không cho nhân hình (sau phản tổ),
 * thì không đổi sang nhân hình được.
 */
export function setHumanForm(
  data: GameData,
  state: GameState,
  { monsterId, form }: { monsterId: string; form: 'beast' | 'human' }
): GameState {
  if (form !== 'beast' && form !== 'human') throw malformedAction(`dạng lạ: ${String(form)}`)
  if (state.battle) throw new ActionError('inBattle')
  const { monster, replace } = locateOwned(state, monsterId)
  if (monster.humanForm === 'locked') throw new ActionError('humanFormNotTaken', { monsterId })
  if (form === 'human' && !data.races[monster.raceId].humanForm) {
    throw new ActionError('humanFormNotTaken', { monsterId })
  }
  if (monster.humanForm === form) throw new ActionError('humanFormUnchanged', { monsterId, form })
  return replace({ ...monster, humanForm: form })
}
