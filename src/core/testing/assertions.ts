import { expect } from 'vitest'
import { ActionError, type ActionErrorCode, type ActionErrorParams } from '../shared'
import type { GameLogEntry, GameLogType, GameState } from '../model'

/**
 * Thay cho `!` trong test: trả về giá trị nếu có, không thì ném lỗi rõ ràng để test đỏ đúng chỗ
 * (quy tắc code sạch: không dùng non-null assertion, kể cả trong test).
 */
export function defined<T>(value: T | null | undefined, what = 'giá trị'): T {
  if (value === null || value === undefined) throw new Error(`Thiếu ${what} (null / undefined)`)
  return value
}

/** Dòng log ngoài trận đầu tiên loại `type` của action vừa làm (không có thì undefined). */
export function findLog<T extends GameLogType>(
  state: Pick<GameState, 'log'>,
  type: T
): Extract<GameLogEntry, { type: T }> | undefined {
  // Ép kiểu: vừa lọc theo type.
  return state.log.find((entry) => entry.type === type) as
    Extract<GameLogEntry, { type: T }> | undefined
}

/**
 * Chạy fn, kiểm tra nó ném ActionError đúng mã (và tham số nếu truyền, so một phần). Test so mã lỗi
 * chứ không so câu debug (mục "Mã lỗi action").
 */
export function expectActionError<C extends ActionErrorCode>(
  fn: () => unknown,
  code: C,
  params?: Partial<ActionErrorParams[C]>
): void {
  let thrown: unknown = null
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  if (!(thrown instanceof ActionError)) {
    throw new Error(`Cần ném ActionError "${code}", nhận ${String(thrown)}`)
  }
  expect(thrown.code).toBe(code)
  if (params) expect(thrown.params).toMatchObject(params)
}
