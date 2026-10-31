// Kiểm tra dữ liệu trait race (mục Trait ở stats-traits.md): traitIds của race, loại `race`,
// không nhóm loại trừ, phải có race dùng, không tung cho quái hoang.

import { describe, expect, it } from 'vitest'
import { dataIssues, dataIssuesAfter, defined, makeRaceTraitRawData } from '../testing'
import type { RawGameData, RawRace, TraitKind, WildConfig } from '../model'

const issuesAfter = (edit: (raw: RawGameData) => void): string[] =>
  dataIssuesAfter(edit, { regenerateText: true })

const race = (raw: RawGameData, id: string): RawRace =>
  defined(raw.races.find((entry) => entry.id === id))

describe('kiểm tra dữ liệu trait race', () => {
  it('fixture trait race hợp lệ; một trait race dùng chung cho nhiều race được', () => {
    expect(dataIssues(makeRaceTraitRawData())).toEqual([])
    // Fixture chung: neutral và brute cùng dùng raceMark.
    expect(issuesAfter(() => {})).toEqual([])
  })

  it('race phải có ít nhất một trait race', () => {
    expect(issuesAfter((raw) => (race(raw, 'neutral').traitIds = []))).toContain(
      'Race "neutral": traitIds phải là danh sách không rỗng'
    )
    expect(issuesAfter((raw) => Reflect.deleteProperty(race(raw, 'brute'), 'traitIds'))).toContain(
      'Race "brute": traitIds phải là danh sách không rỗng'
    )
  })

  it('trait không tồn tại, sai loại hoặc bị lặp thì báo lỗi', () => {
    const issues = issuesAfter((raw) => {
      race(raw, 'neutral').traitIds = ['raceMark', 'raceMark', 'missing', 'fast']
    })
    expect(issues).toContain('Race "neutral": traitIds lặp "raceMark"')
    expect(issues).toContain('Race "neutral": traitIds có trait không tồn tại "missing"')
    expect(issues).toContain('Race "neutral": trait "fast" phải là loại "race", nhận "positive"')
  })

  it('trait race không có nhóm loại trừ và phải có race dùng', () => {
    const issues = issuesAfter((raw) => {
      raw.traits.push(
        { id: 'orphan', kind: 'race', hooks: [{ type: 'regen', params: { percent: 1 } }] },
        {
          id: 'grouped',
          kind: 'race',
          exclusiveGroup: 'speed',
          hooks: [{ type: 'regen', params: { percent: 1 } }]
        }
      )
      race(raw, 'brute').traitIds = ['grouped']
    })
    expect(issues).toContain('Trait "orphan": trait race nhưng không race nào dùng')
    expect(issues).toContain('Trait "grouped": trait race không được có exclusiveGroup')
  })

  it('config.wild.traitKindWeights không được chứa loại không tung cho quái hoang', () => {
    for (const kind of ['race', 'shiny', 'boss'] satisfies TraitKind[]) {
      const issues = issuesAfter(
        (raw) => (raw.config.wild.traitKindWeights = { positive: 1, [kind]: 1 })
      )
      expect(issues).toContain(
        `config.wild.traitKindWeights: loại trait "${kind}" không hợp lệ hoặc không tung cho quái hoang`
      )
    }
    expect(
      issuesAfter((raw) => (raw.config.wild.traitKindWeights = { positive: 1, rare: 1 }))
    ).toEqual([])
  })

  it('config.wild.traitKindWeights: trọng số ≥ 0, ít nhất một loại > 0', () => {
    const issuesFor = (weights: unknown): string =>
      issuesAfter((raw) => {
        // Ép kiểu để thử dữ liệu sai (JSON có thể sai kiểu).
        raw.config.wild.traitKindWeights = weights as WildConfig['traitKindWeights']
      }).join('\n')
    expect(issuesFor({ positive: -1 })).toMatch(/traitKindWeights\.positive/)
    expect(issuesFor({ positive: 0, negative: 0 })).toMatch(/ít nhất một loại/)
    expect(issuesFor({})).toMatch(/ít nhất một loại/)
    expect(issuesFor(['positive'])).toMatch(/traitKindWeights/)
    expect(issuesFor({ unknown: 1 })).toMatch(/"unknown"/)
    expect(issuesFor({ positive: 0, rare: 2 })).toBe('')
  })
})
