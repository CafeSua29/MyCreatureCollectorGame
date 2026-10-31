// Hàm băm tất định cho giá trị "ngẫu nhiên theo ngày" không lưu vào save và không tốn RNG của
// save (ví dụ dao động giá thị trường): cùng đầu vào luôn ra cùng kết quả, đổi seed không đổi.

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const TWO_POW_32 = 4294967296

/** Số thực trong [0, 1) băm từ các phần (FNV-1a 32-bit rồi trộn bit kiểu murmur3 fmix32). */
export function hashToUnit(...parts: ReadonlyArray<string | number>): number {
  const text = parts.join('|')
  let hash = FNV_OFFSET
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME)
  }
  // FNV thô của chuỗi gần giống nhau (day 1, day 2) chỉ khác vài bit cao; trộn để phân bố đều.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16
  return (hash >>> 0) / TWO_POW_32
}
