import { describe, expect, it } from 'vitest'
import { expectActionError, makeData, makeInventory } from '../testing'
import {
  addByRef,
  describeItemRefProblem,
  findItemRefProblem,
  getRefCount,
  isSameItemRef,
  parseItemRef,
  removeByRef
} from './itemRefs'
import type { ItemRef } from '../model'

const data = makeData()

const potion: ItemRef = { storage: 'stack', itemId: 'potion' }
const fastCrystal: ItemRef = { storage: 'crystal', traitId: 'fast', level: 2 }

describe('parseItemRef', () => {
  it('nhận định danh hợp lệ, bỏ trường thừa', () => {
    expect(parseItemRef(data, { ...potion, extra: 1 })).toEqual(potion)
    expect(parseItemRef(data, { ...fastCrystal, itemId: 'potion' })).toEqual(fastCrystal)
    const huge = { storage: 'crystal', traitId: 'cursed', level: Number.MAX_SAFE_INTEGER }
    expect(parseItemRef(data, huge)).toEqual(huge)
  })

  it('sai dạng: malformedAction', () => {
    const malformed: unknown[] = [
      null,
      'potion',
      { itemId: 'potion' },
      { storage: 'instance', itemId: 'potion' },
      { storage: 'stack', itemId: 5 },
      // Tinh thể không phải item gộp chồng theo id.
      { storage: 'stack', itemId: 'traitCrystal' },
      { storage: 'crystal', traitId: 'fast', level: 0 },
      { storage: 'crystal', traitId: 'fast', level: 1.5 },
      { storage: 'crystal', traitId: 'fast', level: Number.MAX_SAFE_INTEGER + 1 },
      { storage: 'crystal', traitId: 'fast' },
      // Trait shiny / boss không có tinh thể.
      { storage: 'crystal', traitId: 'shiny', level: 1 },
      { storage: 'crystal', traitId: 'bossBlood', level: 1 }
    ]
    for (const value of malformed) {
      expectActionError(() => parseItemRef(data, value), 'malformedAction')
    }
  })

  it('item / trait không tồn tại', () => {
    expectActionError(
      () => parseItemRef(data, { storage: 'stack', itemId: 'nope' }),
      'unknownItem',
      { itemId: 'nope' }
    )
    // Tên thuộc tính của Object (không phải id) cũng là không tồn tại.
    expectActionError(
      () => parseItemRef(data, { storage: 'stack', itemId: 'toString' }),
      'unknownItem'
    )
    expectActionError(
      () => parseItemRef(data, { storage: 'crystal', traitId: 'nope', level: 1 }),
      'unknownTrait',
      { traitId: 'nope' }
    )
  })

  it('findItemRefProblem / describeItemRefProblem cho kiểm tra save', () => {
    expect(findItemRefProblem(data, potion)).toBeNull()
    const problem = findItemRefProblem(data, { storage: 'stack', itemId: 'nope' })
    expect(describeItemRefProblem(problem ?? { code: 'malformed', detail: '' })).toBe(
      'vật phẩm không tồn tại "nope"'
    )
  })
})

describe('isSameItemRef', () => {
  it('so theo storage và khóa', () => {
    expect(isSameItemRef(potion, { storage: 'stack', itemId: 'potion' })).toBe(true)
    expect(isSameItemRef(potion, { storage: 'stack', itemId: 'ball' })).toBe(false)
    expect(isSameItemRef(fastCrystal, { ...fastCrystal })).toBe(true)
    expect(isSameItemRef(fastCrystal, { ...fastCrystal, level: 1 })).toBe(false)
    expect(isSameItemRef(potion, fastCrystal)).toBe(false)
    expect(isSameItemRef(fastCrystal, potion)).toBe(false)
  })
})

describe('đọc / thêm / bớt theo định danh', () => {
  const inventory = makeInventory({ potion: 3 }, [{ traitId: 'fast', level: 2, count: 4 }])

  it('đọc số lượng của cả hai phần túi', () => {
    expect(getRefCount(inventory, potion)).toBe(3)
    expect(getRefCount(inventory, fastCrystal)).toBe(4)
    expect(getRefCount(inventory, { storage: 'stack', itemId: 'ball' })).toBe(0)
  })

  it('thêm và bớt, không sửa túi cũ', () => {
    const added = addByRef(addByRef(inventory, potion, 2), fastCrystal, 1)
    expect(added.stacks.potion).toBe(5)
    expect(getRefCount(added, fastCrystal)).toBe(5)
    const removed = removeByRef(removeByRef(added, potion, 5), fastCrystal, 5)
    expect(removed.stacks).toEqual({})
    expect(removed.crystals).toEqual([])
    expect(inventory.stacks.potion).toBe(3)
  })

  it('không đủ thì báo lỗi đúng phần túi', () => {
    expectActionError(() => removeByRef(inventory, potion, 4), 'notEnoughItem')
    expectActionError(() => removeByRef(inventory, fastCrystal, 5), 'notEnoughCrystals')
  })
})
