import { describe, expect, it } from 'vitest'
import { makeData, makeRawData } from '@core/testing'
import {
  collectResults,
  createJobContext,
  filterJobs,
  jobPriority,
  listJobs,
  listProgressionSweepJobs,
  runJob,
  runTimedJob
} from './jobs'
import { decodeTransfer, encodeTransfer } from './transfer'
import { validScenarios } from './scenarioFixture'
import { parseScenarios, type Scenarios } from './scenarios'

const data = makeData()

function scenarios(edit: (raw: Record<string, unknown>) => void = () => undefined): Scenarios {
  const raw = validScenarios()
  raw.variants = [
    { id: 'current', ai: {} },
    { id: 'ko', ai: { koBonus: 2 } }
  ]
  edit(raw)
  return parseScenarios(data, raw)
}

const contextFor = (parsed: Scenarios): ReturnType<typeof createJobContext> =>
  createJobContext({ raw: makeRawData(), data, scenarios: parsed })

describe('listJobs', () => {
  it('thứ tự khai báo: biến thể → đội → tầng, rồi chơi liên tục, breed, fuse', () => {
    expect(listJobs(scenarios())).toEqual([
      { type: 'sweep', variantId: 'current', teamId: 'solo', floor: 1 },
      { type: 'sweep', variantId: 'current', teamId: 'solo', floor: 2 },
      { type: 'sweep', variantId: 'ko', teamId: 'solo', floor: 1 },
      { type: 'sweep', variantId: 'ko', teamId: 'solo', floor: 2 },
      { type: 'progression', teamId: 'solo', usePills: true, growth: true },
      { type: 'breeding' },
      { type: 'fusion' }
    ])
  })
})

describe('listJobs: tìm level cần để thắng boss', () => {
  it('mỗi đội không skipBoss × tầng, sau quét tầng, trước chơi liên tục', () => {
    const parsed = scenarios((raw) => {
      raw.teams = [
        ...(raw.teams as object[]),
        {
          id: 'noBoss',
          skipBoss: true,
          members: [{ speciesId: 'weakling', levelOffset: 0, genes: 'wild', traits: [] }]
        }
      ]
      raw.bossLevelSearch = { targets: [50], maxOffset: 2, battles: 2 }
    })
    const jobs = listJobs(parsed)
    const bossLevelJobs = jobs.filter((job) => job.type === 'bossLevel')
    expect(bossLevelJobs).toEqual([
      { type: 'bossLevel', teamId: 'solo', floor: 1 },
      { type: 'bossLevel', teamId: 'solo', floor: 2 }
    ])
    const types = jobs.map((job) => job.type)
    expect(types.lastIndexOf('sweep')).toBeLessThan(types.indexOf('bossLevel'))
    expect(types.lastIndexOf('bossLevel')).toBeLessThan(types.indexOf('progression'))
    const result = runJob(contextFor(parsed), bossLevelJobs[0])
    expect(result.type === 'bossLevel' && result.rows.map((row) => row.target)).toEqual([50])
    expect(jobPriority(bossLevelJobs[0])).toBeGreaterThan(jobPriority(jobs[0]))
    expect(jobPriority(bossLevelJobs[0])).toBeLessThan(
      jobPriority({ type: 'progression', teamId: 'solo', usePills: true, growth: true })
    )
  })
})

