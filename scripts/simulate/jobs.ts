// Chia lần chạy mô phỏng thành các việc độc lập (mục "Chạy song song" ở simulation.md): quét tầng
// mỗi biến thể × đội × tầng, quét theo map mỗi map, tìm level cần để thắng boss mỗi đội × tầng,
// chơi liên tục mỗi đội, breed, fuse. Seed mỗi việc đã tất định
// (deriveSeed) nên kết quả không phụ thuộc thứ tự chạy; nơi gọi gom kết quả theo thứ tự listJobs.

import { createGameData, type GameData, type RawGameData } from '@core'
import type { BattleKind, BattleTotals } from './battleRunner'
import { searchBossLevel, type BossLevelRow } from './bossLevel'
import { sweepFloor, type FloorResult } from './floorSweep'
import { runBreeding, runFusion, type LineageRow } from './lineage'
import { runProgression, type ProgressionResult, type TeamSnapshot } from './progression'
import {
  rawWithVariant,
  turnLimit,
  type SafariPolicy,
  type Scenarios,
  type TeamSpec,
  type ZoneSpec
} from './scenarios'
import { runTribulationSweep, type TribulationRow } from './tribulation'
import { runSafari, type SafariRow } from './safari'
import { runZone, type ZoneRow } from './zones'

export type SimJob =
  | { type: 'sweep'; variantId: string; teamId: string; floor: number }
  | { type: 'biomeSweep'; biomeId: string }
  | { type: 'bossLevel'; teamId: string; floor: number }
  | { type: 'progression'; teamId: string; usePills: boolean; growth: boolean }
  | { type: 'breeding' }
  | { type: 'fusion' }
  /** Độ kiếp lên một tầng (tribulation.ts). */
  | { type: 'tribulation'; teamId: string; tier: number }
  /** Quét tầng bằng đội thật của chơi liên tục lúc vừa tới tầng (pha 2, sau chơi liên tục). */
  | { type: 'progressionSweep'; variantId: string; snapshot: TeamSnapshot }
  /** Khu bảo tồn ở một tầng với một cách chơi (safari.ts). */
  | { type: 'safari'; floor: number; policy: SafariPolicy }
  /** Hiểm địa ở một tầng (zones.ts). */
  | { type: 'zones'; zoneId: string; floor: number }

/** Các phần của lần chạy (in thời gian từng phần, chọn phần chạy bằng --parts). */
export const SIM_PARTS = [
  'sweep',
  'biomeSweep',
  'bossLevel',
  'progression',
  'progressionSweep',
  'tribulation',
  'safari',
  'zones',
  'lineage'
] as const

export type SimPart = (typeof SIM_PARTS)[number]

export type SimJobResult =
  | { type: 'sweep'; floors: FloorResult[] }
  | { type: 'biomeSweep'; biomes: FloorResult[] }
  | { type: 'bossLevel'; rows: BossLevelRow[]; totals: BattleTotals }
  | { type: 'progression'; progression: ProgressionResult }
  | { type: 'lineage'; rows: LineageRow[] }
  | { type: 'progressionSweep'; floors: FloorResult[] }
  | { type: 'tribulation'; rows: TribulationRow[] }
  | { type: 'safari'; row: SafariRow }
  | { type: 'zones'; row: ZoneRow }

export interface TimedJobResult {
  part: SimPart
  /** Thời gian chạy việc (mili giây), đo trong luồng chạy việc. */
  ms: number
  result: SimJobResult
}

export interface JobContext {
  scenarios: Scenarios
  data: GameData
  /** GameData với config.ai của biến thể (tạo một lần mỗi biến thể, dùng lại cho mọi việc). */
  dataForVariant(variantId: string): GameData
}

