// Chạy script mô phỏng (npm run simulate [đường dẫn kịch bản] [--workers N]): đóng gói một lần rồi
// chạy bản đóng gói (loadSimModule.mjs). Dùng toàn bộ CPU / RAM của máy (docs/rules/simulation.md).

import { buildSim, importBuilt } from './loadSimModule.mjs'

await buildSim()
const module = await importBuilt('main')
await module.main(process.argv.slice(2))
