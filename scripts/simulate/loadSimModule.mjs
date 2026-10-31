// Đóng gói script mô phỏng một lần bằng Vite (luồng chính, trước khi tạo worker) rồi nạp bản đóng
// gói, vì @data dùng import.meta.glob (tsx / node không hiểu). Không chạy qua module runner của Vite:
// runner biến mọi lời gọi giữa module thành truy cập getter (chậm đáng kể trong vòng trận) và mỗi
// worker phải biến đổi lại hàng chục MB JSON. Alias đọc từ vitest.config.mts (không khai báo ở chỗ
// thứ tư).

import { build, loadConfigFromFile } from 'vite'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const BUILD_DIR = resolve('node_modules/.cache/simulate')
const ENTRIES = { main: 'scripts/simulate/main.ts', worker: 'scripts/simulate/worker.ts' }

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu
export async function buildSim() {
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    resolve('vitest.config.mts'),
    undefined,
    'warn'
  )
  await build({
    configFile: false,
    logLevel: 'warn',
    resolve: { alias: loaded?.config.resolve?.alias },
    // JSON thành JSON.parse("..."): nạp nhanh hơn nhiều so với object literal khổng lồ.
    json: { stringify: true },
    build: {
      ssr: true,
      outDir: BUILD_DIR,
      emptyOutDir: true,
      minify: false,
      reportCompressedSize: false,
      rollupOptions: {
        input: Object.fromEntries(
          Object.entries(ENTRIES).map(([name, path]) => [name, resolve(path)])
        ),
        output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name].mjs' }
      }
    }
  })
}

/** Nạp bản đóng gói của một điểm vào (`main` / `worker`); phải gọi buildSim trước. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- như trên
export function importBuilt(name) {
  return import(pathToFileURL(resolve(BUILD_DIR, `${name}.mjs`)).href)
}
