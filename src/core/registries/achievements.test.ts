// Thành tựu (docs/rules/achievements.md): bộ đếm, tiến độ từng loại điều kiện, bậc theo danh sách và
// bậc lặp không trần, hiệu ứng danh hiệu.

import { describe, expect, it } from 'vitest'
import { FIXTURE_TITLE_IDS, makeData, makeGameState, makeMonster, uniformStats } from '../testing'
import type { AchievementCondition, AchievementDef, GameState } from '../model'
import {
  ACHIEVEMENT_CONDITIONS,
  achievementProgress,
  achievementTierRewards,
  achievementTierValue,
  achievementTiersReached
} from './achievements'
import { bumpStat, countCaught, newGameStats } from './gameStats'
import { titleMultiplier, titlePercent } from './titles'

const data = makeData()

const achievementOf = (
  condition: AchievementCondition,
  extra: Partial<AchievementDef> = {}
): AchievementDef => ({
  id: 'test',
  condition,
  tiers: [
    { value: 1, rewards: {} },
    { value: 10, rewards: { moneyPerFloor: 5 } }
  ],
  ...extra
})

const progressOf = (condition: AchievementCondition, state: GameState): number =>
  achievementProgress(data, state, achievementOf(condition))

describe('bộ đếm chung', () => {
  it('bắt đầu mọi khóa = 0; bumpStat cộng, 0 / âm trả bộ đếm cũ, dừng ở MAX_SAFE_INTEGER', () => {
    const stats = newGameStats()
    expect(Object.values(stats).every((value) => value === 0)).toBe(true)
    const bumped = bumpStat(stats, 'battlesWon')
    expect(bumped.battlesWon).toBe(1)
    expect(stats.battlesWon).toBe(0)
    expect(bumpStat(stats, 'breeds', 0)).toBe(stats)
    expect(bumpStat(stats, 'breeds', -3)).toBe(stats)
    const huge = bumpStat({ ...stats, fusions: Number.MAX_SAFE_INTEGER - 1 }, 'fusions', 10)
    expect(huge.fusions).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('countCaught: + quái bắt, + shiny bắt theo quái shiny', () => {
    const stats = countCaught(newGameStats(), [
      makeMonster({ id: 'a' }),
      makeMonster({ id: 'b', shinyStacks: 2 })
    ])
    expect(stats).toMatchObject({ monstersCaught: 2, shinyCaught: 1 })
    expect(countCaught(stats, [])).toBe(stats)
  })
})

describe('tiến độ theo loại điều kiện', () => {
  const base = makeGameState({ seed: 1, highestFloor: 7 })

  it('stat đọc bộ đếm', () => {
    const state = { ...base, stats: { ...base.stats, bossesDefeated: 42 } }
    expect(progressOf({ type: 'stat', key: 'bossesDefeated' }, state)).toBe(42)
  })

  it('Dex: số loài sở hữu, %, số loài shiny', () => {
    const state = { ...base, dex: { ...base.dex, owned: ['weakling'], shinyOwned: ['weakling'] } }
    expect(progressOf({ type: 'dexOwned' }, state)).toBe(1)
    expect(progressOf({ type: 'dexPercent' }, state)).toBeGreaterThan(0)
    expect(progressOf({ type: 'dexPercent' }, state)).toBeLessThanOrEqual(100)
    expect(progressOf({ type: 'shinySpecies' }, state)).toBe(1)
    expect(progressOf({ type: 'dexOwned' }, base)).toBe(0)
  })

  it('tầng cao nhất, cảnh giới, tầng tháp, huy hiệu, bậc đấu trường', () => {
    const state: GameState = {
      ...base,
      tamer: { ...base.tamer, realm: 4 },
      tower: { highest: 12 },
      trainers: {
        ...base.trainers,
        arenaRank: 9,
        gyms: [
          { floor: 10, elementId: 'fire', trainerCount: 2, progress: 0, wins: 2 },
          { floor: 20, elementId: 'grass', trainerCount: 2, progress: 1, wins: 0 }
        ]
      }
    }
    expect(progressOf({ type: 'highestFloor' }, state)).toBe(7)
    expect(progressOf({ type: 'tamerRealm' }, state)).toBe(4)
    expect(progressOf({ type: 'towerFloor' }, state)).toBe(12)
    expect(progressOf({ type: 'gymBadges' }, state)).toBe(1)
    expect(progressOf({ type: 'arenaRank' }, state)).toBe(9)
  })

  it('ownSpecies: số loài trong danh sách đã sở hữu; trần = độ dài danh sách', () => {
    const condition = { type: 'ownSpecies', speciesIds: ['weakling', 'strongling'] } as const
    const state = { ...base, dex: { ...base.dex, owned: ['strongling', 'twig'] } }
    expect(progressOf(condition, state)).toBe(1)
    const { type: _type, ...params } = condition
    expect(ACHIEVEMENT_CONDITIONS.ownSpecies.maxProgress(params, data)).toBe(2)
    expect(ACHIEVEMENT_CONDITIONS.dexPercent.maxProgress({}, data)).toBe(100)
    expect(ACHIEVEMENT_CONDITIONS.dexOwned.maxProgress({}, data)).toBeNull()
  })

  it('aptitude: số quái đội + kho có tư chất từ bậc', () => {
    const tiers = Object.keys(data.aptitudeTiers)
    const top = tiers[tiers.length - 1]
    // Fixture: gen tối đa quái hoang 10 mỗi chỉ số, bậc cao nhất từ tỉ lệ 2 (gen 20); gen 0 = bậc
    // thấp nhất.
    const strong = makeMonster({ id: 'a', genes: uniformStats(20) })
    const weak = makeMonster({ id: 'b', genes: uniformStats(0) })
    const state = { ...base, party: [strong], storage: [weak] }
    expect(progressOf({ type: 'aptitude', tierId: top }, state)).toBe(1)
    expect(progressOf({ type: 'aptitude', tierId: tiers[0] }, state)).toBe(2)
  })

  it('speciesRank: số loài đã sở hữu có phẩm cấp từ bậc', () => {
    const ranks = Object.keys(data.speciesRanks)
    const state = { ...base, dex: { ...base.dex, owned: ['weakling', 'strongling'] } }
    expect(progressOf({ type: 'speciesRank', rankId: ranks[0] }, state)).toBe(2)
    expect(progressOf({ type: 'speciesRank', rankId: ranks[ranks.length - 1] }, state)).toBe(0)
  })
})

describe('bậc', () => {
  const plain = achievementOf({ type: 'stat', key: 'battlesWon' })
  const endless = achievementOf(
    { type: 'stat', key: 'battlesWon' },
    { repeat: { factor: 3, rewards: { moneyPerFloor: 99 } } }
  )

  it('giá trị theo danh sách; hết danh sách không có repeat = null', () => {
    expect(achievementTierValue(plain, 0)).toBe(1)
    expect(achievementTierValue(plain, 1)).toBe(10)
    expect(achievementTierValue(plain, 2)).toBeNull()
  })

  it('bậc lặp: ⌈trước × factor⌉, ít nhất trước + 1; thưởng repeat.rewards', () => {
    expect([2, 3, 4].map((i) => achievementTierValue(endless, i))).toEqual([30, 90, 270])
    const slow = achievementOf(
      { type: 'stat', key: 'battlesWon' },
      { repeat: { factor: 1.01, rewards: {} } }
    )
    expect([2, 3].map((i) => achievementTierValue(slow, i))).toEqual([11, 12])
    expect(achievementTierRewards(endless, 1)).toEqual({ moneyPerFloor: 5 })
    expect(achievementTierRewards(endless, 7)).toEqual({ moneyPerFloor: 99 })
    expect(achievementTierRewards(plain, 7)).toEqual({})
  })

  it('số bậc đã đạt: 0, biên đúng giá trị, bậc lặp không trần, số cực lớn dừng ở MAX_SAFE_INTEGER', () => {
    expect(achievementTiersReached(plain, 0)).toBe(0)
    expect(achievementTiersReached(plain, 1)).toBe(1)
    expect(achievementTiersReached(plain, 9.99)).toBe(1)
    expect(achievementTiersReached(plain, 1e9)).toBe(2)
    expect(achievementTiersReached(endless, 89)).toBe(3)
    expect(achievementTiersReached(endless, 90)).toBe(4)
    // 10 × 3^k ≤ MAX_SAFE_INTEGER ↔ k ≤ 31: 2 bậc danh sách + 31 bậc lặp.
    expect(achievementTiersReached(endless, Number.MAX_SAFE_INTEGER)).toBe(33)
    expect(achievementTierValue(endless, 33)).toBeNull()
  })
})

describe('danh hiệu', () => {
  const state = makeGameState({ seed: 1 })
  const wearing = (titleId: string | null): GameState['titles'] => ({
    owned: titleId ? [titleId] : [],
    active: titleId
  })

  it('không đeo: 0 % / hệ số 1; đeo: % theo kênh, kênh không có = 0', () => {
    expect(titlePercent(data, state.titles, 'expPercent')).toBe(0)
    expect(titleMultiplier(data, state.titles, 'expPercent')).toBe(1)
    const veteran = wearing(FIXTURE_TITLE_IDS.veteran)
    expect(titlePercent(data, veteran, 'expPercent')).toBe(50)
    expect(titleMultiplier(data, veteran, 'expPercent')).toBe(1.5)
    expect(titlePercent(data, veteran, 'moneyPercent')).toBe(0)
  })

  it('id không còn trong dữ liệu: không có tác dụng', () => {
    expect(titlePercent(data, wearing('removed'), 'expPercent')).toBe(0)
  })
})
