import { describe, expect, it } from 'vitest'
import { checkMilestones, countMilestonesReached } from './milestones'

describe('countMilestonesReached', () => {
  it('danh sách rồi gấp đôi mốc cuối mãi', () => {
    const count = (value: number): number => countMilestonesReached([2, 5, 10], value)
    expect(count(0)).toBe(0)
    expect(count(1)).toBe(0)
    expect(count(2)).toBe(1)
    expect(count(9)).toBe(2)
    expect(count(10)).toBe(3)
    expect(count(20)).toBe(4)
    expect(count(39)).toBe(4)
    expect(count(40)).toBe(5)
  })

  it('giá trị cực lớn: hữu hạn, tăng kiểu log; danh sách rỗng luôn 0', () => {
    expect(countMilestonesReached([1], Number.MAX_SAFE_INTEGER)).toBe(53)
    expect(countMilestonesReached([], 1_000_000)).toBe(0)
  })
})

describe('checkMilestones', () => {
  it('số nguyên tăng dần, mốc đầu ≥ min', () => {
    expect(checkMilestones([2, 5], 'm', 1)).toEqual([])
    expect(checkMilestones([0], 'm', 1)).toEqual(['m[0] phải là số nguyên ≥ 1, nhận 0'])
    expect(checkMilestones('x', 'm', 1)).toEqual(['m phải là danh sách'])
  })
})