/** raw: dữ liệu thô để tạo GameData của từng biến thể; data: GameData đã kiểm tra của raw. */
export function createJobContext({
  raw,
  data,
  scenarios
}: {
  raw: RawGameData
  data: GameData
  scenarios: Scenarios
}): JobContext {
  const cache = new Map<string, GameData>()
  return {
    scenarios,
    data,
    dataForVariant(variantId) {
      const cached = cache.get(variantId)
      if (cached) return cached
      const variant = scenarios.variants.find((v) => v.id === variantId)
      if (!variant) throw new Error(`Mô phỏng: không có biến thể "${variantId}"`)
      // Kiểm tra lại toàn bộ dữ liệu với config.ai đã ghi đè (biến thể sai thì báo như dữ liệu sai).
      const varied = createGameData(rawWithVariant(raw, variant))
      cache.set(variantId, varied)
      return varied
    }
  }
}

/**
 * Mọi việc của lần chạy theo thứ tự khai báo trong kịch bản (cũng là thứ tự ghi kết quả). `data`
 * chỉ cần khi kịch bản quét theo map (danh sách biome).
 */
export function listJobs(scenarios: Scenarios, data?: GameData): SimJob[] {
  const jobs: SimJob[] = []
  for (const variant of scenarios.variants) {
    for (const team of scenarios.teams) {
      for (let floor = scenarios.floors.from; floor <= scenarios.floors.to; floor++) {
        jobs.push({ type: 'sweep', variantId: variant.id, teamId: team.id, floor })
      }
    }
  }
  if (scenarios.biomeSweep) {
    if (!data) throw new Error('Mô phỏng: quét theo map cần dữ liệu game')
    for (const biomeId of Object.keys(data.biomes)) jobs.push({ type: 'biomeSweep', biomeId })
  }
  if (scenarios.bossLevelSearch) {
    // Đội skipBoss không đánh boss tầng nên không tìm level.
    for (const team of scenarios.teams.filter((t) => !t.skipBoss)) {
      for (let floor = scenarios.floors.from; floor <= scenarios.floors.to; floor++) {
        jobs.push({ type: 'bossLevel', teamId: team.id, floor })
      }
    }
  }
  for (const teamId of scenarios.progression.teamIds) {
    for (const usePills of scenarios.progression.pillModes) {
      for (const growth of scenarios.progression.growthModes) {
        jobs.push({ type: 'progression', teamId, usePills, growth })
      }
    }
  }
  if (scenarios.tribulation) {
    const { teamId, tiers } = scenarios.tribulation
    for (const tier of tiers) jobs.push({ type: 'tribulation', teamId, tier })
  }
  if (scenarios.safari) {
    for (const floor of scenarios.safari.floors) {
      for (const policy of scenarios.safari.policies) jobs.push({ type: 'safari', floor, policy })
    }
  }
  if (scenarios.zones) {
    for (const { zoneId, floors } of scenarios.zones.runs) {
      for (const floor of floors) jobs.push({ type: 'zones', zoneId, floor })
    }
  }
  jobs.push({ type: 'breeding' }, { type: 'fusion' })
  return jobs
}

export function jobPart(job: SimJob): SimPart {
  if (job.type === 'breeding' || job.type === 'fusion') return 'lineage'
  return job.type
}

/** Thứ tự bắt đầu khi chạy song song: việc dài nhất chạy trước (pool.ts). */
const PART_PRIORITY: Record<SimPart, number> = {
  progression: 4,
  progressionSweep: 1,
  bossLevel: 3,
  biomeSweep: 2,
  tribulation: 2,
  safari: 1,
  zones: 2,
  sweep: 1,
  lineage: 0
}

export function jobPriority(job: SimJob): number {
  return PART_PRIORITY[jobPart(job)]
}

/** Chạy một việc và đo thời gian. */
export function runTimedJob(context: JobContext, job: SimJob): TimedJobResult {
  const started = performance.now()
  const result = runJob(context, job)
  return { part: jobPart(job), ms: performance.now() - started, result }
}

