// Tìm bậc trong danh sách bậc theo ngưỡng `{ from }` tăng dần (bậc tư chất, phẩm cấp loài).
// Dữ liệu bảo đảm có ít nhất một bậc và bậc đầu từ 0 (checkThresholdTiers ở gameData/).

/** Vị trí bậc cao nhất có `from` đạt (`isReached(from)`); không bậc nào đạt thì 0. */
export function highestTierIndex(
  tiers: readonly { from: number }[],
  isReached: (from: number) => boolean
): number {
  return tiers.reduce((best, tier, index) => (isReached(tier.from) ? index : best), 0)
}
