// Điểm vào của script mô phỏng (npm run simulate, nạp qua run.mjs): đọc kịch bản, chia thành các
// việc (jobs.ts), chạy tuần tự hoặc trên nhiều worker, gom kết quả theo thứ tự cố định rồi in bảng
// và ghi CSV. Chỗ duy nhất của script đụng file và console (ngoài worker).

import { difficultyTable } from './difficulty'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { totalmem } from 'node:os'
import { resolve } from 'node:path'
import { getHeapStatistics } from 'node:v8'
import type { GameData } from '@core'
import { parseCliArgs, planWorkers, type MachineResources } from './cli'
import {
  collectResults,
  createJobContext,
  filterJobs,
  jobPriority,
  listJobs,
  listProgressionSweepJobs,
  runTimedJob,
  type CollectedResults,
  type JobContext,
  type SimJob,
  type SimPart,
  type TimedJobResult
} from './jobs'
import { loadGameData } from './gameDataSource'
import { runInOrder } from './pool'
import {
  aiSummaryTable,
  biomeTable,
  bossLevelTable,
  bossMultiplierTable,
  naturalFieldTable,
  trainerTable,
  floorTable,
  formatTable,
  lineageTable,
  progressionTable,
  runLabel,
  runSummaryTable,
  skillUsageTable,
  summarizeRun,
  toCsv,
  tribulationTable,
  safariTable,
  zonesTable,
  gatheringTable,
  worldBossTable,
  itemWorldTable,
  type Table
} from './report'
import { lifespanTable } from './lifespan'
import { eventsTable } from './events'
import { parseScenarios } from './scenarios'
import { runInWorkers } from './workerPool'

const OUTPUT_DIR = 'scripts/simulate/out'
const BYTES_PER_MB = 1024 * 1024

function print(text: string): void {
  // eslint-disable-next-line no-console -- đầu ra của script mô phỏng là bảng trên console
  console.log(text)
}

/**
 * args: [đường dẫn kịch bản] [--workers N] [--parts a,b] [--teams a,b] (cli.ts); cpuThreads: số
 * luồng CPU tiến trình đã được ghim (limitCpu ở run.mjs).
 */
export async function main(args: readonly string[], cpuThreads: number): Promise<void> {
  const started = performance.now()
  const options = parseCliArgs(args)
  const machine = machineResources(cpuThreads)
  const { raw, data } = loadGameData()
  const scenarios = parseScenarios(
    data,
    JSON.parse(readFileSync(resolve(options.scenarioPath), 'utf8'))
  )
  const selection = { parts: options.parts, teams: options.teams }
  const jobs = filterJobs(listJobs(scenarios, data), selection)
  const context = createJobContext({ raw, data, scenarios })
  const phase1 = await runJobs(context, jobs, machine, options.workers)
  // Pha 2 cần đội thật của chơi liên tục (quét tầng bằng đội thật).
  const progressionResults = collectResults(phase1.map((t) => t.result)).progression
  const phase2Jobs = filterJobs(listProgressionSweepJobs(scenarios, progressionResults), selection)
  const phase2 = await runJobs(context, phase2Jobs, machine, options.workers)
  const timed = [...phase1, ...phase2]
  const ran = new Set<SimPart>(timed.map((t) => t.part))

  mkdirSync(OUTPUT_DIR, { recursive: true })
  for (const [title, file, part, table] of outputTables(
    data,
    collectResults(timed.map((t) => t.result))
  )) {
    // Phần không chạy (--parts, --teams) giữ nguyên file CSV của lần chạy trước.
    if (!ran.has(part)) continue
    print(`\n== ${title} (${OUTPUT_DIR}/${file})\n${formatTable(table)}`)
    writeFileSync(resolve(OUTPUT_DIR, file), toCsv(table), 'utf8')
  }
  print(
    `\n== Thời gian từng phần (cộng mọi worker)\n${formatTable(runSummaryTable(summarizeRun(timed)))}`
  )
  print(`\nXong sau ${((performance.now() - started) / 1000).toFixed(1)} giây.`)
}