export function runJob(context: JobContext, job: SimJob): SimJobResult {
  const { scenarios, data } = context
  switch (job.type) {
    case 'sweep':
      return { type: 'sweep', floors: runSweepJob(context, job) }
    case 'biomeSweep':
      return { type: 'biomeSweep', biomes: runBiomeSweepJob(context, job) }
    case 'bossLevel':
      return { type: 'bossLevel', ...runBossLevelJob(context, job) }
    case 'progression':
      return {
        type: 'progression',
        progression: runProgression(data, {
          ...scenarios.progression,
          team: findTeam(scenarios, job.teamId),
          toFloor: scenarios.floors.to,
          maxTurns: scenarios.maxTurns,
          maxTurnsBoss: scenarios.maxTurnsBoss,
          seed: scenarios.seed,
          usePills: job.usePills,
          growth: job.growth
        })
      }
    case 'breeding':
      return { type: 'lineage', rows: runBreeding(data, scenarios.breeding, scenarios.seed) }
    case 'fusion':
      return { type: 'lineage', rows: runFusion(data, scenarios.fusion, scenarios.seed) }
    case 'progressionSweep':
      return { type: 'progressionSweep', floors: runProgressionSweepJob(context, job) }
    case 'tribulation':
      return { type: 'tribulation', rows: runTribulationJob(context, job) }
    case 'safari': {
      const spec = scenarios.safari
      if (!spec) throw new Error('Mô phỏng: kịch bản không có safari')
      const row = runSafari(data, { ...job, visits: spec.visits, seed: scenarios.seed })
      return { type: 'safari', row }
    }
    case 'zones': {
      const spec = scenarios.zones
      if (!spec) throw new Error('Mô phỏng: kịch bản không có zones')
      const row = runZone(context.dataForVariant(scenarios.variants[0].id), {
        zoneId: job.zoneId,
        floor: job.floor,
        team: zoneTeam(findTeam(scenarios, spec.teamId), spec.runs, job.zoneId),
        visits: spec.visits,
        supplies: spec.supplies,
        seed: scenarios.seed,
        limits: { maxTurns: scenarios.maxTurns, maxTurnsBoss: scenarios.maxTurnsBoss }
      })
      return { type: 'zones', row }
    }
  }
}

/** Đội của hiểm địa: đổi loài quái đầu đội nếu lượt chạy của hiểm địa đó có leadSpeciesId. */
function zoneTeam(team: TeamSpec, runs: ZoneSpec['runs'], zoneId: string): TeamSpec {
  const leadSpeciesId = runs.find((run) => run.zoneId === zoneId)?.leadSpeciesId
  if (!leadSpeciesId) return team
  const [lead, ...rest] = team.members
  return { ...team, members: [{ ...lead, speciesId: leadSpeciesId }, ...rest] }
}

/** Độ kiếp lên một tầng với quái đầu của đội (biến thể đầu tiên). */
function runTribulationJob(
  context: JobContext,
  job: Extract<SimJob, { type: 'tribulation' }>
): TribulationRow[] {
  const { scenarios } = context
  const spec = scenarios.tribulation
  if (!spec) throw new Error('Mô phỏng: kịch bản không có tribulation')
  return runTribulationSweep(context.dataForVariant(scenarios.variants[0].id), {
    spec,
    team: findTeam(scenarios, job.teamId),
    tier: job.tier,
    seed: scenarios.seed,
    mastery: scenarios.assumedMastery
  })
}

/**
 * Trận quái hoang rồi trận boss tầng với đội thật của chơi liên tục (snapshot), không giả định gì
 * (level, thuần thục, thân mật, trang bị, cảnh giới đều là số tích lũy thật).
 */
