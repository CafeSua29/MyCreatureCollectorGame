import { describe, expect, it } from 'vitest'
import { dataIssuesAfter } from '../testing'

/** Gán config.starter tùy ý (giả lập JSON sai, không theo kiểu). */
const issuesWithStarter = (fields: Record<string, unknown>): string[] =>
  dataIssuesAfter((raw) => Object.assign(raw.config.starter, fields))

describe('config.starter', () => {
  it('fixture hợp lệ, ô không điều kiện hợp lệ', () => {
    expect(dataIssuesAfter(() => undefined)).toEqual([])
    expect(issuesWithStarter({ slots: [{ conditions: [] }] })).toEqual([])
  })

  it('cần ít nhất một ô, ô có conditions là danh sách, không trường lạ', () => {
    expect(issuesWithStarter({ slots: [] })).toEqual(['config.starter.slots cần ít nhất một ô'])
    expect(issuesWithStarter({ slots: [{}] })).toEqual([
      'config.starter.slots[0].conditions phải là danh sách'
    ])
    expect(issuesWithStarter({ slots: [{ conditions: [], weight: 1 }] })).toEqual([
      'config.starter.slots[0]: trường "weight" không thuộc ô khởi đầu'
    ])
    expect(issuesWithStarter({ speciesIds: ['weakling'] })).toEqual([
      'config.starter: trường "speciesIds" không thuộc config'
    ])
  })

  it('điều kiện lạ, trường lạ, params sai', () => {
    const at = 'config.starter.slots[0].conditions[0]'
    expect(issuesWithStarter({ slots: [{ conditions: [{ kind: 'luck' }] }] })).toEqual([
      `${at}: điều kiện lạ "luck"`
    ])
    expect(
      issuesWithStarter({ slots: [{ conditions: [{ kind: 'evolvesToRank', rankId: 'S', x: 1 }] }] })
    ).toEqual([`${at}: trường "x" không thuộc điều kiện "evolvesToRank"`])
    expect(
      issuesWithStarter({ slots: [{ conditions: [{ kind: 'species', speciesIds: ['oak'] }] }] })
    ).toEqual([`${at}: speciesIds: "oak" không phải loài dạng đầu có tiến hóa`])
  })

  it('ô không có loài nào thỏa mọi điều kiện', () => {
    expect(
      issuesWithStarter({ slots: [{ conditions: [{ kind: 'lineHasForm', formKinds: ['gmax'] }] }] })
    ).toEqual([
      'config.starter.slots[0]: không có loài dạng đầu có tiến hóa nào thỏa mọi điều kiện'
    ])
  })

  it('level, tiền ở biên', () => {
    expect(issuesWithStarter({ level: 0, money: -1 })).toEqual([
      expect.stringMatching(/config\.starter\.level/),
      expect.stringMatching(/config\.starter\.money/)
    ])
    expect(issuesWithStarter({ level: 1, money: 0 })).toEqual([])
  })
})

describe('config.starter.unlocks, unlockOwnedLines', () => {
  const at = 'config.starter.unlocks[0]'
  const unlock = { speciesIds: ['pebble'], condition: { type: 'highestFloor' }, value: 10 }

  it('mục hợp lệ; danh sách rỗng hợp lệ', () => {
    expect(issuesWithStarter({ unlocks: [unlock] })).toEqual([])
    expect(issuesWithStarter({ unlocks: [] })).toEqual([])
  })

  it('unlocks phải là danh sách, unlockOwnedLines phải là boolean', () => {
    expect(issuesWithStarter({ unlocks: {} })).toEqual(['config.starter.unlocks phải là danh sách'])
    expect(issuesWithStarter({ unlockOwnedLines: 1 })).toEqual([
      'config.starter.unlockOwnedLines phải là true / false'
    ])
  })

  it('loài không tồn tại / không làm khởi đầu được, trường lạ', () => {
    expect(issuesWithStarter({ unlocks: [{ ...unlock, speciesIds: ['ghost'] }] })).toEqual([
      `${at}: speciesIds: loài không tồn tại "ghost"`
    ])
    expect(issuesWithStarter({ unlocks: [{ ...unlock, speciesIds: ['strongling'] }] })).toEqual([
      `${at}: "strongling" không phải loài dạng đầu có tiến hóa`
    ])
    expect(issuesWithStarter({ unlocks: [{ ...unlock, tier: 1 }] })).toEqual([
      `${at}: trường "tier" không thuộc mục mở khóa`
    ])
  })

  it('điều kiện lạ, value không dương, value vượt trần của điều kiện', () => {
    expect(issuesWithStarter({ unlocks: [{ ...unlock, condition: { type: 'luck' } }] })).toEqual([
      `${at}.condition: loại "luck" chưa có trong registry`
    ])
    expect(issuesWithStarter({ unlocks: [{ ...unlock, value: 0 }] })).toEqual([
      `${at}.value phải là số > 0, nhận 0`
    ])
    expect(
      issuesWithStarter({ unlocks: [{ ...unlock, condition: { type: 'dexPercent' }, value: 101 }] })
    ).toEqual([`${at}.value 101 vượt tiến độ tối đa 100`])
  })
})
