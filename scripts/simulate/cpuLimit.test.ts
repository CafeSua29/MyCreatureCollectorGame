import { describe, expect, it } from 'vitest'
import { affinityMask, sharedThreadCount, windowsBoost } from './cpuLimit.mjs'

describe('sharedThreadCount', () => {
  it('không turbo: 60% số luồng (làm tròn xuống)', () => {
    expect(sharedThreadCount(12)).toBe(7)
    expect(sharedThreadCount(4)).toBe(2)
  })

  it('turbo: chia thêm hệ số turbo để Task Manager (Processor Utility) không vượt 60%', () => {
    // 12 × 0,6 / 1,61 = 4,5 → 4 luồng; 4/12 thời gian × 1,61 = 54% trên Task Manager.
    expect(sharedThreadCount(12, 1.61)).toBe(4)
    // Hệ số < 1 (CPU đang hạ xung) coi như 1, không ghim nhiều luồng hơn 60%.
    expect(sharedThreadCount(12, 0.5)).toBe(7)
  })

  it('biên: 0 / 1 luồng vẫn giữ 1 luồng; máy rất nhiều luồng chỉ ghim tới 64 luồng', () => {
    expect(sharedThreadCount(0)).toBe(1)
    expect(sharedThreadCount(1, 3)).toBe(1)
    expect(sharedThreadCount(1000)).toBe(64)
  })
})

describe('affinityMask', () => {
  it('mask là các luồng đầu', () => {
    expect(affinityMask(1)).toBe(1n)
    expect(affinityMask(5)).toBe(0b11111n)
    expect(affinityMask(64)).toBe((1n << 64n) - 1n)
  })
})

describe('windowsBoost', () => {
  it('turbo đọc lúc rảnh thấp hơn lúc tải: không dưới 1,7; cao hơn thì giữ số đọc được', () => {
    expect(windowsBoost(1.4)).toBe(1.7)
    expect(windowsBoost(1)).toBe(1.7)
    expect(windowsBoost(2.1)).toBe(2.1)
    // Máy 12 luồng: 12 × 0,6 / 1,7 = 4,2 → 4 luồng; turbo tối đa 169% vẫn chỉ 56% trên Task Manager.
    expect(sharedThreadCount(12, windowsBoost(1.42))).toBe(4)
  })
})
