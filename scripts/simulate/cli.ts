// Tham số dòng lệnh của script mô phỏng:
// npm run simulate [đường dẫn kịch bản] [--workers N] [--parts a,b] [--teams a,b].

import { parseArgs } from 'node:util'
import { SIM_PARTS, type SimPart } from './jobs'

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
 * Số worker tự chọn: số luồng CPU − 1 (chừa một luồng cho máy) nhưng không quá
 * ⌊số việc / MIN_JOBS_PER_WORKER⌋, tối thiểu 1.
 */
export function autoWorkers(availableParallelism: number, jobCount: number): number {
  const byJobs = Math.floor(jobCount / MIN_JOBS_PER_WORKER)
  return Math.max(1, Math.min(availableParallelism - 1, byJobs))
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
