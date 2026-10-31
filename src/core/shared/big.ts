// Số lớn (docs/rules/big-numbers.md): điểm DUY NHẤT import thư viện decimal.js trong toàn project.
// Nơi khác dùng `Decimal` và các hàm dưới đây qua '../shared' (trong core) hoặc '@core'.
//
// Chọn decimal.js (không phải break_infinity.js) vì cần khớp tuyệt đối số học số nguyên nhỏ:
// break_infinity lưu mantissa số thực nên 15976 × 715 ra 11422839,999… (làm tròn xuống sai 1).
// decimal.js tính thập phân chính xác tới PRECISION chữ số, số mũ tới ±9e15.
//
// Lưu ý khi viết công thức: phép chia làm tròn ở chữ số thứ PRECISION (1/3 × 3 = 0,999…), nên
// nhân hết trước rồi chia một lần, nhất là trước khi làm tròn xuống.

import DecimalLibrary from 'decimal.js'

/** Số chữ số có nghĩa: số nguyên tới 1e40 chính xác tuyệt đối, lớn hơn thì sai số tương đối. */
const PRECISION = 40

/**
 * Bản clone có cấu hình riêng (không đổi cấu hình toàn cục của thư viện). Coi như bất biến: mọi
 * phép tính trả về Decimal mới (quy tắc 1).
 */
export const Decimal = DecimalLibrary.clone({
  precision: PRECISION,
  rounding: DecimalLibrary.ROUND_HALF_UP
})
export type Decimal = DecimalLibrary

/** Giá trị đổi được sang Decimal: số JS hữu hạn, chuỗi số, hoặc Decimal. */
export type BigValue = Decimal | number | string

/** Tạo Decimal từ number / chuỗi / Decimal. */
export function toBig(value: BigValue): Decimal {
  return new Decimal(value)
}

export const BIG_ZERO: Decimal = toBig(0)
export const BIG_ONE: Decimal = toBig(1)

/** Làm tròn xuống (về phía âm vô cực). */
export function floorBig(value: BigValue): Decimal {
  return toBig(value).floor()
}

/** Làm tròn lên. */
export function ceilBig(value: BigValue): Decimal {
  return toBig(value).ceil()
}

export function maxBig(first: BigValue, ...rest: readonly BigValue[]): Decimal {
  return rest.reduce<Decimal>((max, value) => Decimal.max(max, value), toBig(first))
}

export function minBig(first: BigValue, ...rest: readonly BigValue[]): Decimal {
  return rest.reduce<Decimal>((min, value) => Decimal.min(min, value), toBig(first))
}

/** Đúng khi value là Decimal hữu hạn, không NaN (quy tắc 12: không bao giờ để ra Infinity / NaN). */
export function isValidBig(value: unknown): value is Decimal {
  return Decimal.isDecimal(value) && value.isFinite()
}

/**
 * Đọc Decimal từ dữ liệu file save (chuỗi, hoặc số JS ở save cũ). Trả về null nếu không đọc được,
 * ra NaN hay không hữu hạn.
 */
export function parseBig(value: unknown): Decimal | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (typeof value === 'string' && !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value.trim())) {
    return null
  }
  try {
    const parsed = toBig(value)
    return isValidBig(parsed) ? parsed : null
  } catch {
    // decimal.js ném lỗi với chuỗi không phải số: coi như save lỗi, nơi gọi báo đường dẫn trường.
    return null
  }
}

/**
 * Đổi sang number (chỉ dùng cho tỉ lệ, phần trăm, hiển thị). Số quá lớn ra ±Infinity; nơi gọi
 * phải chắc giá trị nằm trong khoảng của number.
 */
export function bigToNumber(value: BigValue): number {
  return toBig(value).toNumber()
}
