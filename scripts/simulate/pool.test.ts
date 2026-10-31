import { describe, expect, it } from 'vitest'
import { runInOrder } from './pool'

/** Việc giả: xong sau `delay` ms, trả về chính nó kèm làn đã chạy. */
const delayed = (delay: number, lane: number): Promise<{ delay: number; lane: number }> =>
  new Promise((resolve) => setTimeout(() => resolve({ delay, lane }), delay))

describe('runInOrder', () => {
  it('kết quả theo thứ tự việc dù việc sau xong trước', async () => {
    const jobs = [30, 1, 20, 2, 10]
    const results = await runInOrder(jobs, 3, delayed)
    expect(results.map((r) => r.delay)).toEqual(jobs)
  })

  it('không chạy quá số làn cùng lúc, làn trong [0, lanes)', async () => {
    let running = 0
    let peak = 0
    const results = await runInOrder([5, 5, 5, 5, 5, 5], 2, async (delay, lane) => {
      running++
      peak = Math.max(peak, running)
      const result = await delayed(delay, lane)
      running--
      return result
    })
    expect(peak).toBe(2)
    expect(new Set(results.map((r) => r.lane))).toEqual(new Set([0, 1]))
  })

  it('nhiều làn hơn số việc, 0 việc, báo tiến độ đủ số lần', async () => {
    const progress: number[] = []
    const results = await runInOrder([1, 2], 8, delayed, { onDone: (done) => progress.push(done) })
    expect(results).toHaveLength(2)
    expect(progress).toEqual([1, 2])
    expect(await runInOrder([], 4, delayed)).toEqual([])
  })

  it('một việc lỗi thì cả lần chạy lỗi', async () => {
    const run = runInOrder([1, 2, 3], 2, async (job) => {
      if (job === 2) throw new Error('hỏng')
      return job
    })
    await expect(run).rejects.toThrow('hỏng')
  })

  it('priority: việc cao hơn bắt đầu trước, kết quả vẫn theo thứ tự danh sách', async () => {
    const started: number[] = []
    const results = await runInOrder(
      [1, 5, 2, 9, 3],
      1,
      async (job) => {
        started.push(job)
        return job * 10
      },
      { priority: (job) => (job > 4 ? 1 : 0) }
    )
    expect(started).toEqual([5, 9, 1, 2, 3])
    expect(results).toEqual([10, 50, 20, 90, 30])
  })
})