describe('quét theo map', () => {
  const parsed = scenarios((raw) => {
    raw.biomeSweep = { teamIds: ['solo'], floors: [1, 3], wildBattles: 2, bossBattles: 1 }
  })

  it('mỗi biome một việc, sau quét tầng; cần dữ liệu game', () => {
    const jobs = listJobs(parsed, data)
    expect(jobs.filter((job) => job.type === 'biomeSweep')).toEqual([
      { type: 'biomeSweep', biomeId: 'field' },
      { type: 'biomeSweep', biomeId: 'lair' },
      { type: 'biomeSweep', biomeId: 'pairs' }
    ])
    expect(() => listJobs(parsed)).toThrow('dữ liệu game')
    const types = jobs.map((job) => job.type)
    expect(types.lastIndexOf('sweep')).toBeLessThan(types.indexOf('biomeSweep'))
  })

  it('mỗi đội × tầng: trận quái hoang rồi boss ở đúng map; gom vào biomes', () => {
    const result = runJob(contextFor(parsed), { type: 'biomeSweep', biomeId: 'lair' })
    if (result.type !== 'biomeSweep') throw new Error('sai loại kết quả')
    expect(result.biomes.map((r) => [r.biomeId, r.floor, r.kind, r.battles])).toEqual([
      ['lair', 1, 'wild', 2],
      ['lair', 1, 'boss', 1],
      ['lair', 3, 'wild', 2],
      ['lair', 3, 'boss', 1]
    ])
    expect(collectResults([result]).biomes).toEqual(result.biomes)
    expect(runTimedJob(contextFor(parsed), { type: 'biomeSweep', biomeId: 'lair' }).part).toBe(
      'biomeSweep'
    )
  })
})

describe('jobPriority', () => {
  it('chơi liên tục trước, rồi quét tầng, cuối cùng breed / fuse', () => {
    const order = [...listJobs(scenarios())].sort((a, b) => jobPriority(b) - jobPriority(a))
    expect(order.map((job) => job.type)).toEqual([
      'progression',
      'sweep',
      'sweep',
      'sweep',
      'sweep',
      'breeding',
      'fusion'
    ])
  })
})

describe('runJob', () => {
  it('quét tầng: trận quái hoang rồi trận boss; biến thể dùng config.ai của nó', () => {
    const context = contextFor(scenarios())
    const result = runJob(context, { type: 'sweep', variantId: 'ko', teamId: 'solo', floor: 1 })
    if (result.type !== 'sweep') throw new Error('sai loại kết quả')
    expect(result.floors.map((f) => [f.variantId, f.kind, f.battles])).toEqual([
      ['ko', 'wild', 3],
      ['ko', 'boss', 1]
    ])
    expect(context.dataForVariant('ko').config.ai.koBonus).toBe(2)
    // Tạo GameData của biến thể một lần rồi dùng lại.
    expect(context.dataForVariant('ko')).toBe(context.dataForVariant('ko'))
  })

  it('đội skipBoss: chỉ có trận quái hoang', () => {
    const parsed = scenarios((raw) => {
      ;(raw.teams as Record<string, unknown>[])[0].skipBoss = true
    })
    const result = runJob(contextFor(parsed), {
      type: 'sweep',
      variantId: 'current',
      teamId: 'solo',
      floor: 1
    })
    expect(result.type === 'sweep' && result.floors.map((f) => f.kind)).toEqual(['wild'])
  })

  it('biến thể / đội không có thì báo lỗi', () => {
    const context = contextFor(scenarios())
    expect(() =>
      runJob(context, { type: 'sweep', variantId: 'ghost', teamId: 'solo', floor: 1 })
    ).toThrow('ghost')
    expect(() =>
      runJob(context, { type: 'progression', teamId: 'ghost', usePills: true, growth: true })
    ).toThrow('ghost')
  })

  it('đo thời gian và gán phần; chạy lại ra cùng kết quả', () => {
    const context = contextFor(scenarios())
    const timed = runTimedJob(context, { type: 'fusion' })
    expect(timed.part).toBe('lineage')
    expect(timed.ms).toBeGreaterThanOrEqual(0)
    expect(runJob(context, { type: 'fusion' })).toEqual(timed.result)
  })
})

