import { describe, expect, it } from 'vitest'
import { makeData, makeGameState, makeMonster } from '@core/testing'
import { allocateTalents, allocateTamerTalents } from './talents'

const data = makeData()

describe('allocateTalents', () => {
  it('dùng hết điểm, nút rẻ nhất trước; chỉ quái đội mẫu', () => {
    const state = makeGameState({
      seed: 1,
      party: [
        makeMonster({ id: 'a', level: 30, maxLevelReached: 30 }),
        makeMonster({ id: 'b', level: 30, maxLevelReached: 30 })
      ]
    })
    // 6 điểm: might 1 → 2 (1 + 2), keenEye 1 (2), còn 1 không đủ might 3 (3) hay keenEye 2 (4).
    const result = allocateTalents(data, state, new Set(['a']))
    expect(result.upgrades).toBe(3)
    expect(result.state.party[0].talentRanks).toEqual({ might: 2, keenEye: 1 })
    expect(result.state.party[1].talentRanks).toEqual({})
  })

  it('0 điểm thì không nâng, không lỗi', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    expect(allocateTalents(data, state, new Set(['a'])).upgrades).toBe(0)
  })
})

describe('allocateTamerTalents', () => {
  it('dùng hết điểm ngự thú sư, nút rẻ nhất trước (hòa theo thứ tự dữ liệu)', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })], tamerRealm: 2 })
    // 4 điểm: drill 1, focus 1 (mở haste), haste 1, charm 1; còn 0.
    const result = allocateTamerTalents(data, state)
    expect(result.upgrades).toBe(4)
    expect(result.state.tamer.talentRanks).toEqual({ drill: 1, focus: 1, haste: 1, charm: 1 })
  })

  it('0 điểm thì không nâng', () => {
    const state = makeGameState({ seed: 1, party: [makeMonster({ id: 'a' })] })
    expect(allocateTamerTalents(data, state).upgrades).toBe(0)
  })
})
