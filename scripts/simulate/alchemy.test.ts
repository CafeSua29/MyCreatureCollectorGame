import { describe, expect, it } from 'vitest'
import { advanceTime, createGameData, newDwellingState, type GameState } from '@core'
import {
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText
} from '@core/testing'
import { runAlchemy } from './alchemy'

const raw = makeRawData()
raw.items.push(
  { id: 'herb', category: 'material', price: 1 },
  {
    id: 'seedHerb',
    category: 'seed',
    price: 1,
    growDays: 1,
    harvest: [{ itemId: 'herb', min: 2, max: 2 }]
  }
)
raw.recipes.push({
  id: 'potion',
  output: { itemId: 'potion', count: 1 },
  inputs: [{ itemId: 'herb', count: 1 }],
  money: 0,
  minLevel: 1,
  successChance: 100,
  exp: 1
})
const data = createGameData(withFixtureText(raw))

describe('runAlchemy', () => {
  it('trồng hạt giống vào ô trống, luyện hết nguyên liệu; ô chín thì thu hoạch', () => {
    const state: GameState = {
      ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
      inventory: makeInventory({ herb: 3, seedHerb: 1 }),
      dwelling: newDwellingState(data)
    }
    const first = runAlchemy(data, state)
    expect(first.crafts).toBe(3)
    expect(first.state.inventory.stacks.potion).toBe(3)
    expect(first.state.dwelling.plots[0]?.seedItemId).toBe('seedHerb')
    const later = advanceTime(data, first.state, 48)
    const second = runAlchemy(data, later)
    expect(second.harvests).toBe(1)
    expect(second.crafts).toBe(2)
  })
})
