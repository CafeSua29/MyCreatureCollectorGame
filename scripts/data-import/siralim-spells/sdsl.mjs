/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Helper quy đổi spell Siralim (skills-planned.json) sang skill có phần `spell` (mục "Spell
// Siralim" ở battle.md, quy ước ở "Dữ liệu Siralim Ultimate" của content-sources-more.md). Hiệu ứng
// / điều kiện / lượng dùng lại helper trait (../siralim-traits/dsl.mjs).

export * from '../siralim-traits/dsl.mjs'

/** Mức sát thương → power: một mục tiêu / mọi địch (quy ước đợt nhập Siralim). */
export const POWER = { small: 40, moderate: 70, large: 90, massive: 120, devastating: 150 }
export const SPREAD = { small: 30, moderate: 55, large: 70, massive: 95, devastating: 120 }
/** Mức hồi máu → % max HP (chủ project chốt: 25 / 35 / 50 / 75; devastating 100). */
export const HEAL = { small: 25, moderate: 35, large: 50, massive: 75, devastating: 100 }
/** Mức tăng / giảm chỉ số → số bậc. */
export const STAGE = { small: 1, moderate: 1, large: 2, massive: 3, devastating: 4 }

const base = (target, extra) => ({
  accuracy: 100,
  priority: 0,
  target,
  effects: [],
  ...extra
})

/** Gom phần spell, bỏ mục rỗng. */
function spellPart({ onTarget, after, powerBonus, powerTimes, attackStat, ignoreDefense }) {
  const part = {}
  if (onTarget?.length) part.onTarget = onTarget
  if (after?.length) part.after = after
  if (powerBonus?.length) part.powerBonus = powerBonus
  if (powerTimes) part.powerTimes = powerTimes
  if (attackStat) part.attackStat = attackStat
  if (ignoreDefense) part.ignoreDefensePercent = ignoreDefense
  return Object.keys(part).length ? { spell: part } : {}
}

/**
 * Spell gây sát thương: `tier` theo mức (hoặc số power), target enemy / allEnemies; `hits` N lần
 * (một mục tiêu: power mỗi đòn ½ mức; mọi địch: gộp thành một đòn power × N / 2).
 */
export function hit(tier, target = 'enemy', opts = {}) {
  const table = target === 'allEnemies' ? SPREAD : POWER
  let power = typeof tier === 'number' ? tier : table[tier]
  const extra = {}
  if (opts.hits && opts.hits > 1) {
    if (target === 'enemy') {
      power = Math.round(power / 2)
      extra.hits = { min: opts.hits, max: opts.hits }
    } else power = Math.round((power * opts.hits) / 2)
  }
  return base(target, {
    category: opts.physical ? 'physical' : 'special',
    power,
    ...extra,
    ...spellPart(opts)
  })
}

/** Spell không gây sát thương trực tiếp (chỉ hiệu ứng). */
export function cast(target, opts = {}) {
  return base(target, { category: 'status', power: 0, ...spellPart(opts) })
}

/** Cộng % sức mạnh: mỗi đơn vị bộ đếm `per`, khi đủ điều kiện `when`. */
export const pb = (percent, per, when) => ({
  percent,
  ...(per ? { per } : {}),
  ...(when ? { when } : {})
})

/** "small, hoặc mức `big` nếu điều kiện" → cộng % để power đạt mức lớn. */
export const ifThen = (small, big, when, target = 'enemy') => {
  const table = target === 'allEnemies' ? SPREAD : POWER
  return pb(Math.round((table[big] / table[small] - 1) * 100), undefined, when)
}

/** Chỉ số công thay thế cho spell (weight %). */
export const basedOn = (stat, weight = 100) => ({ stat, weight })

/** Hiệu ứng áp theo tỉ lệ cho từng mục tiêu. */
export const ch = (effect, chance) => ({ ...effect, chance })
