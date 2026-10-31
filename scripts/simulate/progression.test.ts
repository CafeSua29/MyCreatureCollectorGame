import { describe, expect, it } from 'vitest'
import { createGameData, type GameData } from '@core'
import { makeRawData, withFixtureText } from '@core/testing'
import type { BossPolicy } from './bossPolicy'
import type { TeamSpec } from './scenarios'
import { raiseGenesToFloor, runProgression, type ProgressionOptions } from './progression'
import { buildTeam, geneValue } from './team'

/** Fixture chỉ còn một biome: map mọi tầng tung ra đều là biome đó (test không phụ thuộc RNG map). */
function singleBiomeData(biomeId: string): GameData {
  const raw = makeRawData()
  raw.biomes = raw.biomes.filter((biome) => biome.id === biomeId)
  return createGameData(withFixtureText(raw))
}

// "field": không có boss ngẫu nhiên; "lair": luôn gặp boss ngẫu nhiên đúng loài boss tầng.
const data = singleBiomeData('field')
const lairData = singleBiomeData('lair')

// Fixture: level ảnh hưởng ít, boss tầng nhân ×2–5, nên đội "mạnh" cần gen cao.
const team = (levelOffset: number, genes: number | 'wild' = 'wild'): TeamSpec => ({
  id: 't',
  members: [{ speciesId: 'weakling', levelOffset, genes, traits: [] }],
  skipBoss: false,
  masteryExpPerFloor: null
})

const everyWins = (wins: number): BossPolicy => ({ type: 'everyWins', wins })

const levelTarget = (overrides: Partial<Extract<BossPolicy, { type: 'levelTarget' }>> = {}) =>
  ({
    type: 'levelTarget',
    marginStart: 0,
    marginStepOnLoss: 2,
    minWinsBetween: 1,
    maxMargin: 60,
    maxMarginPercent: 0,
    ...overrides
  }) as const

const options = (overrides: Partial<ProgressionOptions> = {}): ProgressionOptions => ({
  team: team(0, 1000),
  teamIds: ['t'],
  bossPolicy: { type: 'everyWins', wins: 2 },
  farm: null,
  sweep: null,
  maxBattles: 200,
  genesFollowFloor: false,
  pillModes: [true],
  growthModes: [false],
  usePills: true,
  // Test cũ đo nhịp không fuse / breeding; test growth tự bật.
  growth: false,
  toFloor: 3,
  maxTurns: 100,
  maxTurnsBoss: 100,
  seed: 4,
  ...overrides
})

