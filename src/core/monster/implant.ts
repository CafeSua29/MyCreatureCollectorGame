// Cấy ghép trên quái (docs/rules/implant.md): tỉ lệ thành công dùng chung cho action (progression)
// và MonsterView (roster).

import type { GameData, Monster } from '../model'

/**
 * Tỉ lệ (%) lần cấy tiếp theo thành công: baseChance × chanceFalloff^(số lần đã cấy), mọi bậc như
 * nhau. Điểm DUY NHẤT tính tỉ lệ: vật phẩm / trait đổi tỉ lệ sau này thêm vào đây.
 */
export function implantChance(data: GameData, monster: Monster): number {
  const { baseChance, chanceFalloff } = data.config.implant
  return baseChance * chanceFalloff ** monster.implantAttempts
}