describe('collectResults', () => {
  it('gom mọi việc theo thứ tự, giống chạy tuần tự từng phần', () => {
    const parsed = scenarios((raw) => {
      raw.progression = {
        teamIds: ['solo'],
        bossPolicy: { type: 'everyWins', wins: 1 },
        maxBattles: 3
      }
    })
    const context = contextFor(parsed)
    const collected = collectResults(listJobs(parsed).map((job) => runJob(context, job)))
    expect(collected.floors.map((f) => `${f.variantId}:${f.floor}:${f.kind}`)).toEqual([
      'current:1:wild',
      'current:1:boss',
      'current:2:wild',
      'current:2:boss',
      'ko:1:wild',
      'ko:1:boss',
      'ko:2:wild',
      'ko:2:boss'
    ])
    expect(collected.progression.map((p) => p.teamId)).toEqual(['solo'])
    expect(collected.lineage[0].kind).toBe('breed')
    expect(collected.lineage.at(-1)?.kind).toBe('fuse')
  }, 60_000) // chạy mọi việc của kịch bản (kể cả chơi liên tục): chậm khi cả bộ test chạy song song
})

describe('quét tầng bằng đội thật (pha 2)', () => {
  const parsed = scenarios((raw) => {
    raw.progression = {
      ...(raw.progression as Record<string, unknown>),
      sweep: { wildBattles: 2, bossBattles: 1 }
    }
    // Đội mạnh để mở được tầng 2 trong maxBattles của kịch bản mẫu.
    raw.teams = [
      { id: 'solo', members: [{ speciesId: 'weakling', levelOffset: 0, genes: 1000, traits: [] }] }
    ]
  })
  const context = contextFor(parsed)
  const progression = runJob(context, {
    type: 'progression',
    teamId: 'solo',
    usePills: true,
    growth: true
  })
  if (progression.type !== 'progression') throw new Error('sai loại kết quả')
  const { snapshots } = progression.progression

  it('chơi liên tục ghi đội lúc vừa tới từng tầng: tầng 1 lúc bắt đầu, máu đầy', () => {
    expect(snapshots[0].floor).toBe(1)
    expect(snapshots.map((s) => s.floor)).toEqual([...snapshots.keys()].map((i) => i + 1))
    for (const snapshot of snapshots) {
      expect(snapshot.party.every((m) => m.damageTaken.eq(0) && m.statuses.length === 0)).toBe(true)
    }
    // Kịch bản mẫu mở tới tầng 2; đội thật đã tích EXP qua tầng 1.
    expect(snapshots.length).toBeGreaterThanOrEqual(2)
    expect(snapshots[1].party[0].exp.gt(snapshots[0].party[0].exp)).toBe(true)
  })

  it('mỗi biến thể × snapshot một việc (lần chơi đầu tiên của mỗi đội); tắt thì rỗng', () => {
    const jobs = listProgressionSweepJobs(parsed, [
      progression.progression,
      progression.progression
    ])
    expect(jobs).toHaveLength(2 * snapshots.length)
    expect(listProgressionSweepJobs(scenarios(), [progression.progression])).toEqual([])
  })

  it('đánh bằng đúng đội thật; việc qua lại worker giữ nguyên Decimal', () => {
    const [job] = listProgressionSweepJobs(parsed, [progression.progression])
    const result = runJob(context, job)
    if (result.type !== 'progressionSweep') throw new Error('sai loại kết quả')
    expect(result.floors.map((f) => [f.kind, f.battles])).toEqual([
      ['wild', 2],
      ['boss', 1]
    ])
    expect(runJob(context, decodeTransfer(encodeTransfer(job)) as typeof job)).toEqual(result)
    expect(jobPriority(job)).toBeLessThan(
      jobPriority({ type: 'progression', teamId: 'solo', usePills: true, growth: true })
    )
  })
})

describe('filterJobs', () => {
  const jobs = listJobs(scenarios())

  it('null = không lọc; --parts giữ đúng phần; --teams bỏ việc của đội khác, giữ việc không theo đội', () => {
    expect(filterJobs(jobs, { parts: null, teams: null })).toEqual(jobs)
    const progressionOnly = filterJobs(jobs, { parts: ['progression'], teams: null })
    expect(progressionOnly.every((job) => job.type === 'progression')).toBe(true)
    expect(progressionOnly.length).toBeGreaterThan(0)
    const ghost = filterJobs(jobs, { parts: null, teams: ['ghost'] })
    expect(ghost.map((job) => job.type)).toEqual(['breeding', 'fusion'])
  })
})
