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
