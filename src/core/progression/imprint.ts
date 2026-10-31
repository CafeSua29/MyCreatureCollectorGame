// Dưỡng dục theo state (docs/rules/imprinting.md): việc theo ngày (sinh yêu cầu, chốt buff) và
// action vuốt ve. Logic trên từng quái ở monster/imprint.ts.

import { ActionError } from '../shared'
import { advanceImprint, fulfillImprint, isImprintRequested } from '../monster'
import { locateOwned } from '../roster'
import { dayOf, type DayEvent, type GameData, type GameState, type Monster } from '../model'

/** Việc theo ngày: mọi quái đang dưỡng dục trong đội / kho tới hạn thì sinh yêu cầu mới / chốt. */
export function imprintOneDay(data: GameData, state: GameState, events: DayEvent[]): GameState {
  const day = dayOf(state.time)
  let { rng } = state
  const advance = (monster: Monster): Monster => {
    let next: Monster
    ;[next, rng] = advanceImprint(data, rng, { monster, day, events })
    return next
  }
  const party = state.party.map(advance)
  const storage = state.storage.map(advance)
  return { ...state, rng, party, storage }
}

/** Vuốt ve quái đang đòi vuốt ve (ngoài trận, miễn phí, quái trong đội hoặc kho). */
export function petMonster(state: GameState, monsterId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const { monster, replace } = locateOwned(state, monsterId)
  if (!isImprintRequested(monster, { kind: 'pet' })) {
    throw new ActionError('imprintNotRequested', { monsterId, kind: 'pet' })
  }
  return replace(fulfillImprint(monster, { kind: 'pet' }))
}
