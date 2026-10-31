import { describe, expect, it } from 'vitest'
import { makeData } from '@core/testing'
import { runSafari, type SafariRow } from './safari'
import type { SafariPolicy } from './scenarios'
import { safariTable } from './report'

const data = makeData()

describe('runSafari', () => {
  const run = (policy: SafariPolicy): SafariRow =>
    runSafari(data, { floor: 2, policy, visits: 3, seed: 5 })

  it('đủ lượt vào khu, mỗi lượt 20 lần gặp hoặc hết 30 bóng; chạy lại ra cùng kết quả', () => {
    const row = run('balls')
    expect(row.visits).toBe(3)
    expect(row.ballsThrown).toBeLessThanOrEqual(3 * 30)
    expect(row.encounters).toBeLessThanOrEqual(3 * 20)
    expect(row.encounters).toBeGreaterThan(0)
    expect(row.caught).toBeLessThanOrEqual(row.ballsThrown)
    expect(row.fee).toBe(500 * 2)
    expect(run('balls')).toEqual(row)
  })

  it('rareOnly chỉ bắt loài catchRate < 30 (loài khác bỏ đi)', () => {
    const row = run('rareOnly')
    expect(row.encounters).toBeGreaterThan(0)
    expect(row.catchRateSum).toBeLessThan(30 * Math.max(1, row.caught))
  })

  it('bảng: trung bình mỗi lượt vào khu, phí trên mỗi quái', () => {
    const table = safariTable([run('rock'), run('bait')])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0][1]).toBe('rock')
  })
})
