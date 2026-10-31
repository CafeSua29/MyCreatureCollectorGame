import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Khớp với alias trong electron.vite.config.ts và "paths" trong tsconfig.
    alias: {
      '@core': resolve(import.meta.dirname, 'src/core'),
      '@data': resolve(import.meta.dirname, 'src/data')
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // So sánh Decimal theo giá trị trong expect (xem file).
    setupFiles: ['src/core/testing/setup.ts'],
    environment: 'node',
    // Dữ liệu thật gần 20.000 loài: test dựng / duyệt dữ liệu thật và test mô phỏng chậm hơn mặc định
    // 5 giây khi cả bộ test chạy song song (docs/rules/testing.md).
    testTimeout: 30_000
  }
})
