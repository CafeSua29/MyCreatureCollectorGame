import { describe, expect, it } from 'vitest'
import { FIXTURE_ZONE_ID, makeData } from '@core/testing'
import { zonesTable } from './report'
import type { TeamSpec, ZoneSupplies } from './scenarios'
import { runZone, type ZoneRow } from './zones'

const data = makeData()

const team = (levelOffset: number): TeamSpec => ({
  id: 'one',
  skipBoss: false,
  masteryExpPerFloor: null,
  members: [{ speciesId: 'weakling', levelOffset, genes: 'wild', traits: [] }]
})

const supplies = (count: number): ZoneSupplies => ({
  reviveItemId: 'revive',
  revives: count,
  healItemId: 'potion',
  heals: count,
  healBelowPercent: 100,
  cureItemId: 'fullHeal',
  cures: count
})

const run = (levelOffset: number, supplyCount = 0): ZoneRow =>
  runZone(data, {
    zoneId: FIXTURE_ZONE_ID,
    floor: 2,
    team: team(levelOffset),
    visits: 3,
    supplies: supplies(supplyCount),
    seed: 5,
    limits: { maxTurns: 30, maxTurnsBoss: 60 }
  })

describe('runZone', () => {
  it('đủ lượt vào, mỗi lượt kết thúc đúng một cách; chạy lại ra cùng kết quả', () => {
    const row = run(30)
    expect(row.visits).toBe(3)
    expect(row.completed + row.failed + row.abandoned).toBe(3)
    expect(row.battlesWon).toBeLessThanOrEqual(row.battles)
    expect(row.guardianWins).toBeLessThanOrEqual(row.guardianBattles)
    expect(row.hours).toBeGreaterThan(0)
    expect(run(30)).toEqual(row)
  })

  it('đội rất mạnh hạ boss canh giữ mọi lượt vào; xong lượt thì có rương hiếm', () => {
    const row = run(60)
    expect(row.completed).toBe(3)
    expect(row.guardianWins).toBe(3)
    expect(row.lootValue).toBeGreaterThan(0)
  })

  it('không mang đồ thì không dùng; mang đồ thì dùng khi quái mất máu, tính giá đồ đã dùng', () => {
    expect(run(5).suppliesUsed).toBe(0)
    const stocked = run(5, 5)
    expect(stocked.suppliesUsed).toBeGreaterThan(0)
    expect(stocked.supplyCost).toBeGreaterThan(0)
    expect(stocked.suppliesUsed).toBeLessThanOrEqual(3 * 15)
  })

  it('bảng: một dòng mỗi hiểm địa × tầng, tỉ lệ theo lượt vào', () => {
    const table = zonesTable([run(60)])
    expect(table.rows).toEqual([
      expect.arrayContaining([FIXTURE_ZONE_ID, '2', '3', '100.0%', '0.0%', '0.0%'])
    ])
  })
})
