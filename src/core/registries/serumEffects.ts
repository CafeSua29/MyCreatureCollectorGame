// Registry loại hiệu ứng của huyết thanh (docs/rules/implant.md): mỗi loại tự random hiệu ứng theo
// bậc, áp lên quái khi cấy (thành công +, thất bại − = hiệu ứng ngược), kiểm tra bậc trong dữ liệu
// và hiệu ứng trong save. Thêm loại mới = thêm vào SERUM_EFFECT_KINDS (model/implant.ts) + một handler
// ở đây (Record theo union nên thiếu handler thì TypeScript báo lỗi).

import {
  STAT_NAMES,
  type FlatStatSerumTier,
  type GameData,
  type HookEffectSerumTier,
  type Monster,
  type SerumEffect,
  type SerumEffectKind,
  type SerumTierConfig,
  type StatName
} from '../model'
import {
  asObject,
  checkInteger,
  floorBig,
  isValidBig,
  maxBig,
  nextBigInt,
  pickWeighted,
  shuffle,
  type Decimal,
  type RngState
} from '../shared'
import { floorGeneMultiplier } from './aptitude'

type TierOf<K extends SerumEffectKind> = Extract<SerumTierConfig, { kind: K }>
type EffectOf<K extends SerumEffectKind> = Extract<SerumEffect, { kind: K }>

/** Cộng (1) khi cấy thành công, trừ (−1) khi thất bại. */
export type ImplantSign = 1 | -1

export interface SerumEffectHandler<K extends SerumEffectKind> {
  /** Trường riêng của bậc loại này (ngoài id, kind, weight, price). */
  tierFields: readonly string[]
  /** Kiểm tra trường riêng của bậc trong dữ liệu. */
  validateTier(data: GameData, tier: Record<string, unknown>, where: string): string[]
  /** Hiệu ứng của một huyết thanh bậc này (lúc đổi hàng, theo tầng cao nhất). */
  roll(
    data: GameData,
    rng: RngState,
    tier: TierOf<K>,
    highestFloor: number
  ): [EffectOf<K>[], RngState]
  /** Kiểm tra hiệu ứng của huyết thanh bậc này trong save (đủ, đúng loại, đúng khoảng). */
  validateEffects(
    data: GameData,
    effects: readonly unknown[],
    tier: TierOf<K>,
    path: string
  ): string[]
  /** Quái sau khi cấy một hiệu ứng (không kiểm tra gì). */
  apply(monster: Monster, effect: EffectOf<K>, sign: ImplantSign): Monster
}

// ---------- flatStat: cộng thẳng chỉ số gốc (implantBonusStats) ----------

const flatStat: SerumEffectHandler<'flatStat'> = {
  tierFields: ['statCount', 'min', 'max'],
  validateTier(_data, tier, where) {
    const issues = [
      ...checkInteger(tier.statCount, `${where}.statCount`, 1),
      ...checkInteger(tier.min, `${where}.min`, 1),
      ...checkInteger(tier.max, `${where}.max`, 1)
    ]
    if (typeof tier.statCount === 'number' && tier.statCount > STAT_NAMES.length) {
      issues.push(`${where}.statCount không được vượt ${STAT_NAMES.length} chỉ số`)
    }
    if (typeof tier.min === 'number' && typeof tier.max === 'number' && tier.min > tier.max) {
      issues.push(`${where}: min (${tier.min}) lớn hơn max (${tier.max})`)
    }
    return issues
  },
  roll(data, rng, tier: FlatStatSerumTier, highestFloor) {
    // Khoảng ở tầng 1 nhân hệ số gen của tầng (cùng hệ số với gen quái hoang), tối thiểu 1.
    const multiplier = floorGeneMultiplier(data, highestFloor)
    const min = maxBig(1, floorBig(multiplier.times(tier.min)))
    const max = maxBig(min, floorBig(multiplier.times(tier.max)))
    let order: StatName[]
    ;[order, rng] = shuffle(rng, STAT_NAMES)
    const effects: EffectOf<'flatStat'>[] = []
    for (const stat of order.slice(0, tier.statCount)) {
      let amount: Decimal
      ;[amount, rng] = nextBigInt(rng, min, max)
      effects.push({ kind: 'flatStat', stat, amount })
    }
    return [effects, rng]
  },
  validateEffects(_data, effects, tier, path) {
    const issues: string[] = []
    if (effects.length !== tier.statCount) {
      issues.push(`${path} phải có đúng ${tier.statCount} chỉ số, có ${effects.length}`)
    }
    const seen = new Set<unknown>()
    effects.forEach((value, i) => {
      const effect = asObject(value)
      const at = `${path}[${i}]`
      if (effect?.kind !== 'flatStat') {
        issues.push(`${at}.kind phải là "flatStat"`)
        return
      }
      if (!STAT_NAMES.some((stat) => stat === effect.stat)) {
        issues.push(`${at}.stat không hợp lệ "${String(effect.stat)}"`)
      } else if (seen.has(effect.stat)) issues.push(`${at}.stat bị trùng "${String(effect.stat)}"`)
      seen.add(effect.stat)
      const { amount } = effect
      if (!isValidBig(amount) || !amount.isInteger() || amount.lt(1)) {
        issues.push(`${at}.amount phải là số nguyên ≥ 1`)
      }
    })
    return issues
  },
  apply(monster, effect, sign) {
    const current = monster.implantBonusStats[effect.stat]
    return {
      ...monster,
      implantBonusStats: {
        ...monster.implantBonusStats,
        [effect.stat]: current.plus(effect.amount.times(sign))
      }
    }
  }
}

