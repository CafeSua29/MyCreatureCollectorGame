import { describe, expect, it } from 'vitest'
import { DataError } from '@core'
import { makeData } from '@core/testing'
import { listJobs } from './jobs'
import { worldBossTable } from './report'
import { validScenarios } from './scenarioFixture'
import { parseScenarios, type TeamSpec } from './scenarios'
import { NO_TIER, runWorldBoss } from './worldBoss'

const data = makeData()

const team: TeamSpec = {
  id: 'one',
  skipBoss: false,
  masteryExpPerFloor: null,
  members: [{ speciesId: 'weakling', levelOffset: 30, genes: 'wild', traits: [] }]
}

const play = (challenges = 3): ReturnType<typeof runWorldBoss> =>
  runWorldBoss(data, { team, floor: 1, challenges, seed: 7, mastery: null })

describe('runWorldBoss', () => {
  it('đủ số lần khiêu chiến, đo bội số máu đơn vị và bậc; chạy lại ra cùng kết quả', () => {
    const row = play()
    expect(row.challenges).toBe(3)
    expect(row.multiples).toHaveLength(3)
    expect(row.multiples.every((value) => value >= 0)).toBe(true)
    const counted = Object.values(row.tiers).reduce((sum, count) => sum + count, 0)
    expect(counted).toBe(3)
    expect(play()).toEqual(row)
  })

  it('bảng world-boss: cột theo bậc, phân vị; rỗng thì không dòng', () => {
    const table = worldBossTable([play()], ['C', 'S'])
    expect(table.headers).toEqual([
      'team',
      'floor',
      'challenges',
      'wipeRate',
      'avgMultiple',
      'p25',
      'p50',
      'p75',
      NO_TIER,
      'C',
      'S'
    ])
    expect(table.rows[0][0]).toBe('one')
    expect(worldBossTable([], ['C']).rows).toEqual([])
  })
})

describe('kịch bản worldBoss', () => {
  it('đọc kịch bản và tạo việc theo đội × tầng', () => {
    const raw = {
      ...validScenarios(),
      worldBoss: { teamIds: ['solo'], floors: [1, 2], challenges: 2 }
    }
    const scenarios = parseScenarios(data, raw)
    expect(scenarios.worldBoss).toEqual({ teamIds: ['solo'], floors: [1, 2], challenges: 2 })
    const jobs = listJobs(scenarios).filter((job) => job.type === 'worldBoss')
    expect(jobs).toEqual([
      { type: 'worldBoss', teamId: 'solo', floor: 1 },
      { type: 'worldBoss', teamId: 'solo', floor: 2 }
    ])
  })

  it('báo lỗi đội lạ, danh sách rỗng, số lần < 1', () => {
    const raw = { ...validScenarios(), worldBoss: { teamIds: ['?'], floors: [], challenges: 0 } }
    let issues: string[] = []
    try {
      parseScenarios(data, raw)
    } catch (error) {
      if (error instanceof DataError) issues = error.issues
    }
    expect(issues.some((issue) => issue.includes('worldBoss.teamIds[0]'))).toBe(true)
    expect(issues.some((issue) => issue.includes('worldBoss.floors'))).toBe(true)
    expect(issues.some((issue) => issue.includes('worldBoss.challenges'))).toBe(true)
  })
})
