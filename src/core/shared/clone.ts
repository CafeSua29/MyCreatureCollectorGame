import { Decimal } from './big'

/**
 * Sao chép sâu dữ liệu thuần (object, mảng, số, chuỗi) để sửa bản nháp mà không đụng state cũ
 * (quy tắc 1). Thay cho structuredClone vì structuredClone làm mất class Decimal. Decimal là bất
 * biến nên giữ nguyên tham chiếu, không cần chép.
 */
export function cloneData<T>(value: T): T {
  if (Array.isArray(value)) {
    // Ép kiểu vì map giữ nguyên cấu trúc mảng: kết quả cùng kiểu T với đầu vào.
    return value.map((item: unknown) => cloneData(item)) as T
  }
  if (typeof value !== 'object' || value === null || Decimal.isDecimal(value)) return value
  const copy: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(value)) copy[key] = cloneData(field)
  // Ép kiểu vì copy có đúng các khóa và giá trị (đã chép) của value.
  return copy as T
}
