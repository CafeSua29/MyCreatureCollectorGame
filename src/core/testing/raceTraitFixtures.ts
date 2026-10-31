// Fixture cho test trait race: race neutral có trait race thật (fixture chung dùng trait race
// không tác dụng `raceMark` để test khác không phải tính tới).

import { createGameData } from '../gameData'
import type { GameData, RawGameData } from '../model'
import { makeRawData, withFixtureText } from './fixtures'

/** Trait race của neutral: +20% công, +50% tốc độ; nhận sát thương −50%. */
export const NEUTRAL_RACE_TRAIT_IDS = ['neutralMight', 'neutralHide'] as const

export function makeRaceTraitRawData(): RawGameData {
  const raw = makeRawData()
  raw.traits.push(
    {
      id: 'neutralMight',
      kind: 'race',
      hooks: [{ type: 'statModifier', params: { percent: { attack: 20, speed: 50 } } }]
    },
    {
      id: 'neutralHide',
      kind: 'race',
      hooks: [{ type: 'damageTakenModifier', params: { percent: -50 } }]
    }
  )
  for (const race of raw.races) {
    if (race.id === 'neutral') race.traitIds = [...NEUTRAL_RACE_TRAIT_IDS]
  }
  return withFixtureText(raw)
}

export function makeRaceTraitData(): GameData {
  return createGameData(makeRaceTraitRawData())
}
