// Chạy script mô phỏng (npm run simulate [đường dẫn kịch bản] [--workers N]): đóng gói một lần rồi
// chạy bản đóng gói (loadSimModule.mjs).

import { limitCpu } from './cpuLimit.mjs'
import { buildSim, importBuilt } from './loadSimModule.mjs'

const cpu = limitCpu()
console.log(cpu.message)
await buildSim()
const module = await importBuilt('main')
await module.main(process.argv.slice(2), cpu.threads)
