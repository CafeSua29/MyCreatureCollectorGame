// RNG có seed (mulberry32), dạng hàm thuần.
// State là một số nguyên 32-bit không dấu, lưu thẳng vào save.
// Mỗi hàm trả về [giá trị, state mới]; state cũ không đổi.

import { toBig, type Decimal } from './big'

export type RngState = number

export function createRng(seed: number): RngState {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`Seed phải là số hữu hạn, nhận ${seed}`)
  }
  return seed >>> 0
}

/** Số nguyên trong [0, 2^32). */
export function nextUint32(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [(t ^ (t >>> 14)) >>> 0, next]
}

/** Số thực trong [0, 1). */
export function nextFloat(state: RngState): [number, RngState] {
  const [value, next] = nextUint32(state)
  return [value / 4294967296, next]
}

/** Số nguyên trong [min, max], tính cả hai đầu. */
export function nextInt(state: RngState, min: number, max: number): [number, RngState] {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
    throw new RangeError(`Khoảng nextInt không hợp lệ: [${min}, ${max}]`)
  }
  const [value, next] = nextFloat(state)
  return [min + Math.floor(value * (max - min + 1)), next]
}

const TWO_POW_21 = 2 ** 21
const TWO_POW_53 = 2 ** 53

/**
 * Số nguyên Decimal trong [min, max], tính cả hai đầu (min, max là số nguyên). Khoảng vừa số
 * nguyên an toàn thì đi đúng đường nextInt (cùng kết quả, cùng một lần tung); lớn hơn thì ghép
 * hai lần tung thành tỉ lệ 53 bit, nên khoảng cực lớn chỉ chia được thành 2^53 mức.
 */
export function nextBigInt(state: RngState, min: Decimal, max: Decimal): [Decimal, RngState] {
  if (!min.isInteger() || !max.isInteger() || min.gt(max)) {
    throw new RangeError(`Khoảng nextBigInt không hợp lệ: [${min}, ${max}]`)
  }
  if (min.abs().lte(Number.MAX_SAFE_INTEGER) && max.abs().lte(Number.MAX_SAFE_INTEGER)) {
    const [value, next] = nextInt(state, min.toNumber(), max.toNumber())
    return [toBig(value), next]
  }
  let high: number
  let low: number
  ;[high, state] = nextUint32(state)
  ;[low, state] = nextUint32(state)
  const fraction = toBig(high % TWO_POW_21)
    .times(2 ** 32)
    .plus(low)
    .div(TWO_POW_53)
  const span = max.minus(min).plus(1)
  return [min.plus(span.times(fraction).floor()), state]
}

/** Chọn ngẫu nhiên một phần tử. */
export function pick<T>(state: RngState, items: readonly T[]): [T, RngState] {
  if (items.length === 0) {
    throw new RangeError('Không thể pick từ danh sách rỗng')
  }
  const [index, next] = nextInt(state, 0, items.length - 1)
  return [items[index], next]
}

/** Chọn ngẫu nhiên theo trọng số (trọng số ≥ 0, tổng > 0). */
export function pickWeighted<T>(
  state: RngState,
  items: readonly T[],
  weightOf: (item: T) => number
): [T, RngState] {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0)
  if (!(total > 0)) {
    throw new RangeError('pickWeighted cần tổng trọng số > 0')
  }
  const [value, next] = nextFloat(state)
  let remaining = value * total
  for (const item of items) {
    remaining -= weightOf(item)
    if (remaining < 0) return [item, next]
  }
  // Sai số làm tròn: trả về phần tử cuối có trọng số > 0.
  return [[...items].reverse().find((item) => weightOf(item) > 0) as T, next]
}

/** Tung xúc xắc theo % (≥ 100 luôn trúng, ≤ 0 luôn trượt; hai trường hợp này không tốn RNG). */
export function rollPercent(rng: RngState, chance: number): [boolean, RngState] {
  if (chance >= 100) return [true, rng]
  if (chance <= 0) return [false, rng]
  const [value, next] = nextFloat(rng)
  return [value * 100 < chance, next]
}

/**
 * Số nguyên từ giá trị kỳ vọng: phần nguyên chắc chắn, phần lẻ tung RNG (kỳ vọng giữ nguyên). Kẹp
 * trong [0, MAX_SAFE_INTEGER]; số nguyên (gồm 0) không tốn RNG.
 */
export function rollAmount(rng: RngState, expected: number): [number, RngState] {
  if (!(expected > 0)) return [0, rng]
  if (expected >= Number.MAX_SAFE_INTEGER) return [Number.MAX_SAFE_INTEGER, rng]
  const whole = Math.floor(expected)
  const fraction = expected - whole
  if (fraction === 0) return [whole, rng]
  const [value, next] = nextFloat(rng)
  return [value < fraction ? whole + 1 : whole, next]
}

/** Xáo trộn (Fisher–Yates), trả về mảng mới. */
export function shuffle<T>(state: RngState, items: readonly T[]): [T[], RngState] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    let j: number
    ;[j, state] = nextInt(state, 0, i)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return [result, state]
}
