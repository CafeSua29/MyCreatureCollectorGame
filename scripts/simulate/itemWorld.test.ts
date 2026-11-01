import { describe, expect, it } from 'vitest'
import { DataError } from '@core'
import { makeEquipmentData } from '@core/testing'
import { runItemWorld } from './itemWorld'
import { listJobs } from './jobs'
import { itemWorldTable } from './report'
import { validScenarios } from './scenarioFixture'
import { parseScenarios, type TeamSpec } from './scenarios'

const data = makeEquipmentData()

const team: TeamSpec = {
  id: 'one',
  skipBoss: false,
  masteryExpPerFloor: null,
  members: [{ speciesId: 'weakling', levelOffset: 30, genes: 'wild', traits: [] }]
}

const play = (maxDepth = 3): ReturnType<typeof runItemWorld> =>
  runItemWorld(data, {
    team,
    floor: 5,
    rarity: 'rare',
    maxDepth,
    maxTurns: 60,
    seed: 7,
    mastery: null
  })

describe('runItemWorld', () => {
  it('đi tối đa maxDepth tầng, mỗi tầng qua + 1 cấp, giá cường hóa đúng số cấp; tất định', () => {
    const row = play()
    expect(row.battles).toBeGreaterThan(0)
    expect(row.cleared).toBeLessThanOrEqual(3)
    expect(row.stopped).toBe(row.cleared < 3)
    expect(row.hours).toBeGreaterThan(0)
    expect(row.enhanceStones).toBe((row.cleared * (row.cleared + 1)) / 2)
    expect(play()).toEqual(row)
  })

  it('bảng item-world: giờ mỗi cấp, giờ tương đương cường hóa; rỗng thì không dòng', () => {
    const table = itemWorldTable([play()])
    expect(table.headers).toContain('itemWorldVsEnhance')
    expect(table.rows[0].slice(0, 3)).toEqual(['one', '5', 'rare'])
    expect(itemWorldTable([]).rows).toEqual([])
  })
})

describe('kịch bản itemWorld', () => {
  it('đọc kịch bản và tạo việc theo đội × tầng × bậc', () => {
    const itemWorld = { teamIds: ['solo'], floors: [1], rarities: ['common', 'rare'], maxDepth: 5 }
    const scenarios = parseScenarios(data, { ...validScenarios(), itemWorld })
    expect(scenarios.itemWorld).toEqual(itemWorld)
    expect(listJobs(scenarios).filter((job) => job.type === 'itemWorld')).toEqual([
      { type: 'itemWorld', teamId: 'solo', floor: 1, rarity: 'common' },
      { type: 'itemWorld', teamId: 'solo', floor: 1, rarity: 'rare' }
    ])
  })

  it('báo lỗi đội lạ, bậc lạ, danh sách rỗng, maxDepth < 1', () => {
    const raw = {
      ...validScenarios(),
      itemWorld: { teamIds: ['?'], floors: [], rarities: ['unique'], maxDepth: 0 }
    }
    let issues: string[] = []
    try {
      parseScenarios(data, raw)
    } catch (error) {
      if (error instanceof DataError) issues = error.issues
    }
    for (const field of ['teamIds[0]', 'floors', 'rarities[0]', 'maxDepth']) {
      expect(issues.some((issue) => issue.includes(`itemWorld.${field}`))).toBe(true)
    }
  })
})
