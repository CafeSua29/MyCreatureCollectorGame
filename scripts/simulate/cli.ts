// Tham số dòng lệnh của script mô phỏng:
// npm run simulate [đường dẫn kịch bản] [--workers N] [--parts a,b] [--teams a,b].

import { parseArgs } from 'node:util'
import { MACHINE_SHARE } from './cpuLimit.mjs'
import { SIM_PARTS, type SimPart } from './jobs'

export { MACHINE_SHARE }

export const DEFAULT_SCENARIOS = 'scripts/simulate/scenarios.json'

export interface CliOptions {
  scenarioPath: string
  /** Số worker chạy song song; 1 = chạy tuần tự trong luồng chính; null = tự chọn (autoWorkers). */
  workers: number | null
  /** Chỉ chạy các phần này (mục "Chỉ chạy phần liên quan" ở simulation.md); null = mọi phần. */
  parts: SimPart[] | null
  /** Chỉ chạy việc của các đội này (việc không theo đội vẫn chạy); null = mọi đội. */
  teams: string[] | null
}

const USAGE =
  'Cách dùng: npm run simulate [đường dẫn kịch bản] [--workers N] [--parts a,b] [--teams a,b]'

const isSimPart = (value: string): value is SimPart =>
  (SIM_PARTS as readonly string[]).includes(value)

/** Danh sách cách nhau bằng dấu phẩy; bỏ trống = null. */
function readList(value: string | undefined, option: string): string[] | null {
  if (value === undefined) return null
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (items.length === 0) throw new Error(`--${option} cần ít nhất một giá trị`)
  return items
}

/** Phần chạy: chạy progressionSweep thì tự thêm progression (cần đội thật của nó). */
function readParts(value: string | undefined): SimPart[] | null {
  const items = readList(value, 'parts')
  if (!items) return null
  const unknown = items.filter((item) => !isSimPart(item))
  if (unknown.length > 0) {
    throw new Error(`--parts: phần lạ ${unknown.join(', ')} (có: ${SIM_PARTS.join(', ')})`)
  }
  const parts = items.filter(isSimPart)
  if (parts.includes('progressionSweep') && !parts.includes('progression'))
    parts.push('progression')
  return SIM_PARTS.filter((part) => parts.includes(part))
}

/**
 * Mỗi worker mất vài giây khởi động (nạp Vite, kiểm tra dữ liệu), nên cần ít nhất chừng này việc
 * mỗi worker mới có lợi (đo: kịch bản quick 14 việc nhanh nhất với 4 worker).
 */
const MIN_JOBS_PER_WORKER = 3

/**
 * Bộ nhớ ngoài heap của một luồng (mã đã biên dịch, buffer, stack), cộng vào khi chia RAM. Ước
 * lượng rộng tay để tổng RSS không vượt phần RAM được dùng.
 */
const THREAD_OVERHEAD_MB = 256

/** Heap tối thiểu của một worker; RAM không đủ chia chừng này thì bớt worker. */
const MIN_WORKER_HEAP_MB = 1024

/**
 * Số worker tự chọn: số luồng CPU được dùng (limitCpu, cpuLimit.mjs) nhưng không quá
 * ⌊số việc / MIN_JOBS_PER_WORKER⌋, tối thiểu 1.
 */
export function autoWorkers(cpuThreads: number, jobCount: number): number {
  const byJobs = Math.floor(jobCount / MIN_JOBS_PER_WORKER)
  return Math.max(1, Math.min(cpuThreads, byJobs))
}

export interface MachineResources {
  /** Số luồng CPU được dùng, tiến trình đã được ghim vào chừng này luồng (limitCpu, cpuLimit.mjs). */
  cpuThreads: number
  totalMemoryMb: number
  /** Trần heap của luồng chính (luồng chính vẫn giữ dữ liệu và kết quả khi có worker). */
  mainHeapLimitMb: number
}

export interface WorkerPlan {
  /** 1 = chạy tuần tự trong luồng chính. */
  workers: number
  /** Trần heap (old generation) mỗi worker; null khi không tạo worker. */
  workerHeapMb: number | null
}

/**
 * Chọn số worker và trần heap mỗi worker sao cho cả lần chạy dùng tối đa MACHINE_SHARE CPU và RAM.
 * `--workers N` lớn hơn trần thì bị hạ xuống trần.
 */
export function planWorkers(
  machine: MachineResources,
  jobCount: number,
  requested: number | null
): WorkerPlan {
  const memoryBudgetMb =
    machine.totalMemoryMb * MACHINE_SHARE - machine.mainHeapLimitMb - THREAD_OVERHEAD_MB
  const memoryCap = Math.floor(memoryBudgetMb / (MIN_WORKER_HEAP_MB + THREAD_OVERHEAD_MB))
  const wanted = requested ?? autoWorkers(machine.cpuThreads, jobCount)
  const workers = Math.max(1, Math.min(wanted, machine.cpuThreads, memoryCap, jobCount))
  if (workers === 1) return { workers, workerHeapMb: null }
  return { workers, workerHeapMb: Math.floor(memoryBudgetMb / workers - THREAD_OVERHEAD_MB) }
}

/** Đọc tham số; sai thì ném Error kèm cách dùng. */
export function parseCliArgs(args: readonly string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { workers: { type: 'string' }, parts: { type: 'string' }, teams: { type: 'string' } },
    allowPositionals: true
  })
  if (positionals.length > 1) throw new Error(USAGE)
  let workers: number | null = null
  if (values.workers !== undefined) {
    workers = Number(values.workers)
    if (!Number.isSafeInteger(workers) || workers < 1) {
      throw new Error(`--workers phải là số nguyên ≥ 1, nhận "${values.workers}"`)
    }
  }
  return {
    scenarioPath: positionals[0] ?? DEFAULT_SCENARIOS,
    workers,
    parts: readParts(values.parts),
    teams: readList(values.teams, 'teams')
  }
}
