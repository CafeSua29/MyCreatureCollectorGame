// Mốc tăng dần rồi gấp đôi mãi (ô đồ cầm theo tầng, theo cảnh giới ngự thú sư; sau này sức chứa kho).

/**
 * Số mốc đã đạt với giá trị `value`: danh sách mốc tăng dần, sau mốc cuối các mốc tiếp theo gấp đôi
 * mốc trước (cuối 50 thì 100, 200...). Danh sách rỗng hoặc mốc cuối ≤ 0 thì không gấp đôi.
 */
export function countMilestonesReached(milestones: readonly number[], value: number): number {
  let count = 0
  let milestone = 0
  for (const next of milestones) {
    milestone = next
    if (value < milestone) return count
    count++
  }
  if (milestone <= 0) return count
  for (milestone *= 2; milestone <= value; milestone *= 2) count++
  return count
}

/**
 * Kiểm tra danh sách mốc: số nguyên tăng dần, mốc đầu ≥ min (để gấp đôi không đứng yên ở 0).
 */
export function checkMilestones(value: unknown, field: string, min: number): string[] {
  if (!Array.isArray(value)) return [`${field} phải là danh sách`]
  return value.flatMap((entry: unknown, i) => {
    const lowest = i > 0 ? Number(value[i - 1]) + 1 : min
    return Number.isSafeInteger(entry) && (entry as number) >= lowest
      ? []
      : [`${field}[${i}] phải là số nguyên ≥ ${lowest}, nhận ${String(entry)}`]
  })
}