describe('runProgression', () => {
  it('growth: bắt quái, fuse, breeding chạy hết bằng action hợp lệ, đếm vào từng tầng', () => {
    const result = runProgression(data, options({ growth: true, maxBattles: 120 }))
    expect(result.growth).toBe(true)
    for (const unlock of result.unlocks) {
      const g = unlock.growth
      expect(g.fuses + g.fuseFails).toBeLessThanOrEqual(g.captures + 1)
      expect(g.teamLost).toBeLessThanOrEqual(g.fuseFails)
    }
  }, 30_000)

  it('everyWins: đội mạnh mở lần lượt từng tầng; mỗi tầng ít nhất `wins` trận quái hoang', () => {
    const result = runProgression(data, options())
    expect(result.stuckAtFloor).toBeNull()
    expect(result.unlocks.map((unlock) => unlock.floor)).toEqual([1, 2, 3])
    // Map không có boss ngẫu nhiên: mỗi tầng phải thắng đủ 2 trận rồi mới đánh boss tầng.
    for (const unlock of result.unlocks) {
      expect(unlock.wildBattles).toBeGreaterThanOrEqual(2)
      expect(unlock.bossAttempts).toBeGreaterThanOrEqual(1)
    }
    const battles = result.unlocks.reduce((sum, u) => sum + u.wildBattles + u.bossAttempts, 0)
    expect(battles).toBe(result.totalBattles)
    // Không có farm: mọi trận quái hoang ở tầng cao nhất lúc đó.
    expect(result.unlocks.map((u) => u.farmBattles)).toEqual(
      result.unlocks.map((u) => (u.wildBattles > 0 ? { [u.floor]: u.wildBattles } : {}))
    )
    expect(result.unlocks[0].bossWin).toMatchObject({ margin: 0 })
    expect(runProgression(data, options())).toEqual(result)
  })

  it('map luôn gặp boss tầng ngẫu nhiên: mở tầng ngay trong trận quái hoang đầu tiên', () => {
    const result = runProgression(lairData, options())
    expect(result.unlocks[1]).toMatchObject({ wildBattles: 1, bossAttempts: 0, bossWin: null })
  })

  it('everyWins 0: đánh boss tầng ngay từ trận đầu', () => {
    const result = runProgression(data, options({ bossPolicy: everyWins(0), toFloor: 1 }))
    expect(result.unlocks).toEqual([
      expect.objectContaining({ floor: 1, wildBattles: 0, bossAttempts: 1 })
    ])
  })

  it('đội quá yếu bị kẹt khi hết maxBattles', () => {
    const result = runProgression(data, options({ team: team(-100), maxBattles: 6 }))
    expect(result.totalBattles).toBe(6)
    expect(result.stuckAtFloor).toBe(1)
    expect(result.stuckReason).toBe('maxBattles')
    expect(result.unlocks).toEqual([])
  }, 20_000) // nhiều trận (cả trận NPC mỗi ngày, trainers.ts): chậm khi cả bộ test chạy song song

  it('đội lên level thật theo EXP (tiến hóa, học skill đi qua action hợp lệ)', () => {
    // weakling tiến hóa thành strongling ở level 10; tầng N cho quái level 2N − 1.
    const result = runProgression(data, options({ team: team(0, 1000), toFloor: 6 }))
    const levels = result.unlocks.map((unlock) => unlock.averageLevel)
    expect(levels).toHaveLength(6)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
    expect(levels[5]).toBeGreaterThan(levels[0])
  })

  it('đếm tổng trận / lượt theo loại trận; trận boss dùng trần lượt riêng maxTurnsBoss', () => {
    const result = runProgression(
      data,
      options({ team: team(0), bossPolicy: everyWins(1), maxTurnsBoss: 1, maxBattles: 8 })
    )
    const { wild, boss } = result.battleTotals
    expect(wild.battles + boss.battles).toBe(result.totalBattles)
    expect(boss.battles).toBeGreaterThan(0)
    // Trần 1 lượt: mỗi trận boss tối đa 1 lượt; trận quái hoang vẫn theo maxTurns.
    expect(boss.turns).toBeLessThanOrEqual(boss.battles)
    expect(wild.turns).toBeGreaterThan(wild.battles)
  }, 20_000) // nhiều trận (cả trận NPC mỗi ngày, trainers.ts): chậm khi cả bộ test chạy song song

  it('levelTarget: farm tới khi level trung bình ≥ level boss tầng + margin rồi mới đánh boss', () => {
    // Fixture: quái level 1 cho 0 EXP (expFactor 0,5), tầng 3 quái level 5, boss tầng 3 level 6.
    // Đội bắt đầu level 2 (= boss tầng 1) nên phải farm ở tầng 3 tới level 6.
    const policy = levelTarget()
    const result = runProgression(data, options({ bossPolicy: policy, maxBattles: 400 }))
    expect(result.stuckReason).toBeNull()
    expect(result.unlocks.map((u) => u.floor)).toEqual([1, 2, 3])
    expect(result.unlocks[0].bossWin).toMatchObject({ margin: 0, level: { average: 2 } })
    const win = result.unlocks[2].bossWin
    expect(win?.margin).toBe(0)
    expect(win?.level.average).toBeGreaterThanOrEqual(6)
    expect(win?.level.min).toBeLessThanOrEqual(win?.level.max ?? 0)
    expect(win?.bossMultiplier).toBeGreaterThan(1)
    expect(result.unlocks[2].wildBattles).toBeGreaterThan(1)
  })

  it('levelTarget: thua boss thì margin tăng; vượt maxMargin thì dừng ("kẹt")', () => {
    // Gen quái hoang: thắng được quái hoang, đủ level nhưng thua boss ×2–5.
    const policy = levelTarget({ maxMargin: 1 })
    const result = runProgression(data, options({ team: team(0), bossPolicy: policy }))
    expect(result.stuckReason).toBe('maxMargin')
    expect(result.finalMargin).toBe(2)
    expect(result.stuckAtFloor).toBe(1)
    expect(result.battleTotals.boss.battles).toBe(1)
  })

  it('farm: đổi tầng farm theo tỉ lệ thắng, số trận quái hoang chia theo tầng khớp tổng', () => {
    // Ngưỡng ép đổi tầng sau mỗi trận (xét "xuống" trước "về"): luôn xuống 1 tầng cho tới tầng 1.
    const farm = { window: 1, dropBelow: 101, returnAt: 0 }
    const result = runProgression(
      data,
      options({ bossPolicy: levelTarget(), farm, toFloor: 3, maxBattles: 400 })
    )
    expect(result.stuckReason).toBeNull()
    const floor3 = result.unlocks[2]
    expect(Object.keys(floor3.farmBattles).sort()).toEqual(['1', '2', '3'])
    for (const unlock of result.unlocks) {
      const farmed = Object.values(unlock.farmBattles).reduce((sum, n) => sum + n, 0)
      expect(farmed).toBe(unlock.wildBattles)
    }
  })
})

describe('raiseGenesToFloor', () => {
  // Gen quái hoang tăng ×2 mỗi tầng để thấy rõ mức gen theo tầng.
  const growData = (() => {
    const raw = makeRawData()
    raw.config.floors.geneGrowthPerFloor = 2
    return createGameData(withFixtureText(raw))
  })()
  const wildTeam = team(0)

  it('gen "wild" nâng lên mức gen quái hoang của tầng, chỉ tăng không giảm', () => {
    const party = buildTeam(growData, wildTeam, 1, 1)
    const raised = raiseGenesToFloor(growData, party, wildTeam, 3)
    const expected = geneValue(growData, 3, 'wild')
    expect(expected.gt(party[0].genes.attack)).toBe(true)
    expect(raised[0].genes.attack.eq(expected)).toBe(true)
    // Tầng thấp hơn gen hiện có: giữ nguyên.
    expect(raiseGenesToFloor(growData, raised, wildTeam, 1)[0].genes.attack.eq(expected)).toBe(true)
  })

  it('gen cố định trong bản mẫu và quái ngoài đội mẫu giữ nguyên', () => {
    const fixed = team(0, 7)
    const party = buildTeam(growData, fixed, 1, 1)
    expect(raiseGenesToFloor(growData, party, fixed, 5)[0].genes.attack.toNumber()).toBe(7)
    const stranger = { ...party[0], id: 'm99' }
    expect(raiseGenesToFloor(growData, [stranger], wildTeam, 5)[0]).toBe(stranger)
  })
})
