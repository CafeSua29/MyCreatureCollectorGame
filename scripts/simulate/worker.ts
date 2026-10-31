// Trong worker: nạp dữ liệu một lần, nhận từng việc từ luồng chính, trả kết quả đã mã hóa
// (transfer.ts) hoặc lỗi kèm stack.

import { parentPort, workerData } from 'node:worker_threads'
import { loadGameData } from './gameDataSource'
import { createJobContext, runTimedJob, type SimJob } from './jobs'
import type { Scenarios } from './scenarios'
import { decodeTransfer, encodeTransfer } from './transfer'

export type WorkerReply = { ok: true; result: unknown } | { ok: false; error: string }

export function startWorker(): void {
  const port = parentPort
  if (!port) throw new Error('worker.ts chỉ chạy trong worker_threads')
  // Ép kiểu: luồng chính đã kiểm tra kịch bản bằng parseScenarios trước khi tạo worker.
  const context = createJobContext({ ...loadGameData(), scenarios: workerData as Scenarios })
  port.on('message', (encoded: unknown) => {
    let reply: WorkerReply
    try {
      // Ép kiểu: luồng chính chỉ gửi việc của listJobs đã mã hóa bằng encodeTransfer.
      const job = decodeTransfer(encoded) as SimJob
      reply = { ok: true, result: encodeTransfer(runTimedJob(context, job)) }
    } catch (error) {
      reply = {
        ok: false,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error)
      }
    }
    port.postMessage(reply)
  })
}
