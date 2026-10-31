// Giới hạn CPU cứng cho cả lần chạy mô phỏng (chủ project chốt 2026-10-31: tối đa 60% CPU và RAM theo
// Task Manager): ghim tiến trình vào một phần số luồng (CPU affinity). Bớt worker thôi chưa đủ vì
// mỗi worker V8 còn luồng GC chạy song song; affinity chặn mọi luồng của tiến trình, kể cả bước
// đóng gói Vite và tiến trình con (kế thừa affinity). Gọi đầu tiên trong run.mjs.
// Task Manager (Windows 10+) tính CPU theo "Processor Utility" = thời gian CPU × xung thực tế /
// xung cơ bản, nên CPU đang turbo 160% thì 50% thời gian hiện thành 80%: số luồng ghim phải chia
// thêm hệ số turbo (đo 2026-10-31: ghim 8/12 luồng hiện 78% trên Task Manager).

/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu (kiểu ở cpuLimit.d.mts) */

import { execFileSync } from 'node:child_process'
import { cpus } from 'node:os'

/** Phần CPU / RAM của máy mô phỏng được dùng tối đa. */
export const MACHINE_SHARE = 0.6

/** Mask affinity chỉ dùng được tới 64 luồng (một nhóm processor của Windows). */
const MAX_MASK_THREADS = 64

/**
 * Số luồng được dùng: ⌊số luồng × MACHINE_SHARE / hệ số turbo⌋ (hệ số < 1 coi như 1), tối thiểu 1,
 * tối đa 64.
 */
export function sharedThreadCount(threadCount, boost = 1) {
  const share = Math.floor((threadCount * MACHINE_SHARE) / Math.max(1, boost))
  return Math.min(MAX_MASK_THREADS, Math.max(1, share))
}

export function affinityMask(count) {
  return (1n << BigInt(count)) - 1n
}

function runPowerShell(command) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8'
  })
}

/** Hệ số xung thực tế / xung cơ bản (Windows; tên lớp CIM không đổi theo ngôn ngữ hệ điều hành). */
function readWindowsBoost() {
  const percent = Number(
    runPowerShell(
      '(Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name=\'_Total\'").PercentProcessorPerformance'
    ).trim()
  )
  return Number.isFinite(percent) && percent > 0 ? percent / 100 : 1
}

/**
 * Ghim tiến trình này vào phần CPU được dùng. Trả số luồng được dùng (để chọn số worker) và câu
 * mô tả để in ra console.
 */
export function limitCpu() {
  const threadCount = cpus().length
  try {
    if (process.platform === 'win32') {
      const boost = readWindowsBoost()
      const threads = sharedThreadCount(threadCount, boost)
      runPowerShell(`(Get-Process -Id ${process.pid}).ProcessorAffinity = ${affinityMask(threads)}`)
      const boostNote = `turbo ${Math.round(boost * 100)}%`
      return { threads, message: `Giới hạn CPU: ${threads}/${threadCount} luồng (${boostNote}).` }
    }
    const threads = sharedThreadCount(threadCount)
    if (process.platform === 'linux') {
      // -a: mọi luồng đang có của tiến trình (luồng tạo sau kế thừa).
      const mask = affinityMask(threads).toString(16)
      execFileSync('taskset', ['-a', '-p', mask, String(process.pid)])
      return { threads, message: `Giới hạn CPU: ${threads}/${threadCount} luồng.` }
    }
    const note = `Không ghim được CPU trên ${process.platform}`
    return { threads, message: `${note}: chỉ giới hạn số worker (${threads}).` }
  } catch (error) {
    const threads = sharedThreadCount(threadCount)
    const reason = error instanceof Error ? error.message : String(error)
    return { threads, message: `Ghim CPU lỗi (${reason}): chỉ giới hạn số worker (${threads}).` }
  }
}
