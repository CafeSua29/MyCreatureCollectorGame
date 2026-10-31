import {
  ACTION_ERROR_MESSAGES,
  type ActionErrorArgs,
  type ActionErrorCode,
  type ActionErrorParams
} from './actionErrors'

/**
 * Action không hợp lệ với state hiện tại. State giữ nguyên. Mang mã lỗi + tham số để renderer
 * dịch; `message` là câu tiếng Việt chỉ để debug.
 */
export class ActionError<C extends ActionErrorCode = ActionErrorCode> extends Error {
  readonly code: C
  readonly params: ActionErrorParams[C]

  constructor(code: C, ...[params]: ActionErrorArgs<C>) {
    // Mã không có tham số được bỏ trống: thay bằng object rỗng (đúng kiểu NoParams).
    const resolved = (params ?? {}) as ActionErrorParams[C]
    super(ACTION_ERROR_MESSAGES[code](resolved))
    this.name = 'ActionError'
    this.code = code
    this.params = resolved
  }
}

/** Lệnh sai dạng (UI gửi sai): một mã chung, `detail` chỉ để debug. */
export function malformedAction(detail: string): ActionError<'malformedAction'> {
  return new ActionError('malformedAction', { detail })
}

/** Dữ liệu game hoặc dữ liệu quái sai (tham chiếu hỏng, giá trị ngoài miền...). */
export class DataError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Dữ liệu không hợp lệ:\n- ${issues.join('\n- ')}`)
    this.name = 'DataError'
    this.issues = issues
  }
}
