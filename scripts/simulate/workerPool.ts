// Chạy các việc mô phỏng trên nhiều worker_threads: mỗi làn của runInOrder dùng riêng một worker.

import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { SimJob, TimedJobResult } from './jobs'
import { runInOrder, type RunInOrderOptions } from './pool'
import type { Scenarios } from './scenarios'
import { decodeTransfer, encodeTransfer } from './transfer'
import type { WorkerReply } from './worker'

const WORKER_ENTRY = 'scripts/simulate/worker.mjs'

export interface WorkerRun {
  scenarios: Scenarios
  jobs: readonly SimJob[]
  count: number
  /** Trần heap mỗi worker (planWorkers trong cli.ts), để cả lần chạy không vượt phần RAM được dùng. */
  workerHeapMb: number
}

/** Chạy jobs trên `count` worker, kết quả theo thứ tự jobs; luôn tắt worker khi xong hoặc lỗi. */
export async function runInWorkers(
  { scenarios, jobs, count, workerHeapMb }: WorkerRun,
  options: RunInOrderOptions<SimJob>
): Promise<TimedJobResult[]> {
  const workers = Array.from(
    { length: count },
    () =>
      new Worker(resolve(WORKER_ENTRY), {
        workerData: scenarios,
        resourceLimits: { maxOldGenerationSizeMb: workerHeapMb }
      })
  )
  try {
    return await runInOrder(jobs, count, (job, lane) => sendJob(workers[lane], job), options)
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()))
  }
}

function sendJob(worker: Worker, job: SimJob): Promise<TimedJobResult> {
  return new Promise((resolveJob, reject) => {
    const cleanup = (): void => {
      worker.off('message', onMessage)
      worker.off('error', onError)
    }
    const onMessage = (reply: WorkerReply): void => {
      cleanup()
      if (!reply.ok) {
        reject(new Error(`Worker lỗi khi chạy ${JSON.stringify(job)}:\n${reply.error}`))
        return
      }
      // Ép kiểu: worker.ts chỉ gửi kết quả của runTimedJob đã mã hóa bằng encodeTransfer.
      resolveJob(decodeTransfer(reply.result) as TimedJobResult)
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    worker.on('message', onMessage)
    worker.on('error', onError)
    // Việc pha 2 mang đội thật (có Decimal) nên cũng mã hóa như kết quả.
    worker.postMessage(encodeTransfer(job))
  })
}
