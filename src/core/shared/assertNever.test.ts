import { describe, expect, it } from 'vitest'
import { assertNever } from './assertNever'

describe('assertNever', () => {
  it('ném lỗi kèm ngữ cảnh và giá trị lạ', () => {
    // Ép kiểu để giả lập giá trị lạ lúc chạy (ví dụ dữ liệu hỏng), điều TypeScript không cho viết.
    const unknownKind = { kind: 'mystery' } as never
    expect(() => assertNever(unknownKind, 'loại sự kiện')).toThrow(
      'Không xử lý được loại sự kiện: {"kind":"mystery"}'
    )
    expect(() => assertNever('x' as never)).toThrow('Không xử lý được giá trị: "x"')
  })
})
