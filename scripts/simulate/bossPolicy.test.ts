import { describe, expect, it } from 'vitest'
import {
  afterBossBattle,
  afterWildBattle,
  farmAt,
  initialPolicyState,
  isPolicyStuck,
  marginLimit,
  nextFarmState,
  onFloorUnlocked,
  shouldChallengeBoss,
  type BossPolicy,
  type FarmState
} from './bossPolicy'

const levelTarget: BossPolicy = {
  type: 'levelTarget',
  marginStart: 0,
  marginStepOnLoss: 2,
  minWinsBetween: 3,
  maxMargin: 4,
  maxMarginPercent: 50
}

describe('bossPolicy: everyWins', () => {
  const policy: BossPolicy = { type: 'everyWins', wins: 2 }

  it('đánh boss sau đủ số trận thắng, thua quái hoang không đếm; margin luôn 0', () => {
    let state = initialPolicyState(policy)
    const team = { averageLevel: 1, bossLevel: 100 }
    state = afterWildBattle(afterWildBattle(state, true), false)
    expect(shouldChallengeBoss(policy, state, team)).toBe(false)
    state = afterWildBattle(state, true)
    expect(shouldChallengeBoss(policy, state, team)).toBe(true)
    state = afterBossBattle(policy, state, false)
    expect(state).toEqual({ margin: 0, winsSinceBoss: 0, attemptsThisFloor: 1 })
    expect(isPolicyStuck(policy, { ...state, margin: 1e9 }, 10)).toBe(false)
  })
})

describe('bossPolicy: levelTarget', () => {
  it('cần cả đủ số trận thắng lẫn đủ level (level boss + margin)', () => {
    const state = { margin: 2, winsSinceBoss: 3, attemptsThisFloor: 0 }
    expect(shouldChallengeBoss(levelTarget, state, { averageLevel: 12, bossLevel: 10 })).toBe(true)
    expect(shouldChallengeBoss(levelTarget, state, { averageLevel: 11.9, bossLevel: 10 })).toBe(
      false
    )
    const fewWins = { ...state, winsSinceBoss: 2 }
    expect(shouldChallengeBoss(levelTarget, fewWins, { averageLevel: 99, bossLevel: 10 })).toBe(
      false
    )
  })

  it('thua (kể cả hết lượt) thì margin tăng; vượt giới hạn thì kẹt', () => {
    let state = initialPolicyState(levelTarget)
    state = afterBossBattle(levelTarget, state, false)
    state = afterBossBattle(levelTarget, state, false)
    expect(state.margin).toBe(4)
    expect(isPolicyStuck(levelTarget, state, 2)).toBe(false)
    state = afterBossBattle(levelTarget, state, false)
    expect(state.margin).toBe(6)
    expect(isPolicyStuck(levelTarget, state, 2)).toBe(true)
  })

  it('giới hạn = max(maxMargin, maxMarginPercent% × level boss): tăng theo tầng', () => {
    expect(marginLimit(levelTarget, 2)).toBe(4)
    expect(marginLimit(levelTarget, 8)).toBe(4)
    expect(marginLimit(levelTarget, 10)).toBe(5)
    expect(marginLimit(levelTarget, 100)).toBe(50)
    const margin6 = { margin: 6, winsSinceBoss: 0, attemptsThisFloor: 0 }
    expect(isPolicyStuck(levelTarget, margin6, 10)).toBe(true)
    expect(isPolicyStuck(levelTarget, margin6, 12)).toBe(false)
    expect(marginLimit({ type: 'everyWins', wins: 1 }, 100)).toBeNull()
    expect(isPolicyStuck({ type: 'everyWins', wins: 1 }, margin6, 1)).toBe(false)
  })

  it('thắng ngay lần đầu ở tầng thì margin giảm, không dưới marginStart; thắng sau khi thua thì giữ', () => {
    const fresh = { margin: 6, winsSinceBoss: 3, attemptsThisFloor: 0 }
    expect(afterBossBattle(levelTarget, fresh, true).margin).toBe(4)
    expect(afterBossBattle(levelTarget, { ...fresh, margin: 1 }, true).margin).toBe(0)
    const retried = afterBossBattle(levelTarget, { ...fresh, attemptsThisFloor: 1 }, true)
    expect(retried.margin).toBe(6)
  })

  it('mở tầng: đếm lại từ đầu, giữ margin', () => {
    const state = { margin: 4, winsSinceBoss: 2, attemptsThisFloor: 3 }
    expect(onFloorUnlocked(state)).toEqual({ margin: 4, winsSinceBoss: 0, attemptsThisFloor: 0 })
  })
})

describe('nextFarmState', () => {
  const spec = { window: 4, dropBelow: 50, returnAt: 75 }
  const play = (state: FarmState, results: boolean[], highestFloor: number): FarmState =>
    results.reduce((s, won) => nextFarmState(spec, s, { won, highestFloor }), state)

  it('chưa đủ window trận thì giữ tầng dù thua hết', () => {
    expect(play(farmAt(5), [false, false, false], 5)).toEqual({
      floor: 5,
      recent: [false, false, false]
    })
  })

  it('tỉ lệ thắng < dropBelow thì xuống 1 tầng và đếm lại; tầng 1 thì ở lại', () => {
    expect(play(farmAt(5), [true, false, false, false], 5)).toEqual(farmAt(4))
    expect(play(farmAt(1), [false, false, false, false], 5).floor).toBe(1)
  })

  it('đang ở tầng thấp mà ≥ returnAt thì về thẳng tầng cao nhất', () => {
    expect(play(farmAt(2), [true, true, true, false], 5)).toEqual(farmAt(5))
    // Ở tầng cao nhất rồi thì giữ, cửa sổ trượt giữ đúng window trận gần nhất.
    expect(play(farmAt(5), [true, true, true, true, false], 5)).toEqual({
      floor: 5,
      recent: [true, true, true, false]
    })
  })

  it('không có farm (null): luôn tầng cao nhất', () => {
    expect(nextFarmState(null, farmAt(2), { won: false, highestFloor: 7 })).toEqual(farmAt(7))
  })
})
