import { describe, expect, it } from 'vitest'
import { createGameData, type ConsumableItem, type GameState } from '@core'
import {
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText
} from '@core/testing'
import { feedTreasures } from './treasures'

const fruit: ConsumableItem = {
  id: 'fruit',
  category: 'consumable',
  price: 1,
  use: 'field',
  target: 'ally',
  effects: [{ type: 'addGenesAll', params: { amount: 1 } }],
  favoriteRaceIds: ['brute']
}
const raw = makeRawData()
raw.items.push(fruit)
const data = createGameData(withFixtureText(raw))

describe('feedTreasures', () => {
  it('dùng hết địa bảo, ưu tiên quái đúng khẩu vị; bỏ qua quái ngoài đội mẫu và vật phẩm khác', () => {
    const state: GameState = {
      ...makeGameState({
        seed: 1,
        party: [makeMonster({ id: 'a' }), makeMonster({ id: 'b', raceId: 'brute' })]
      }),
      inventory: makeInventory({ fruit: 3, potion: 2 })
    }
    const { state: next, used } = feedTreasures(data, state, new Set(['a', 'b']))
    expect(used).toBe(3)
    expect(next.party[1].itemUseCounts.fruit).toBe(3)
    expect(next.inventory.stacks.potion).toBe(2)
    expect(next.inventory.stacks.fruit).toBeUndefined()
  })
})