// ---------- hookEffect: cấp hiệu ứng (hook trait) trong implantEffects ----------

const hookEffect: SerumEffectHandler<'hookEffect'> = {
  tierFields: ['levels'],
  validateTier(data, tier, where) {
    const issues = checkInteger(tier.levels, `${where}.levels`, 1)
    if (Object.keys(data.serumEffects).length === 0) {
      issues.push(`${where}: bậc hiệu ứng cần ít nhất một hiệu ứng trong serumEffects.json`)
    }
    return issues
  },
  roll(data, rng, tier: HookEffectSerumTier) {
    let effectId: string
    ;[effectId, rng] = pickWeighted(
      rng,
      Object.keys(data.serumEffects),
      (id) => data.serumEffects[id].weight
    )
    return [[{ kind: 'hookEffect', effectId, levels: tier.levels }], rng]
  },
  validateEffects(data, effects, tier, path) {
    if (effects.length !== 1) return [`${path} phải có đúng 1 hiệu ứng, có ${effects.length}`]
    const effect = asObject(effects[0])
    const at = `${path}[0]`
    if (effect?.kind !== 'hookEffect') return [`${at}.kind phải là "hookEffect"`]
    const issues: string[] = []
    if (typeof effect.effectId !== 'string' || !Object.hasOwn(data.serumEffects, effect.effectId)) {
      issues.push(`${at}.effectId: hiệu ứng không tồn tại "${String(effect.effectId)}"`)
    }
    if (effect.levels !== tier.levels) issues.push(`${at}.levels phải bằng ${tier.levels}`)
    return issues
  },
  apply(monster, effect, sign) {
    const level = (monster.implantEffects[effect.effectId] ?? 0) + effect.levels * sign
    const { [effect.effectId]: _old, ...rest } = monster.implantEffects
    return {
      ...monster,
      implantEffects: level === 0 ? rest : { ...rest, [effect.effectId]: level }
    }
  }
}

/** Handler theo loại hiệu ứng. */
export const SERUM_EFFECTS: { readonly [K in SerumEffectKind]: SerumEffectHandler<K> } = {
  flatStat,
  hookEffect
}

// Hàm điều phối: TypeScript không nối được kind của bậc / hiệu ứng với handler cùng kind qua chỉ
// mục union, nên ép kiểu handler về đúng kind vừa đọc (an toàn vì tra theo chính kind đó).
const handlerOf = <K extends SerumEffectKind>(kind: K): SerumEffectHandler<K> =>
  SERUM_EFFECTS[kind] as unknown as SerumEffectHandler<K>

/** Hiệu ứng của một huyết thanh bậc `tier` (theo loại của bậc). */
export function rollSerumEffects(
  data: GameData,
  rng: RngState,
  tier: SerumTierConfig,
  highestFloor: number
): [SerumEffect[], RngState] {
  return handlerOf(tier.kind).roll(data, rng, tier as TierOf<typeof tier.kind>, highestFloor)
}

/** Quái sau khi cấy một hiệu ứng (sign 1: thành công, −1: thất bại). */
export function applySerumEffect(
  monster: Monster,
  effect: SerumEffect,
  sign: ImplantSign
): Monster {
  return handlerOf(effect.kind).apply(monster, effect as EffectOf<typeof effect.kind>, sign)
}

/** Kiểm tra hiệu ứng của một huyết thanh trong save theo bậc của nó. */
export function validateSerumEffects(
  data: GameData,
  effects: readonly unknown[],
  tier: SerumTierConfig,
  path: string
): string[] {
  return handlerOf(tier.kind).validateEffects(data, effects, tier as TierOf<typeof tier.kind>, path)
}
