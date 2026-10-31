// Hiển thị số rút gọn ở UI (quy tắc 8 trong CLAUDE.md): 1,2K; 3,4M; 5,6B...
// Dấu thập phân là dấu phẩy, giữ 1 chữ số thập phân, cắt xuống (không làm tròn lên).
// Nhận number, Decimal hoặc chuỗi số (summary trong file save); tính bằng Decimal nên đúng cả
// với số mũ rất lớn (ví dụ 1,2e1000).

import { parseBig, toBig, type BigValue, type Decimal } from '@core'

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']

/** Cắt xuống còn 1 chữ số thập phân, dấu phẩy thập phân: 1.29 → "1,2", 5 → "5". */
function oneDecimal(value: Decimal): string {
  return value.times(10).floor().div(10).toString().replace('.', ',')
}

function toDecimal(value: BigValue): Decimal | null {
  if (typeof value === 'number') return Number.isNaN(value) ? null : toBig(value)
  if (typeof value === 'string') return parseBig(value)
  return value.isNaN() ? null : value
}

export function formatNumber(value: BigValue): string {
  const number = toDecimal(value)
  if (number === null) return '?'
  if (!number.isFinite()) return number.isPositive() ? '∞' : '-∞'
  const sign = number.isNegative() && !number.isZero() ? '-' : ''
  const abs = number.abs()
  if (abs.lt(1000)) return sign + abs.floor().toString()

  // Số mũ cơ số 10 của chữ số đầu tiên (decimal.js: thuộc tính e), chính xác với số rất lớn.
  const exponent = abs.e
  const tier = Math.floor(exponent / 3)
  if (tier < UNITS.length) {
    return sign + oneDecimal(abs.div(toBig(1000).pow(tier))) + UNITS[tier]
  }
  // Vượt bậc đơn vị lớn nhất: dạng mũ, ví dụ 1,2e36.
  return `${sign}${oneDecimal(abs.div(toBig(10).pow(exponent)))}e${exponent}`
}
