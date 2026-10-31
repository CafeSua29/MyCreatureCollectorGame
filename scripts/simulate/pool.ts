// Chạy nhiều việc cùng lúc nhưng trả kết quả đúng thứ tự danh sách việc (không theo thứ tự xong),
// để CSV và bảng console giống hệt nhau dù chạy với bao nhiêu worker.

/** Chạy một việc trên làn `lane` (0 ≤ lane < số làn); mỗi làn chỉ chạy một việc một lúc. */
export type JobExecutor<Job, Result> = (job: Job, lane: number) => Promise<Result>

export interface RunInOrderOptions<Job> {
  onDone?: (done: number, total: number) => void
  /**
   * Việc có priority cao hơn được bắt đầu trước (cùng priority giữ thứ tự danh sách). Cho việc
   * dài chạy trước để không còn một việc dài chạy một mình ở cuối. Không đổi thứ tự kết quả.
   */
  priority?: (job: Job) => number
}

/**
 * Chạy jobs trên `lanes` làn song song, mỗi làn lấy việc kế tiếp khi xong việc trước. Kết quả
 * theo thứ tự jobs. Một việc lỗi thì cả lần chạy lỗi.
 */
export async function runInOrder<Job, Result>(
  jobs: readonly Job[],
  lanes: number,
  execute: JobExecutor<Job, Result>,
  { onDone, priority }: RunInOrderOptions<Job> = {}
): Promise<Result[]> {
  const startOrder = jobs.map((_, index) => index)
  if (priority) startOrder.sort((a, b) => priority(jobs[b]) - priority(jobs[a]))
  const results = new Array<Result>(jobs.length)
  let next = 0
  let done = 0
  const runLane = async (lane: number): Promise<void> => {
    while (next < startOrder.length) {
      const index = startOrder[next++]
      results[index] = await execute(jobs[index], lane)
      done++
      onDone?.(done, jobs.length)
    }
  }
  const laneCount = Math.max(1, Math.min(lanes, jobs.length))
  await Promise.all(Array.from({ length: laneCount }, (_, lane) => runLane(lane)))
  return results
}