function runProgressionSweepJob(
  context: JobContext,
  job: Extract<SimJob, { type: 'progressionSweep' }>
): FloorResult[] {
  const { scenarios } = context
  const spec = scenarios.progression.sweep
  if (!spec) throw new Error('Mô phỏng: kịch bản không có progression.sweep')
  const data = context.dataForVariant(job.variantId)
  const { snapshot } = job
  const team = findTeam(scenarios, snapshot.teamId)
  const kinds: [BattleKind, number][] = [
    ['wild', spec.wildBattles],
    ['boss', spec.bossBattles]
  ]
  return kinds
    .filter(([, battles]) => battles > 0)
    .map(([kind, battles]) =>
      sweepFloor(data, {
        variantId: job.variantId,
        team,
        floor: snapshot.floor,
        biomeId: null,
        kind,
        battles,
        maxTurns: turnLimit(scenarios, kind),
        seed: scenarios.seed,
        earlyStop: scenarios.earlyStop,
        assumedMastery: null,
        snapshot
      })
    )
}

/**
 * Việc pha 2: mỗi biến thể × mỗi snapshot của lần chơi liên tục đầu tiên của mỗi đội (chế độ đan
 * đầu tiên). Rỗng nếu tắt progression.sweep.
 */
export function listProgressionSweepJobs(
  scenarios: Scenarios,
  progression: readonly ProgressionResult[]
): SimJob[] {
  if (!scenarios.progression.sweep) return []
  const jobs: SimJob[] = []
  const seen = new Set<string>()
  for (const variant of scenarios.variants) {
    seen.clear()
    for (const result of progression) {
      if (seen.has(result.teamId)) continue
      seen.add(result.teamId)
      for (const snapshot of result.snapshots) {
        jobs.push({ type: 'progressionSweep', variantId: variant.id, snapshot })
      }
    }
  }
  return jobs
}

/** Chọn việc theo --parts / --teams (null = không lọc). */
export function filterJobs(
  jobs: readonly SimJob[],
  { parts, teams }: { parts: readonly SimPart[] | null; teams: readonly string[] | null }
): SimJob[] {
  return jobs.filter((job) => {
    if (parts && !parts.includes(jobPart(job))) return false
    const teamId = jobTeamId(job)
    return !teams || teamId === null || teams.includes(teamId)
  })
}

/** Đội của việc; null = việc không theo một đội (quét theo map, breed / fuse). */
function jobTeamId(job: SimJob): string | null {
  switch (job.type) {
    case 'sweep':
    case 'bossLevel':
    case 'progression':
    case 'tribulation':
      return job.teamId
    case 'progressionSweep':
      return job.snapshot.teamId
    case 'biomeSweep':
    case 'breeding':
    case 'fusion':
    case 'safari':
    case 'zones':
      return null
  }
}

/** Trận quái hoang rồi trận boss của một đội ở một tầng (đội skipBoss bỏ phần boss). */
function runSweepJob(context: JobContext, job: Extract<SimJob, { type: 'sweep' }>): FloorResult[] {
  const { scenarios } = context
  const data = context.dataForVariant(job.variantId)
  const team = findTeam(scenarios, job.teamId)
  const variant = scenarios.variants.find((v) => v.id === job.variantId)
  const common = {
    variantId: job.variantId,
    team,
    tactic: variant?.tactic ?? 'balanced',
    uncontracted: variant?.uncontracted ?? false,
    tamerRealm: variant?.tamerRealm ?? null,
    assumedPurity: variant?.assumedPurity ?? null,
    floor: job.floor,
    biomeId: null,
    seed: scenarios.seed,
    earlyStop: scenarios.earlyStop,
    assumedMastery: scenarios.assumedMastery
  }
  const results = [
    sweepFloor(data, {
      ...common,
      kind: 'wild',
      battles: scenarios.wildBattlesPerFloor,
      maxTurns: turnLimit(scenarios, 'wild')
    })
  ]
  if (!team.skipBoss) {
    results.push(
      sweepFloor(data, {
        ...common,
        kind: 'boss',
        battles: scenarios.bossBattlesPerFloor,
        maxTurns: turnLimit(scenarios, 'boss')
      })
    )
  }
  return results
}

