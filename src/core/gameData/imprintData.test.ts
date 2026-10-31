// Kiểm tra dữ liệu dưỡng dục (docs/rules/imprinting.md): config.imprint.

import { describe, expect, it } from 'vitest'
import { dataIssuesAfter } from '../testing'
import type { ImprintConfig } from '../model'

const issuesWith = (config: Partial<ImprintConfig> | null): string[] =>
  dataIssuesAfter((raw) => {
    // Ép kiểu để thử dữ liệu sai dạng (config.imprint không phải object).
    raw.config.imprint = (
      config === null ? null : { ...raw.config.imprint, ...config }
    ) as ImprintConfig
  })

describe('config.imprint', () => {
  it('fixture hợp lệ (kể cả món ăn không hiệu ứng)', () => {
    expect(issuesWith({})).toEqual([])
  })

  it('số ngày nguyên ≥ 1, buff ≥ 0', () => {
    expect(issuesWith({ requestEveryDays: 0, fallbackDays: 1.5, maxStatPercent: -1 })).toHaveLength(
      3
    )
  })

  it('món ăn: có ít nhất một, consumable dùng ngoài trận lên quái ta, không lặp', () => {
    expect(issuesWith({ foods: [] })).toEqual([
      'config.imprint.foods phải là danh sách có ít nhất một món'
    ])
    expect(issuesWith({ foods: ['fireStone', 'poisonBomb', 'nope'] })).toHaveLength(3)
    expect(issuesWith({ foods: ['potion', 'potion'] })).toEqual(['config.imprint.foods bị lặp'])
  })

  it('trọng số: đủ mọi loại, ≥ 0, tổng > 0, không loại lạ', () => {
    const zero = { feed: 0, battle: 0, rest: 0, pet: 0 }
    expect(issuesWith({ requestWeights: zero })).toEqual([
      'config.imprint.requestWeights: tổng trọng số phải > 0'
    ])
    expect(issuesWith({ requestWeights: { ...zero, pet: 1, dance: 1 } as never })).toEqual([
      'config.imprint.requestWeights: loại yêu cầu lạ "dance"'
    ])
    expect(issuesWith({ requestWeights: { ...zero, pet: -1, feed: 2 } })).toHaveLength(1)
  })

  it('thiếu config.imprint', () => {
    expect(issuesWith(null)).toEqual(['config.imprint phải là object'])
  })
})
