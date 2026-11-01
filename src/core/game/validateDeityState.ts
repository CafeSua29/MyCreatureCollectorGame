// Kiểm tra ân sủng trong save (docs/rules/deities.md): GameState.favor. Gọi từ validateGameState.

import { asObject, checkBig, isValidBig } from '../shared'

/**
 * favor: object id thần → ân sủng (Decimal nguyên ≥ 0). Không kiểm tra id có khớp thần trong dữ liệu
 * (dữ liệu đổi giữa phiên bản; mục thừa vô hại như saturation của giá thị trường).
 */
export function validateDeityState(state: Record<string, unknown>): string[] {
  const favor = asObject(state.favor)
  if (!favor) return ['favor phải là object']
  return Object.entries(favor).flatMap(([deityId, value]) => {
    const issues = checkBig(value, `favor.${deityId}`, 0)
    if (issues.length === 0 && isValidBig(value) && !value.isInteger()) {
      issues.push(`favor.${deityId} phải là số nguyên`)
    }
    return issues
  })
}
