// Mô phỏng dấu ấn (marks.ts): chữa sẹo / ám ảnh khi rẻ, đo số dấu và % chỉ số từ dấu của đội mẫu.

import { describe, expect, it } from 'vitest'
import { toBig, type GameState, type MarkInstance, type Monster } from '@core'
import { makeGameState, makeMarkData, makeMonster } from '@core/testing'
import { tallyTeamMarks, treatTeamMarks } from './marks'

const data = makeMarkData()
const origin = { source: 'faint', floor: 1 } as const
const mark = (markId: string, extra: Partial<MarkInstance> = {}): MarkInstance => ({
  markId,
  level: 1,
  origin,
  ...extra
})
const town = (party: Monster[], money: number): GameState => ({
  ...makeGameState({ seed: 1, party }),
  money: toBig(money)
})
const team = new Set(['a'])

describe('chữa dấu xấu', () => {
  it('chữa sẹo / ám ảnh của đội mẫu khi giá ≤ 5% tiền; giữ đột biến và quái ngoài đội mẫu', () => {
    const marks = [mark('limp'), mark('springLegs'), mark('fearSpecies', { targetId: 'weakling' })]
    const state = town(
      [makeMonster({ id: 'a', marks }), makeMonster({ id: 'b', marks: [mark('limp')] })],
      1e6
    )
    const { state: after, treated } = treatTeamMarks(data, state, team)
    expect(treated).toBe(2)
    expect(after.party[0].marks.map((m) => m.markId)).toEqual(['springLegs'])
    expect(after.party[1].marks).toHaveLength(1)
  })

  it('đắt quá ngân sách thì giữ', () => {
    const state = town([makeMonster({ id: 'a', marks: [mark('limp', { level: 10 })] })], 1000)
    expect(treatTeamMarks(data, state, team).treated).toBe(0)
  })
})

describe('đo dấu ấn', () => {
  it('đếm theo loại và % chỉ số trung bình (chỉ số khác HP) của đội mẫu', () => {
    const state = town([makeMonster({ id: 'a', marks: [mark('limp'), mark('stoneHorn')] })], 0)
    const tally = tallyTeamMarks(data, state, team)
    expect(tally.monsters).toBe(1)
    expect(tally.byKind).toMatchObject({ scar: 1, mutation: 1, trauma: 0 })
    // −10% tốc độ, +10% thủ trên 5 chỉ số khác HP.
    expect(tally.statPercent).toBeCloseTo(0)
  })
})
