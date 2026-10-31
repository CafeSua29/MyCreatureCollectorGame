import { describe, expect, it } from 'vitest'
import { makeData, makeInventory } from '../testing'
import { validateInventory } from './validateInventory'

const data = makeData()
const issuesOf = (value: unknown): string => validateInventory(data, value).join('\n')

describe('validateInventory: hợp lệ', () => {
  it('túi rỗng, túi có chồng và tinh thể, số lượng tối đa', () => {
    expect(validateInventory(data, makeInventory())).toEqual([])
    const full = makeInventory({ potion: 1, ball: Number.MAX_SAFE_INTEGER }, [
      { traitId: 'fast', level: 1, count: 1 },
      { traitId: 'fast', level: 2, count: Number.MAX_SAFE_INTEGER },
      { traitId: 'cursed', level: 1, count: 3 }
    ])
    expect(validateInventory(data, full)).toEqual([])
  })
})

describe('validateInventory: lỗi cấu trúc', () => {
  it.each([null, 5, [], 'túi'])('túi không phải object (%s)', (value) => {
    expect(issuesOf(value)).toBe('inventory không hợp lệ')
  })

  it('thiếu stacks / crystals, hoặc sai kiểu', () => {
    const text = issuesOf({ stacks: [], crystals: {} })
    expect(text).toMatch(/inventory\.stacks không hợp lệ/)
    expect(text).toMatch(/inventory\.crystals phải là danh sách/)
    expect(issuesOf({})).toMatch(/inventory\.stacks không hợp lệ/)
  })
})

describe('validateInventory: chồng theo id', () => {
  it('id không tồn tại, item không gộp theo id (tinh thể), số lượng sai', () => {
    const text = issuesOf(makeInventory({ ghost: 1, traitCrystal: 1, potion: 0, ball: 1.5 }))
    expect(text).toMatch(/inventory\.stacks: vật phẩm không tồn tại "ghost"/)
    expect(text).toMatch(/"traitCrystal" \(traitCrystal\) không gộp chồng theo id/)
    expect(text).toMatch(/inventory\.stacks\.potion phải là số nguyên ≥ 1/)
    expect(text).toMatch(/inventory\.stacks\.ball phải là số nguyên ≥ 1/)
  })

  it.each([Infinity, NaN, null, '3', Number.MAX_SAFE_INTEGER + 1])(
    'số lượng %s bị từ chối',
    (n) => {
      expect(issuesOf({ stacks: { potion: n }, crystals: [] })).toMatch(
        /inventory\.stacks\.potion phải là số nguyên ≥ 1/
      )
    }
  )
})

describe('validateInventory: tinh thể', () => {
  it('chồng không phải object, trait không tồn tại, trait shiny / boss không có tinh thể', () => {
    const text = issuesOf({
      stacks: {},
      crystals: [
        null,
        { traitId: 'ghost', level: 1, count: 1 },
        { traitId: 'shiny', level: 1, count: 1 },
        { traitId: 'bossBlood', level: 1, count: 1 }
      ]
    })
    expect(text).toMatch(/inventory\.crystals\[0\]: không phải chồng tinh thể hợp lệ/)
    expect(text).toMatch(/inventory\.crystals\[1\]\.traitId: trait không tồn tại "ghost"/)
    expect(text).toMatch(/crystals\[2\]\.traitId: trait loại "shiny" không có tinh thể/)
    expect(text).toMatch(/crystals\[3\]\.traitId: trait loại "boss" không có tinh thể/)
  })

  it('cấp và số lượng phải là số nguyên an toàn ≥ 1; trùng trait + cấp báo lỗi', () => {
    const text = issuesOf({
      stacks: {},
      crystals: [
        { traitId: 'fast', level: 0, count: 1 },
        { traitId: 'fast', level: 1, count: Infinity },
        { traitId: 'slow', level: 2, count: 1 },
        { traitId: 'slow', level: 2, count: 4 }
      ]
    })
    expect(text).toMatch(/inventory\.crystals\[0\]\.level phải là số nguyên ≥ 1/)
    expect(text).toMatch(/inventory\.crystals\[1\]\.count phải là số nguyên ≥ 1/)
    expect(text).toMatch(/inventory\.crystals\[3\]: trùng chồng tinh thể/)
    expect(text).not.toMatch(/crystals\[2\]: trùng/)
  })
})
