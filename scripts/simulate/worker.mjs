// Điểm vào của một worker mô phỏng (tạo bởi workerPool.ts): nạp bản worker.ts đã đóng gói (run.mjs
// đóng gói trước khi tạo worker) rồi chờ việc.

import { importBuilt } from './loadSimModule.mjs'

const module = await importBuilt('worker')
module.startWorker()
