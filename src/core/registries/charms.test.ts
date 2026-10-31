// Bùa (docs/rules/dex.md mục "Bùa"): gộp hiệu ứng, kiểm tra dữ liệu, áp vào shiny và breeding.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { requireBattleStart } from '../battle'
import { makeOffspring } from '../progression'
import { addItems, canLeaveBag } from '../inventory'
import { createRng } from '../shared'
import { dataIssues, makeGameState, makeMonster, makeRawData, withFixtureText } from '../testing'
import type { GameData, Item, RawGameData } from '../model'
import { charmEffect } from './charms'

const CHARMS: Item[] = [
  { id: 'shinyCharm', category: 'charm', effects: [{ type: 'shinyChanceMultiplier', value: 3 }] },
  { id: 'luckyCharm', category: 'charm', effects: [{ type: 'shinyChanceMultiplier', value: 2 }] },
  { id: 'ovalCharm', category: 'charm', effects: [{ type: 'eggStepBonus', value: 1 }] }
]

function charmRaw(edit: (raw: RawGameData) => void = () => {}): RawGameData {
  const raw = makeRawData()
  raw.items.push(...CHARMS)
  edit(raw)
  return withFixtureText(raw)
}

const data: GameData = createGameData(charmRaw())

describe('charmEffect', () => {
  it('không có bùa = giá trị gốc; hệ số nhân với nhau, lượng cộng dồn; số lượng không nhân', () => {
    const empty = makeGameState({ seed: 1 }).inventory
    expect(charmEffect(data, empty, 'shinyChanceMultiplier')).toBe(1)
    expect(charmEffect(data, empty, 'eggStepBonus')).toBe(0)
    let bag = addItems(empty, 'shinyCharm', 2)
    expect(charmEffect(data, bag, 'shinyChanceMultiplier')).toBe(3)
    bag = addItems(addItems(bag, 'luckyCharm', 1), 'ovalCharm', 1)
    expect(charmEffect(data, bag, 'shinyChanceMultiplier')).toBe(6)
    expect(charmEffect(data, bag, 'eggStepBonus')).toBe(1)
    expect(charmEffect(data, addItems(empty, 'potion', 5), 'shinyChanceMultiplier')).toBe(1)
  })

  it('bùa không rời túi được (không bán / vứt)', () => {
    expect(canLeaveBag('charm')).toBe(false)
  })
})

describe('kiểm tra dữ liệu bùa', () => {
  it('hợp lệ; báo lỗi: rỗng, loại lạ, trùng loại, giá trị sai, trường lạ', () => {
    expect(dataIssues(charmRaw())).toEqual([])
    const bad = (effects: unknown, extra: Record<string, unknown> = {}): string =>
      dataIssues(
        charmRaw((raw) =>
          raw.items.push({ id: 'badCharm', category: 'charm', effects, ...extra } as never)
        )
      ).join('\n')
    expect(bad([])).toMatch(/effects phải là danh sách không rỗng/)
    expect(bad([{ type: 'luck', value: 1 }])).toMatch(/type là shinyChanceMultiplier/)
    expect(
      bad([
        { type: 'eggStepBonus', value: 1 },
        { type: 'eggStepBonus', value: 2 }
      ])
    ).toMatch(/"eggStepBonus" bị trùng/)
    expect(bad([{ type: 'shinyChanceMultiplier', value: 0 }])).toMatch(/value phải là số > 0/)
    expect(bad([{ type: 'eggStepBonus', value: 1.5 }])).toMatch(/số nguyên ≥ 0/)
    expect(bad([{ type: 'eggStepBonus', value: 1 }], { price: 10 })).toMatch(/"price"/)
  })
})

describe('bùa shiny', () => {
  it('nhân tỉ lệ shiny quái hoang khi bắt đầu trận', () => {
    const state = makeGameState({
      seed: 1,
      party: [makeMonster({ id: 'a' })],
      location: { type: 'floor', floor: 1 }
    })
    expect(requireBattleStart(data, state).odds?.shinyMultiplier).toBe(1)
    const charmed = { ...state, inventory: addItems(state.inventory, 'shinyCharm', 1) }
    expect(requireBattleStart(data, charmed).odds?.shinyMultiplier).toBe(3)
  })

  it('nhân tỉ lệ shiny của con breeding, tối đa 100%', () => {
    const breedData = createGameData(charmRaw((raw) => (raw.config.breeding.shinyChance = 40)))
    const father = makeMonster({ id: 'f', gender: 'male' })
    const mother = makeMonster({ id: 'm', gender: 'female' })
    const shinyCount = (multiplier: number): number =>
      Array.from({ length: 30 }, (_, seed) =>
        makeOffspring(breedData, createRng(seed), father, mother, 'c', {
          shinyMultiplier: multiplier
        })
      ).filter(([child]) => child.shinyStacks > 0).length
    expect(shinyCount(1)).toBeGreaterThan(0)
    expect(shinyCount(1)).toBeLessThan(30)
    expect(shinyCount(3)).toBe(30)
  })
})
