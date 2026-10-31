// Sách kỹ năng ở túi đồ (docs/rules/skill-books.md): chồng sách, định danh `book`, skill có sách,
// độ hiếm theo số loài học được + power, giá, kiểm tra túi trong save.
// Fixture: strike (power 50) có ở mọi loài → common; quick (power 10) chỉ oak học → rare; flurry
// không loài nào học → legendary. Bậc: common ≥ 3 loài ×1, rare ≥ 1 ×2, legendary ×5; mốc power 100.

import { describe, expect, it } from 'vitest'
import { createGameData } from '../gameData'
import { defined, expectActionError, makeData, makeRawData } from '../testing'
import { toBig } from '../shared'
import { addBooks, createInventory, getBookCount, removeBooks } from './inventory'
import { addByRef, findItemRefProblem, getRefCount, isSameItemRef, parseItemRef } from './itemRefs'
import { itemBasePrice, itemBuyPrice, itemSellPrice } from './itemPrices'
import { isBookableSkill, skillBookPrice, skillBookRarityOf, skillLearnerCount } from './skillBooks'
import { validateInventory } from './validateInventory'

const data = makeData()
const strike = { skillId: 'strike', reusable: false }

describe('chồng sách trong túi', () => {
  it('gộp theo skill + loại; Bí kíp và Chân kinh là hai chồng', () => {
    let inventory = addBooks(createInventory(), strike, 2)
    inventory = addBooks(inventory, strike, 3)
    inventory = addBooks(inventory, { skillId: 'strike', reusable: true }, 1)
    expect(inventory.books).toEqual([
      { skillId: 'strike', reusable: false, count: 5 },
      { skillId: 'strike', reusable: true, count: 1 }
    ])
    expect(getBookCount(removeBooks(inventory, strike, 5), strike)).toBe(0)
    expect(removeBooks(inventory, strike, 5).books).toHaveLength(1)
  })

  it('kẹp ở MAX_SAFE_INTEGER; thiếu thì notEnoughBooks; số lượng sai thì malformedAction', () => {
    const max = Number.MAX_SAFE_INTEGER
    const full = addBooks(addBooks(createInventory(), strike, max), strike, 10)
    expect(getBookCount(full, strike)).toBe(max)
    expectActionError(() => removeBooks(createInventory(), strike, 1), 'notEnoughBooks', {
      have: 0,
      need: 1
    })
    expectActionError(() => addBooks(createInventory(), strike, 0), 'malformedAction')
  })
})

describe('định danh sách', () => {
  it('parse bản sạch, so sánh, đọc / thêm theo định danh', () => {
    const ref = parseItemRef(data, { storage: 'book', skillId: 'strike', reusable: true, x: 1 })
    expect(ref).toEqual({ storage: 'book', skillId: 'strike', reusable: true })
    expect(isSameItemRef(ref, { storage: 'book', skillId: 'strike', reusable: false })).toBe(false)
    const book = { storage: 'book', skillId: 'strike', reusable: true } as const
    expect(getRefCount(addByRef(createInventory(), book, 4), ref)).toBe(4)
  })

  it('lỗi: skill không tồn tại, chiêu Max, thiếu reusable', () => {
    expect(findItemRefProblem(data, { storage: 'book', skillId: 'zz', reusable: false })).toEqual({
      code: 'unknownSkill',
      skillId: 'zz'
    })
    expect(
      findItemRefProblem(data, { storage: 'book', skillId: 'maxStrike', reusable: false })?.code
    ).toBe('malformed')
    expect(findItemRefProblem(data, { storage: 'book', skillId: 'strike' })?.code).toBe('malformed')
    expectActionError(
      () => parseItemRef(data, { storage: 'book', skillId: 'zz', reusable: false }),
      'unknownSkill'
    )
  })
})

