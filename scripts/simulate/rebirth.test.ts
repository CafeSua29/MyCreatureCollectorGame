import { describe, expect, it } from 'vitest'
import { toBig, type GameState, type Monster } from '@core'
import {
  atFloor,
  defined,
  makeData,
  makeGameState,
  makeInventory,
  makeMonster
} from '@core/testing'
import { rebirthWhenPossible } from './rebirth'

const data = makeData()
const team = new Set(['a', 'b'])

const town = (party: Monster[], pills = 5, money = 1e6): GameState => ({
  ...makeGameState({ seed: 1, party }),
  money: toBig(money),
  inventory: makeInventory({ rebirthPill: pills })
})

const levelOf = (state: GameState, id: string): number =>
  defined(state.party.find((m) => m.id === id)).level

describe('rebirthWhenPossible', () => {
  it('luân hồi một quái đội mẫu đủ điều kiện, level cao nhất trước', () => {
    const state = town([makeMonster({ id: 'a', level: 120 }), makeMonster({ id: 'b', level: 150 })])
    const { state: next, rebirths } = rebirthWhenPossible(data, state, team)
    expect(rebirths).toBe(1)
    expect(levelOf(next, 'b')).toBe(1)
    expect(levelOf(next, 'a')).toBe(120)
  })

  it('không luân hồi khi đã có quái đang luyện lại, thiếu đan, giá quá phần tiền, ngoài thị trấn', () => {
    const recovering = makeMonster({ id: 'b', level: 30, maxLevelReached: 150, rebirths: 1 })
    const ready = makeMonster({ id: 'a', level: 120 })
    expect(rebirthWhenPossible(data, town([ready, recovering]), team).rebirths).toBe(0)
    expect(rebirthWhenPossible(data, town([ready], 0), team).rebirths).toBe(0)
    // Giá lần đầu 10.000 > 30% của 30.000.
    expect(rebirthWhenPossible(data, town([ready], 5, 30000), team).rebirths).toBe(0)
    expect(rebirthWhenPossible(data, atFloor(town([ready]), 1), team).rebirths).toBe(0)
  })

  it('quái ngoài đội mẫu hoặc level chưa đủ thì bỏ qua', () => {
    const state = town([makeMonster({ id: 'x', level: 500 }), makeMonster({ id: 'a', level: 99 })])
    expect(rebirthWhenPossible(data, state, team).rebirths).toBe(0)
  })
})
