// Hóa hình (docs/rules/human-form.md): quái có đang mang hình người không, suy từ trạng thái hóa
// hình và biến hình trong trận. Đặt ở model/ để nguồn % chỉ số (registries) lẫn trận đấu dùng chung.

import type { Monster } from './monster'
import { HUMAN_FORM_ON_TRANSFORM } from './transform'

/**
 * Quái đang ở nhân hình và chưa về bản thể trong trận này (Mega / Dynamax / Hiện nguyên hình đưa
 * về bản thể tới hết trận, kể cả khi biến hình đã kết thúc; Tera giữ nhân hình).
 */
export function isHumanShape(monster: Monster): boolean {
  if (monster.humanForm !== 'human') return false
  const transform = monster.battleTransform
  return !transform || HUMAN_FORM_ON_TRANSFORM[transform.kind] === 'keep'
}