describe('skill có sách và độ hiếm', () => {
  it('chiêu Max không có sách; skill thường có', () => {
    expect(isBookableSkill(data, data.skills.maxStrike)).toBe(false)
    expect(isBookableSkill(data, data.skills.strike)).toBe(true)
  })

  it('bậc theo số loài học được', () => {
    expect(skillLearnerCount(data, 'strike')).toBeGreaterThanOrEqual(3)
    expect(skillLearnerCount(data, 'quick')).toBe(1)
    expect(skillLearnerCount(data, 'flurry')).toBe(0)
    expect(skillBookRarityOf(data, 'strike').id).toBe('common')
    expect(skillBookRarityOf(data, 'quick').id).toBe('rare')
    expect(skillBookRarityOf(data, 'flurry').id).toBe('legendary')
  })

  it('power đạt mốc thì hiếm thêm một bậc, tối đa bậc cuối', () => {
    const raw = makeRawData()
    Object.assign(defined(raw.skills.find((s) => s.id === 'strike')), { power: 100 })
    Object.assign(defined(raw.skills.find((s) => s.id === 'quick')), { power: 100 })
    Object.assign(defined(raw.skills.find((s) => s.id === 'flurry')), { power: 100 })
    const strong = createGameData(raw)
    expect(skillBookRarityOf(strong, 'strike').id).toBe('rare')
    expect(skillBookRarityOf(strong, 'quick').id).toBe('legendary')
    expect(skillBookRarityOf(strong, 'flurry').id).toBe('legendary')
  })
})

describe('giá sách', () => {
  it('(priceBase + power × pricePerPower) × hệ số bậc × tầng; Chân kinh ×10', () => {
    // strike: (200 + 50 × 5) × 1 = 450; quick: (200 + 10 × 5) × 2 = 500; growl power 0: 200 × 2.
    expect(skillBookPrice(data, strike, 1)).toEqual(toBig(450))
    expect(skillBookPrice(data, strike, 3)).toEqual(toBig(1350))
    expect(skillBookPrice(data, { skillId: 'quick', reusable: false }, 1)).toEqual(toBig(500))
    expect(skillBookPrice(data, { skillId: 'growl', reusable: false }, 1)).toEqual(toBig(400))
    expect(skillBookPrice(data, { skillId: 'strike', reusable: true }, 1)).toEqual(toBig(4500))
  })

  it('hệ số bậc lẻ: làm tròn xuống thành số nguyên', () => {
    const raw = makeRawData()
    Object.assign(defined(raw.skills.find((s) => s.id === 'strike')), { power: 45 })
    raw.config.skillBook.rarities[0].priceMultiplier = 1.5
    // (200 + 45 × 5) × 1,5 = 637,5 → 637.
    expect(skillBookPrice(createGameData(raw), strike, 1)).toEqual(toBig(637))
  })

  it('giá gốc / mua / bán theo định danh; tầng cực lớn vẫn là số hữu hạn', () => {
    const ref = { storage: 'book', ...strike } as const
    expect(itemBasePrice(data, ref, 1)).toEqual(toBig(450))
    expect(itemBuyPrice(data, ref, 1)).toEqual(toBig(450))
    expect(itemSellPrice(data, ref, 1)).toEqual(toBig(225))
    const huge = itemBasePrice(data, ref, Number.MAX_SAFE_INTEGER)
    expect(huge.isFinite()).toBe(true)
    expect(huge).toEqual(toBig(450).times(Number.MAX_SAFE_INTEGER))
  })
})

describe('kiểm tra túi trong save', () => {
  it('sách hợp lệ không báo lỗi', () => {
    const inventory = addBooks(createInventory(), strike, 2)
    expect(validateInventory(data, inventory)).toEqual([])
  })

  it('báo: không phải danh sách, skill không tồn tại / không có sách, reusable sai, số lượng, trùng', () => {
    expect(validateInventory(data, { ...createInventory(), books: {} })).toEqual([
      'inventory.books phải là danh sách'
    ])
    const issues = validateInventory(data, {
      ...createInventory(),
      books: [
        { skillId: 'zz', reusable: false, count: 1 },
        { skillId: 'maxStrike', reusable: false, count: 1 },
        { skillId: 'strike', reusable: 'yes', count: 0 },
        { skillId: 'quick', reusable: true, count: 1 },
        { skillId: 'quick', reusable: true, count: 2 },
        null
      ]
    })
    expect(issues).toEqual([
      'inventory.books[0].skillId: skill không tồn tại "zz"',
      'inventory.books[1].skillId: skill "maxStrike" không có sách kỹ năng',
      'inventory.books[2].reusable phải là true / false',
      'inventory.books[2].count phải là số nguyên ≥ 1, nhận 0',
      'inventory.books[4]: trùng chồng sách (cùng skill và loại)',
      'inventory.books[5]: không phải chồng sách hợp lệ'
    ])
  })
})
