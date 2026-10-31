// Bùa (docs/rules/dex.md mục "Bùa"): có trong túi là có tác dụng. Luật gộp từng loại hiệu ứng ở một
// bảng (thêm loại = thêm mục, TypeScript báo nếu thiếu); điểm duy nhất để hỏi "bùa cho bao nhiêu".

import type { CharmEffectType, GameData, Inventory } from '../model'

interface CharmEffectRule {
  /** Giá trị khi không có bùa nào. */
  identity: number
  combine: (total: number, value: number) => number
  /** Giá trị hợp lệ trong dữ liệu (kiểm tra lúc khởi động). */
  isValid: (value: number) => boolean
  describe: string
}

export const CHARM_EFFECT_RULES: Readonly<Record<CharmEffectType, CharmEffectRule>> = {
  // Nhân tỉ lệ ra shiny (như Shiny Charm ×3): nhiều bùa thì nhân với nhau.
  shinyChanceMultiplier: {
    identity: 1,
    combine: (total, value) => total * value,
    isValid: (value) => Number.isFinite(value) && value > 0,
    describe: 'số > 0'
  },
  // Thêm lượt ấp trứng mỗi trận thắng (như Oval Charm giúp có trứng nhanh hơn): cộng dồn.
  eggStepBonus: {
    identity: 0,
    combine: (total, value) => total + value,
    isValid: (value) => Number.isInteger(value) && value >= 0,
    describe: 'số nguyên ≥ 0'
  },
  // Trứng tiến thêm số bước này mỗi lần nghỉ (Ôn Dưỡng Lò, docs/rules/breeding-eggs.md): cộng dồn.
  restEggSteps: {
    identity: 0,
    combine: (total, value) => total + value,
    isValid: (value) => Number.isInteger(value) && value >= 0,
    describe: 'số nguyên ≥ 0'
  },
  // Cấp cần câu / cuốc (docs/rules/gathering.md): nhiều dụng cụ thì dùng cái cấp cao nhất.
  fishingRodTier: {
    identity: 0,
    combine: (total, value) => Math.max(total, value),
    isValid: (value) => Number.isInteger(value) && value >= 1,
    describe: 'số nguyên ≥ 1'
  },
  pickaxeTier: {
    identity: 0,
    combine: (total, value) => Math.max(total, value),
    isValid: (value) => Number.isInteger(value) && value >= 1,
    describe: 'số nguyên ≥ 1'
  }
}

/** Tổng hiệu ứng `type` của mọi bùa đang có trong túi (mỗi loại bùa tính một lần dù có nhiều cái). */
export function charmEffect(data: GameData, inventory: Inventory, type: CharmEffectType): number {
  const rule = CHARM_EFFECT_RULES[type]
  let total = rule.identity
  for (const itemId of Object.keys(inventory.stacks)) {
    const item = data.items[itemId]
    if (item?.category !== 'charm') continue
    for (const effect of item.effects) {
      if (effect.type === type) total = rule.combine(total, effect.value)
    }
  }
  return total
}
