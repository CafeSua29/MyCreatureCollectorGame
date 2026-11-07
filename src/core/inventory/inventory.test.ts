import { describe, expect, it } from 'vitest'
import { ActionError } from '../shared'
import { makeInventory, expectActionError } from '../testing'
import {
  addCrystals,
  addItems,
  createInventory,
  getCrystalCount,
  getItemCount,
  removeCrystals,
  removeItems
} from './inventory'

const MAX = Number.MAX_SAFE_INTEGER

describe('createInventory', () => {
  it('chép số lượng theo id (không dùng chung object), chưa có tinh thể', () => {
    const starter = { ball: 5, potion: 3 }
    const inventory = createInventory(starter)
    expect(inventory).toEqual({
      stacks: { ball: 5, potion: 3 },
      crystals: [],
      books: [],
      equipment: [],
      souls: [],
      spirits: [],
      stickers: []
    })
    expect(inventory.stacks).not.toBe(starter)
    expect(createInventory()).toEqual({
      stacks: {},
      crystals: [],
      books: [],
      equipment: [],
      souls: [],
      spirits: [],
      stickers: []
    })
  })
})

describe('item gộp chồng theo id', () => {
  const bag = makeInventory({ potion: 2 })

  it('getItemCount: có thì trả số lượng, không có thì 0', () => {
    expect(getItemCount(bag, 'potion')).toBe(2)
    expect(getItemCount(bag, 'ball')).toBe(0)
  })

  it('addItems: cộng vào chồng cũ hoặc tạo chồng mới, không sửa túi cũ', () => {
    expect(addItems(bag, 'potion', 1).stacks).toEqual({ potion: 3 })
    expect(addItems(bag, 'ball', 1).stacks).toEqual({ potion: 2, ball: 1 })
    expect(bag.stacks).toEqual({ potion: 2 })
  })

  it('addItems: kẹp ở MAX_SAFE_INTEGER, phần thừa mất', () => {
    expect(addItems(makeInventory({ ball: MAX - 1 }), 'ball', 1).stacks.ball).toBe(MAX)
    expect(addItems(makeInventory({ ball: MAX }), 'ball', 1).stacks.ball).toBe(MAX)
    expect(addItems(makeInventory({ ball: MAX }), 'ball', MAX).stacks.ball).toBe(MAX)
  })

  it('removeItems: bớt đúng số; về 0 thì xóa chồng', () => {
    expect(removeItems(bag, 'potion', 1).stacks).toEqual({ potion: 1 })
    expect(removeItems(bag, 'potion', 2).stacks).toEqual({})
    expect(removeItems(makeInventory({ ball: MAX }), 'ball', MAX).stacks).toEqual({})
    expect(bag.stacks).toEqual({ potion: 2 })
  })

  it('removeItems: không đủ hoặc không có thì ném ActionError', () => {
    expectActionError(() => removeItems(bag, 'potion', 3), 'notEnoughItem', {
      itemId: 'potion',
      have: 2,
      need: 3
    })
    expect(() => removeItems(bag, 'ball', 1)).toThrow(ActionError)
  })

  it.each([0, -1, 1.5, NaN, Infinity, MAX + 1])(
    'số lượng %s không hợp lệ: ActionError',
    (count) => {
      expectActionError(() => addItems(bag, 'potion', count), 'malformedAction')
      expect(() => removeItems(bag, 'potion', count)).toThrow(ActionError)
    }
  )
})

describe('tinh thể trait gộp theo traitId + level', () => {
  const fast1 = { traitId: 'fast', level: 1 }
  const fast2 = { traitId: 'fast', level: 2 }
  const bag = makeInventory({}, [{ traitId: 'fast', level: 1, count: 2 }])

  it('getCrystalCount: phân biệt theo cả trait lẫn cấp', () => {
    expect(getCrystalCount(bag, fast1)).toBe(2)
    expect(getCrystalCount(bag, fast2)).toBe(0)
    expect(getCrystalCount(bag, { traitId: 'slow', level: 1 })).toBe(0)
  })

  it('addCrystals: cùng trait + cấp thì cộng, khác cấp thì chồng mới; không sửa túi cũ', () => {
    expect(addCrystals(bag, fast1, 3).crystals).toEqual([{ traitId: 'fast', level: 1, count: 5 }])
    expect(addCrystals(bag, fast2, 1).crystals).toEqual([
      { traitId: 'fast', level: 1, count: 2 },
      { traitId: 'fast', level: 2, count: 1 }
    ])
    expect(bag.crystals).toEqual([{ traitId: 'fast', level: 1, count: 2 }])
  })

  it('addCrystals: kẹp ở MAX_SAFE_INTEGER; cấp rất lớn vẫn là một chồng riêng', () => {
    const full = makeInventory({}, [{ traitId: 'fast', level: 1, count: MAX }])
    expect(getCrystalCount(addCrystals(full, fast1, 10), fast1)).toBe(MAX)
    const huge = { traitId: 'fast', level: MAX }
    expect(getCrystalCount(addCrystals(bag, huge, 1), huge)).toBe(1)
  })

  it('removeCrystals: bớt đúng số; về 0 thì xóa chồng', () => {
    expect(removeCrystals(bag, fast1, 1).crystals).toEqual([
      { traitId: 'fast', level: 1, count: 1 }
    ])
    expect(removeCrystals(bag, fast1, 2).crystals).toEqual([])
  })

  it('removeCrystals: không đủ, sai cấp, hoặc số lượng sai thì ném ActionError', () => {
    expectActionError(() => removeCrystals(bag, fast1, 3), 'notEnoughCrystals', {
      traitId: 'fast',
      level: 1
    })
    expect(() => removeCrystals(bag, fast2, 1)).toThrow(ActionError)
    expectActionError(() => removeCrystals(bag, fast1, 0), 'malformedAction')
    expectActionError(() => addCrystals(bag, fast1, -2), 'malformedAction')
  })
})
