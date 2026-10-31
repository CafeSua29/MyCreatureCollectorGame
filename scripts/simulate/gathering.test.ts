import { describe, expect, it } from 'vitest'
import { FIXTURE_GATHERING_ITEM_IDS, makeData } from '@core/testing'
import { runGathering, type GatheringRow } from './gathering'
import { gatheringTable } from './report'
import type { GatheringRun, TeamSpec } from './scenarios'

const data = makeData()
const ids = FIXTURE_GATHERING_ITEM_IDS

const team: TeamSpec = {
  id: 'one',
  skipBoss: false,
  masteryExpPerFloor: null,
  members: [{ speciesId: 'weakling', levelOffset: 30, genes: 'wild', traits: [] }]
}

const runOf = (patch: Partial<GatheringRun>): GatheringRun => ({
  id: 'run',
  method: 'fishing',
  toolItemId: ids.oldRod,
  lureItemId: null,
  ...patch
})

const play = (run: GatheringRun, casts = 6): GatheringRow =>
  runGathering(data, { floor: 1, run, team, casts, seed: 7, limits: { maxTurns: 30 } })

describe('runGathering', () => {
  it('câu cá: đủ số lần, có trận và vật phẩm, tốn giờ; chạy lại ra cùng kết quả', () => {
    const row = play(runOf({}), 10)
    expect(row.biomeId).toBe('field')
    expect(row.casts).toBe(10)
    expect(row.battles).toBeGreaterThan(0)
    expect(row.battles).toBeLessThan(10)
    expect(row.battlesWon).toBeLessThanOrEqual(row.battles)
    expect(row.itemValue).toBeGreaterThan(0)
    expect(row.hours).toBeGreaterThan(0)
    expect(play(runOf({}), 10)).toEqual(row)
  })

  it('mồi câu tính giá đã dùng; khai thác luôn ra khoáng; wild chỉ đánh trận', () => {
    expect(play(runOf({ lureItemId: ids.lure })).lureCost).toBeGreaterThan(0)
    const mining = play(runOf({ method: 'mining', toolItemId: ids.pickaxe }))
    expect(mining.itemValue).toBeGreaterThan(0)
    const wild = play(runOf({ id: 'wild', method: 'wild', toolItemId: null }))
    expect(wild.battles).toBe(6)
  })

  it('bảng gathering: một dòng mỗi cách chơi, giá trị ròng mỗi giờ', () => {
    const row = play(runOf({}))
    const table = gatheringTable([row])
    expect(table.headers).toContain('netValue/hour')
    expect(table.rows[0][1]).toBe('run')
    expect(gatheringTable([]).rows).toEqual([])
  })
})
