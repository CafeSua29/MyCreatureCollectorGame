import { describe, expect, it } from 'vitest'
import { createGameData, toBig, type GameState } from '@core'
import {
  makeGameState,
  makeInventory,
  makeMonster,
  makeRawData,
  withFixtureText
} from '@core/testing'
import { runCooking } from './cooking'

const raw = makeRawData()
const dish = (id: string): (typeof raw.items)[number] => ({
  id,
  category: 'dish',
  price: 1,
  battles: 3,
  effects: [{ type: 'expPercent', params: { percent: 10 } }]
})
raw.items.push({ id: 'herb', category: 'material', price: 1 }, dish('congee'), dish('feast'))
const recipe = (id: string, minLevel: number): (typeof raw.recipes)[number] => ({
  id,
  station: 'cooking',
  output: { itemId: id, count: 1 },
  inputs: [{ itemId: 'herb', count: 1 }],
  money: 0,
  minLevel,
  successChance: 100,
  exp: 1
})
raw.recipes.push(recipe('congee', 1), recipe('feast', 2))
const data = createGameData(withFixtureText(raw))

const townState = (stacks: Record<string, number>): GameState => ({
  ...makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] }),
  inventory: makeInventory(stacks)
})

describe('runCooking', () => {
  it('chưa ăn: nấu món cấp cao nhất dùng được rồi ăn; đang có món thì không làm gì', () => {
    const first = runCooking(data, townState({ herb: 3 }))
    expect(first).toMatchObject({ meals: 1, cooks: 1 })
    expect(first.state.cooking.meal).toEqual({ itemId: 'congee', battlesLeft: 3 })
    expect(first.state.inventory.stacks.herb).toBe(2)
    expect(runCooking(data, first.state)).toEqual({ state: first.state, meals: 0, cooks: 0 })
  })

  it('túi có món thì ăn luôn không nấu; không có nguyên liệu thì bỏ qua', () => {
    expect(runCooking(data, townState({ feast: 1, herb: 1 }))).toMatchObject({
      meals: 1,
      cooks: 0
    })
    expect(runCooking(data, townState({}))).toMatchObject({ meals: 0, cooks: 0 })
  })

  it('thiếu nguyên liệu mà cửa hàng đang bán thì mua đủ một lần nấu', () => {
    const state: GameState = {
      ...townState({}),
      money: toBig(100),
      shop: { stock: [{ storage: 'stack', itemId: 'herb' }] }
    }
    const next = runCooking(data, state)
    expect(next).toMatchObject({ meals: 1, cooks: 1 })
    expect(next.state.money.lt(state.money)).toBe(true)
    expect(runCooking(data, { ...state, money: toBig(0) })).toMatchObject({ meals: 0 })
  })
})
