// Thao tác trên danh sách trait của quái.

import type { Monster } from '../model'

/**
 * Gộp trait theo luật trait cấp: đã có thì cộng thêm `levels` cấp, chưa có thì thêm mới
 * ở cấp `levels`. Không kiểm tra ô trait hay nhóm loại trừ (nơi gọi tự lo).
 */
export function mergeTraitLevel(monster: Monster, traitId: string, levels: number): Monster {
  const existing = monster.traits.find((t) => t.id === traitId)
  const traits = existing
    ? monster.traits.map((t) => (t.id === traitId ? { ...t, level: t.level + levels } : t))
    : [...monster.traits, { id: traitId, level: levels }]
  return { ...monster, traits }
}