/** Quét một map: mỗi đội × tầng của biomeSweep, trận quái hoang rồi trận boss tầng (biến thể đầu). */
function runBiomeSweepJob(
  context: JobContext,
  job: Extract<SimJob, { type: 'biomeSweep' }>
): FloorResult[] {
  const { scenarios } = context
  const spec = scenarios.biomeSweep
  if (!spec) throw new Error('Mô phỏng: kịch bản không có biomeSweep')
  // parseScenarios bảo đảm có ít nhất một biến thể.
  const variantId = scenarios.variants[0].id
  const data = context.dataForVariant(variantId)
  const results: FloorResult[] = []
  for (const teamId of spec.teamIds) {
    const team = findTeam(scenarios, teamId)
    for (const floor of spec.floors) {
      const common = {
        variantId,
        team,
        floor,
        biomeId: job.biomeId,
        seed: scenarios.seed,
        earlyStop: scenarios.earlyStop,
        assumedMastery: scenarios.assumedMastery
      }
      const kinds: [BattleKind, number][] = [
        ['wild', spec.wildBattles],
        ['boss', spec.bossBattles]
      ]
      for (const [kind, battles] of kinds) {
        if (battles === 0 || (kind === 'boss' && team.skipBoss)) continue
        results.push(
          sweepFloor(data, { ...common, kind, battles, maxTurns: turnLimit(scenarios, kind) })
        )
      }
    }
  }
  return results
}

/** Tìm level cần để thắng boss tầng, dùng biến thể đầu tiên. */
function runBossLevelJob(
  context: JobContext,
  job: Extract<SimJob, { type: 'bossLevel' }>
): { rows: BossLevelRow[]; totals: BattleTotals } {
  const { scenarios } = context
  const spec = scenarios.bossLevelSearch
  if (!spec) throw new Error('Mô phỏng: kịch bản không có bossLevelSearch')
  // parseScenarios bảo đảm có ít nhất một biến thể.
  const variantId = scenarios.variants[0].id
  return searchBossLevel(context.dataForVariant(variantId), {
    variantId,
    team: findTeam(scenarios, job.teamId),
    floor: job.floor,
    biomeId: null,
    spec,
    seed: scenarios.seed,
    maxTurns: turnLimit(scenarios, 'boss'),
    earlyStop: scenarios.earlyStop,
    assumedMastery: scenarios.assumedMastery
  })
}

function findTeam(scenarios: Scenarios, teamId: string): TeamSpec {
  const team = scenarios.teams.find((t) => t.id === teamId)
  if (!team) throw new Error(`Mô phỏng: không có đội "${teamId}"`)
  return team
}

export interface CollectedResults {
  floors: FloorResult[]
  biomes: FloorResult[]
  bossLevels: BossLevelRow[]
  progression: ProgressionResult[]
  lineage: LineageRow[]
  /** Quét tầng bằng đội thật của chơi liên tục (progression-floors.csv). */
  progressionFloors: FloorResult[]
  tribulation: TribulationRow[]
  safari: SafariRow[]
  zones: ZoneRow[]
}

/** Gom kết quả các việc (đã theo thứ tự listJobs) thành từng phần. */
export function collectResults(results: readonly SimJobResult[]): CollectedResults {
  const collected: CollectedResults = {
    floors: [],
    biomes: [],
    bossLevels: [],
    progression: [],
    lineage: [],
    progressionFloors: [],
    tribulation: [],
    safari: [],
    zones: []
  }
  for (const result of results) {
    switch (result.type) {
      case 'sweep':
        collected.floors.push(...result.floors)
        break
      case 'biomeSweep':
        collected.biomes.push(...result.biomes)
        break
      case 'bossLevel':
        collected.bossLevels.push(...result.rows)
        break
      case 'progression':
        collected.progression.push(result.progression)
        break
      case 'lineage':
        collected.lineage.push(...result.rows)
        break
      case 'progressionSweep':
        collected.progressionFloors.push(...result.floors)
        break
      case 'tribulation':
        collected.tribulation.push(...result.rows)
        break
      case 'safari':
        collected.safari.push(result.row)
        break
      case 'zones':
        collected.zones.push(result.row)
        break
    }
  }
  return collected
}
