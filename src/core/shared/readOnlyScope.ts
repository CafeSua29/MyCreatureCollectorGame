// Bộ nhớ tạm cho một đoạn tính toán chỉ đọc (docs/rules/core-map.md mục "Bộ nhớ tạm khi chỉ đọc"):
// trong đoạn đó không object nào bị sửa (AI chấm điểm chỉ đọc draft), nên kết quả của hàm thuần nhớ
// theo tham chiếu object là đúng. Ngoài đoạn đó mọi hàm tính lại như thường. Chỉ là bộ nhớ đệm: không
// đổi kết quả, không vào state.

/** Một nút của cây khóa: object khóa kế tiếp → nút con; `hasValue` phân biệt giá trị undefined. */
interface MemoNode {
  next: WeakMap<object, MemoNode>
  hasValue: boolean
  value?: unknown
}

/** Khóa thay cho tham số không có (ví dụ bối cảnh trận undefined). */
const MISSING_KEY = {}

let scopeDepth = 0
let scopeTables: Map<object, MemoNode> | null = null

const newNode = (): MemoNode => ({ next: new WeakMap(), hasValue: false })

/**
 * Chạy `compute` trong phạm vi chỉ đọc: cho tới khi `compute` xong, mọi object đang có coi như bất
 * biến. Lồng nhau thì dùng chung bộ nhớ của phạm vi ngoài cùng.
 */
export function runReadOnlyScope<T>(compute: () => T): T {
  if (scopeDepth === 0) scopeTables = new Map()
  scopeDepth++
  try {
    return compute()
  } finally {
    scopeDepth--
    if (scopeDepth === 0) scopeTables = null
  }
}

/**
 * Nhớ kết quả của `compute` theo bảng `table` và dãy object `keys` (undefined = không có) khi đang ở
 * phạm vi chỉ đọc; ngoài phạm vi thì luôn tính lại. `compute` phải là hàm thuần của các khóa.
 */
export function memoInReadOnlyScope<V>(
  table: object,
  keys: readonly (object | undefined)[],
  compute: () => V
): V {
  if (!scopeTables) return compute()
  let node: MemoNode | undefined = scopeTables.get(table)
  if (!node) {
    node = newNode()
    scopeTables.set(table, node)
  }
  for (const key of keys) {
    const objectKey = key ?? MISSING_KEY
    let child: MemoNode | undefined = node.next.get(objectKey)
    if (!child) {
      child = newNode()
      node.next.set(objectKey, child)
    }
    node = child
  }
  // Ép kiểu: mỗi bảng chỉ lưu kết quả của cùng một hàm nên giá trị đúng kiểu V.
  if (node.hasValue) return node.value as V
  const value = compute()
  node.hasValue = true
  node.value = value
  return value
}
