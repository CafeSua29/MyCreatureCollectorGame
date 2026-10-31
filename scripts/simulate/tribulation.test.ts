import { describe, expect, it } from 'vitest'
import { makeData } from '@core/testing'
import { runTribulationSweep } from './tribulation'

const data = makeData()

const team = {
  id: 'solo',
  members: [{ speciesId: 'weakling', levelOffset: 0, genes: 'wild' as const, traits: [] }],
  skipBoss: false,
  masteryExpPerFloor: null
}

describe('runTribulationSweep', () => {
  const run = (): ReturnType<typeof runTribulationSweep> =>
    runTribulationSweep(data, {
      spec: { teamId: 'solo', tiers: [2], levelOffsets: [0, 30], battles: 3 },
      team,
      tier: 2,
      seed: 5,
      mastery: null
    })

  it('mỗi độ lệch level một dòng, đủ số trận, level = 50 × tầng + độ lệch; chạy lại ra cùng kết quả', () => {
    const rows = run()
    expect(rows.map((row) => [row.tier, row.levelOffset, row.level])).toEqual([
      [2, 0, 100],
      [2, 30, 130]
    ])
    for (const row of rows) expect(row.won + row.lost).toBe(3)
    expect(run()).toEqual(rows)
  })
})
