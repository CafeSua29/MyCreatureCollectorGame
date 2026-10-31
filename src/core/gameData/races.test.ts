import { describe, expect, it } from 'vitest'
import { createGameData } from './gameData'
import { raceMatches, raceMatchesAny, raceRefIds } from '../registries'
import { dataIssues, defined, makeRawData, uniformStats, withFixtureText } from '../testing'
import type { RawGameData } from '../model'

/** Fixture thêm race "pup" (cùng nhóm neutral, chỉ ghi phần khác nhóm) và nhóm "wildGroup". */
function withPup(edit: (raw: RawGameData) => void = () => {}): RawGameData {
  const raw = makeRawData()
  const neutralGroup = defined(raw.raceGroups[0], 'nhóm neutral')
  neutralGroup.traitIds = ['raceMark']
  raw.raceGroups.push({
    id: 'wildGroup',
    statBias: uniformStats(1),
    growth: uniformStats(0.1),
    traitIds: ['raceMark'],
    breedsWith: [],
    partnerSkillId: neutralGroup.partnerSkillId,
    humanForm: false
  })
  raw.races.push({ id: 'pup', groupId: 'neutralGroup', statBias: uniformStats(2) })
  raw.races.push({ id: 'wolfling', groupId: 'wildGroup' })
  edit(raw)
  return withFixtureText(raw)
}

describe('resolveRaces (race lấy mặc định từ nhóm)', () => {
  it('trường thiếu lấy của nhóm; trait riêng trước trait nhóm, không trùng', () => {
    const data = createGameData(withPup())
    const pup = defined(data.races.pup)
    expect(pup.groupId).toBe('neutralGroup')
    expect(pup.statBias).toEqual(uniformStats(2))
    expect(pup.growth).toEqual(defined(data.raceGroups.neutralGroup).growth)
    expect(pup.humanForm).toBe(true)
    expect(pup.traitIds).toEqual(['raceMark'])
    expect(defined(data.races.wolfling).humanForm).toBe(false)
  })

  it('breedsWith: cùng nhóm, nhóm breed chéo, race ghi thêm (hai chiều)', () => {
    const plain = createGameData(withPup())
    expect(defined(plain.races.pup).breedsWith).toContain('neutral')
    expect(defined(plain.races.pup).breedsWith).toContain('pup')
    expect(defined(plain.races.wolfling).breedsWith).not.toContain('pup')
    const linked = createGameData(
      withPup((raw) => (defined(raw.raceGroups[2], 'nhóm wild').breedsWith = ['neutralGroup']))
    )
    expect(defined(linked.races.pup).breedsWith).toContain('wolfling')
    expect(defined(linked.races.wolfling).breedsWith).toContain('pup')
    const extra = createGameData(
      withPup((raw) => (defined(raw.races.at(-1), 'wolfling').breedsWith = ['pup']))
    )
    expect(defined(extra.races.pup).breedsWith).toContain('wolfling')
    expect(defined(extra.races.neutral).breedsWith).not.toContain('wolfling')
  })

  it('báo lỗi: nhóm sai, trùng id nhóm, trường lạ, breedsWith không tồn tại', () => {
    expect(dataIssues(withPup())).toEqual([])
    const issues = dataIssues(
      withPup((raw) => {
        raw.races.push({ id: 'lost', groupId: 'nope' })
        raw.races.push({ id: 'wildGroup', groupId: 'wildGroup' })
        raw.races.push({ id: 'odd', groupId: 'wildGroup', color: 'red' } as never)
        defined(raw.races[0]).breedsWith = ['ghost']
        defined(raw.raceGroups[2]).breedsWith = ['nowhere']
      })
    ).join('\n')
    expect(issues).toMatch(/Race "lost": groupId không phải nhóm race "nope"/)
    expect(issues).toMatch(/Race "wildGroup": trùng id với nhóm race/)
    expect(issues).toMatch(/"color"/)
    expect(issues).toMatch(/breedsWith có race \/ nhóm không tồn tại "ghost"/)
    expect(issues).toMatch(/Nhóm race "wildGroup": breedsWith có nhóm không tồn tại "nowhere"/)
  })
})

describe('raceMatches (tham chiếu race hoặc nhóm)', () => {
  const data = createGameData(withPup())

  it('khớp chính race hoặc nhóm của race', () => {
    expect(raceMatches(data, 'pup', 'pup')).toBe(true)
    expect(raceMatches(data, 'pup', 'neutralGroup')).toBe(true)
    expect(raceMatches(data, 'pup', 'neutral')).toBe(false)
    expect(raceMatches(data, 'wolfling', 'neutralGroup')).toBe(false)
    expect(raceMatches(data, 'missing', 'neutralGroup')).toBe(false)
  })

  it('raceMatchesAny: rỗng thì không khớp; raceRefIds gồm cả race lẫn nhóm', () => {
    expect(raceMatchesAny(data, 'pup', [])).toBe(false)
    expect(raceMatchesAny(data, 'pup', ['brute', 'neutralGroup'])).toBe(true)
    const ids = Object.keys(raceRefIds(data))
    expect(ids).toEqual(expect.arrayContaining(['pup', 'neutral', 'neutralGroup', 'wildGroup']))
  })
})
