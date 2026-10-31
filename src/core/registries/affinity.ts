// Tăng / giảm độ thân mật (docs/rules/affinity.md): điểm duy nhất đổi Monster.affinity. Lượng tăng
// nhân tổng hook affinityGainPercent (trang bị kiểu Chuông An Thần), làm tròn; lượng giảm không nhân.
// Kẹp trong [0, config.affinity.max].

import type { GameData, Monster } from '../model'
import { forEachTraitHook } from './traitHooks'

const clampAffinity = (data: GameData, value: number): number =>
  Math.min(data.config.affinity.max, Math.max(0, value))

/**
 * Lượng thân mật thực tăng sau hook affinityGainPercent và % thêm của nơi gọi (món ăn linh thực,
 * docs/rules/cooking.md; cộng cùng tổng với hook), làm tròn, không âm.
 */
export function affinityGain(
  data: GameData,
  monster: Monster,
  amount: number,
  extraPercent = 0
): number {
  let percent = extraPercent
  forEachTraitHook(data, monster, (handler, params, scale) => {
    percent += handler.affinityGainPercent?.(params, scale) ?? 0
  })
  return Math.max(0, Math.round(amount * (1 + percent / 100)))
}

/**
 * Đổi thân mật: dương = tăng (nhân hook + `extraGainPercent`), âm = giảm. Không đổi gì thì trả lại
 * chính quái.
 */
export function changeAffinity(
  data: GameData,
  monster: Monster,
  amount: number,
  extraGainPercent = 0
): Monster {
  const delta = amount > 0 ? affinityGain(data, monster, amount, extraGainPercent) : amount
  const affinity = clampAffinity(data, monster.affinity + delta)
  return affinity === monster.affinity ? monster : { ...monster, affinity }
}
