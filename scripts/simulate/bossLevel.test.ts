import { describe, expect, it } from 'vitest'
import { makeData } from '@core/testing'
import { searchBossLevel, type BossLevelOptions } from './bossLevel'
import { winRateOf } from './levelSearch'

const data = makeData()

const options = (overrides: Partial<BossLevelOptions> = {}): BossLevelOptions => ({
  variantId: 'v',
  team: {
    id: 't',
    // Gen cao để đội thắng được boss khi đủ level (fixture: boss ×2–5).
    members: [{ speciesId: 'weakling', levelOffset: -50, genes: 1000, traits: [] }],
    skipBoss: false,
    masteryExpPerFloor: null
  },
  floor: 1,
  biomeId: null,
  spec: { targets: [50, 100], maxOffset: 8, battles: 6 },
  seed: 3,
  maxTurns: 100,
  assumedMastery: null,
  earlyStop: null,
  ...overrides
})

describe('searchBossLevel', () => {
  it('một dòng mỗi mục tiêu; offset tìm được đạt mục tiêu, offset trước đó thì không', () => {
    const { rows, totals } = searchBossLevel(data, options())
    expect(rows.map((row) => row.target)).toEqual([50, 100])
    for (const row of rows) {
      expect(row).toMatchObject({ teamId: 't', floor: 1, maxOffset: 8 })
      if (row.offset === null) continue
      // Level = level boss tầng 1 (2) + offset; mọi quái dùng chung offset (bỏ levelOffset riêng).
      expect(row.level).toBe(Math.max(1, 2 + row.offset))
      expect(winRateOf({ ...row.measured, offset: row.offset })).toBeGreaterThanOrEqual(
        row.target / 100
      )
      expect(row.measured.kind).toBe('boss')
    }
    expect(totals.battles).toBeGreaterThanOrEqual(6)
    expect(searchBossLevel(data, options())).toEqual({ rows, totals })
  })

  it('không đạt trong maxOffset: offset / level null, kết quả đo ở maxOffset', () => {
    const weak = options({
      team: {
        id: 'w',
        members: [{ speciesId: 'weakling', levelOffset: 0, genes: 1, traits: [] }],
        skipBoss: false,
        masteryExpPerFloor: null
      },
      spec: { targets: [100], maxOffset: 0, battles: 4 }
    })
    const { rows, totals } = searchBossLevel(data, weak)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ offset: null, level: null })
    expect(rows[0].measured.played).toBe(4)
    expect(totals).toMatchObject({ battles: 4 })
  })
})
