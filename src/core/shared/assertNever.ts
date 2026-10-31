/**
 * Dùng ở nhánh `default` của `switch` trên union có trường phân loại: thêm loại mới mà quên xử lý
 * thì TypeScript báo lỗi lúc biên dịch; lỡ gặp giá trị lạ lúc chạy (dữ liệu hỏng) thì ném lỗi.
 */
export function assertNever(value: never, context = 'giá trị'): never {
  throw new Error(`Không xử lý được ${context}: ${JSON.stringify(value)}`)
}