/** Mọi bảng kết quả: tiêu đề, file CSV, phần tạo ra nó. */
function outputTables(
  data: GameData,
  results: CollectedResults
): [string, string, SimPart, Table][] {
  const {
    floors,
    biomes,
    bossLevels,
    progression,
    lineage,
    progressionFloors,
    tribulation,
    safari,
    zones,
    gathering,
    worldBoss,
    itemWorld
  } = results
  const lifespan = progression.map((result) => ({
    teamId: runLabel(result),
    usePills: result.usePills,
    totalBattles: result.totalBattles,
    tracker: result.lifespan
  }))
  return [
    ['Tỉ lệ thắng theo tầng', 'floors.csv', 'sweep', floorTable(floors)],
    ['Biến thể', 'ai-summary.csv', 'sweep', aiSummaryTable(floors)],
    ['Tỉ lệ dùng nhóm skill', 'ai.csv', 'sweep', skillUsageTable(floors)],
    ['Trận boss theo hệ số boss', 'boss-multipliers.csv', 'sweep', bossMultiplierTable(floors)],
    ['Theo môi trường tự nhiên', 'floor-fields.csv', 'sweep', naturalFieldTable(floors)],
    ['Gặp ngự thú sư NPC', 'trainers.csv', 'sweep', trainerTable(floors)],
    ['Quét theo map', 'biomes.csv', 'biomeSweep', biomeTable(biomes)],
    ['Level cần để thắng boss tầng', 'boss-level.csv', 'bossLevel', bossLevelTable(bossLevels)],
    ['Chơi liên tục', 'progression.csv', 'progression', progressionTable(progression)],
    ['Chơi liên tục: thọ nguyên', 'lifespan.csv', 'progression', lifespanTable(lifespan)],
    ['Chơi liên tục: độ khó', 'difficulty.csv', 'progression', difficultyTable(progression)],
    [
      'Chơi liên tục: event',
      'events.csv',
      'progression',
      eventsTable(
        progression.map((result) => ({
          teamId: runLabel(result),
          usePills: result.usePills,
          totalBattles: result.totalBattles,
          tally: result.eventTotals
        }))
      )
    ],
    [
      'Quét tầng bằng đội thật',
      'progression-floors.csv',
      'progressionSweep',
      floorTable(progressionFloors)
    ],
    [
      'Biến thể trên đội thật',
      'progression-summary.csv',
      'progressionSweep',
      aiSummaryTable(progressionFloors)
    ],
    ['Độ kiếp', 'tribulation.csv', 'tribulation', tribulationTable(tribulation)],
    ['Khu bảo tồn', 'safari.csv', 'safari', safariTable(safari)],
    ['Hiểm địa', 'zones.csv', 'zones', zonesTable(zones)],
    ['Câu cá và khai thác', 'gathering.csv', 'gathering', gatheringTable(gathering)],
    [
      'Boss thế giới',
      'world-boss.csv',
      'worldBoss',
      worldBossTable(
        worldBoss,
        data.config.worldBoss.tiers.map((tier) => tier.id)
      )
    ],
    ['Khí giới bí cảnh', 'item-world.csv', 'itemWorld', itemWorldTable(itemWorld)],
    ['Breed / fuse nhiều đời', 'lineage.csv', 'lineage', lineageTable(lineage)]
  ]
}

function machineResources(cpuThreads: number): MachineResources {
  return {
    cpuThreads,
    totalMemoryMb: totalmem() / BYTES_PER_MB,
    mainHeapLimitMb: getHeapStatistics().heap_size_limit / BYTES_PER_MB
  }
}

async function runJobs(
  context: JobContext,
  jobs: readonly SimJob[],
  machine: MachineResources,
  requestedWorkers: number | null
): Promise<TimedJobResult[]> {
  if (jobs.length === 0) return []
  const { workers, workerHeapMb } = planWorkers(machine, jobs.length, requestedWorkers)
  const heapNote = workerHeapMb === null ? '' : ` (heap tối đa ${workerHeapMb} MB mỗi worker)`
  print(`Chạy ${jobs.length} việc trên ${workers} worker${heapNote}.`)
  let lastPrinted = 0
  const onDone = (done: number, total: number): void => {
    // In tiến độ khoảng mỗi 10% (thứ tự xong không cố định nên chỉ in số đếm).
    if (done === total || done - lastPrinted >= Math.max(1, Math.ceil(total / 10))) {
      lastPrinted = done
      print(`  xong ${done}/${total} việc`)
    }
  }
  if (workerHeapMb !== null) {
    return runInWorkers(
      { scenarios: context.scenarios, jobs, count: workers, workerHeapMb },
      {
        onDone,
        priority: jobPriority
      }
    )
  }
  return runInOrder(jobs, 1, async (job) => runTimedJob(context, job), { onDone })
}
