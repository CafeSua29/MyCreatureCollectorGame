// Registry điều kiện của bóng (mục "Bắt quái" ở battle.md): như Quick Ball, Timer Ball, Net Ball,
// Dusk Ball, Repeat Ball, Level Ball của Pokémon. Bóng khai báo `bonuses: [{ type, params }]` trong
// items.json; điều kiện thỏa thì nhân hệ số của nó vào hệ số bóng. Thêm điều kiện mới = thêm handler
// vào BALL_BONUSES.

import { asObject, checkInteger, checkNumber } from '../shared'
import { HOURS_PER_DAY, type BallItem, type GameData, type Monster } from '../model'
import { checkIdList } from './paramChecks'
import { raceMatchesAny, raceRefIds } from './races'
import { monsterWeightKg } from './weight'

/** Bối cảnh lúc ném: lượt của trận, giờ trong ngày, loài đã sở hữu, level quái ném. */
export interface BallContext {
  data: GameData
  target: Monster
  /** Lượt hiện tại của trận (1 = lượt đầu). */
  turn: number
  /** Giờ trong ngày (0–23) của đồng hồ game. */
  hour: number
  /** Loài gốc (baseSpeciesId) người chơi đang sở hữu (đội, kho, trứng). */
  ownedSpeciesIds: ReadonlySet<string>
  /** Level quái ném bóng. */
  userLevel: number
}

export interface BallBonusHandler {
  validateParams(params: unknown, data: GameData): string[]
  /** Hệ số nhân (1 = không có tác dụng); bỏ trống = 1. */
  multiplier?(params: unknown, ctx: BallContext): number
  /** Cộng thẳng vào catchRate của loài (thang 0–100, kiểu Heavy Ball); bỏ trống = 0. */
  catchRateAdd?(params: unknown, ctx: BallContext): number
}

const multiplierOf = (params: unknown): number => (params as { multiplier: number }).multiplier

/** params có `multiplier` > 0 và các trường riêng (kiểm tra bằng `extra`). */
function withMultiplier(
  extra: (obj: Record<string, unknown>, data: GameData) => string[] = () => []
): BallBonusHandler['validateParams'] {
  return (params, data) => {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [...checkNumber(obj.multiplier, 'multiplier', Number.MIN_VALUE), ...extra(obj, data)]
  }
}

// ---------- firstTurn: lượt đầu của trận (Quick Ball) ----------

const firstTurn: BallBonusHandler = {
  validateParams: withMultiplier(),
  multiplier: (params, ctx) => (ctx.turn === 1 ? multiplierOf(params) : 1)
}

// ---------- turnScaling: càng nhiều lượt càng mạnh (Timer Ball) ----------

interface TurnScalingParams {
  perTurn: number
  max: number
}

const turnScaling: BallBonusHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    return [...checkNumber(obj.perTurn, 'perTurn', 0), ...checkNumber(obj.max, 'max', 1)]
  },
  multiplier(params, ctx) {
    const { perTurn, max } = params as TurnScalingParams
    return Math.min(max, 1 + perTurn * (ctx.turn - 1))
  }
}

// ---------- targetElement / targetRace: quái có hệ / race này (Net Ball, Dive Ball) ----------

const targetElement: BallBonusHandler = {
  validateParams: withMultiplier((obj, data) =>
    checkIdList(obj.elementIds, 'elementIds', data.elements, { label: 'hệ' })
  ),
  multiplier(params, ctx) {
    const { elementIds } = params as { elementIds: string[] }
    return ctx.target.elementIds.some((id) => elementIds.includes(id)) ? multiplierOf(params) : 1
  }
}

const targetRace: BallBonusHandler = {
  validateParams: withMultiplier((obj, data) =>
    checkIdList(obj.raceIds, 'raceIds', raceRefIds(data), { label: 'race' })
  ),
  multiplier(params, ctx) {
    const { raceIds } = params as { raceIds: string[] }
    return raceMatchesAny(ctx.data, ctx.target.raceId, raceIds) ? multiplierOf(params) : 1
  }
}

// ---------- hours: trong khung giờ (Dusk Ball: đêm); fromHour > toHour = qua nửa đêm ----------

const hours: BallBonusHandler = {
  validateParams: withMultiplier((obj) => [
    ...checkInteger(obj.fromHour, 'fromHour', 0),
    ...checkInteger(obj.toHour, 'toHour', 0),
    ...[obj.fromHour, obj.toHour].flatMap((hour) =>
      typeof hour === 'number' && hour >= HOURS_PER_DAY ? [`giờ phải < ${HOURS_PER_DAY}`] : []
    )
  ]),
  multiplier(params, ctx) {
    const { fromHour, toHour } = params as { fromHour: number; toHour: number }
    const inside =
      fromHour <= toHour
        ? ctx.hour >= fromHour && ctx.hour < toHour
        : ctx.hour >= fromHour || ctx.hour < toHour
    return inside ? multiplierOf(params) : 1
  }
}

// ---------- ownedSpecies: đã sở hữu loài gốc của quái (Repeat Ball) ----------

const ownedSpecies: BallBonusHandler = {
  validateParams: withMultiplier(),
  multiplier: (params, ctx) =>
    ctx.ownedSpeciesIds.has(ctx.target.baseSpeciesId) ? multiplierOf(params) : 1
}

// ---------- levelAdvantage: quái ném level ≥ ratio × level quái hoang (Level Ball) ----------

const levelAdvantage: BallBonusHandler = {
  validateParams: withMultiplier((obj) => checkNumber(obj.ratio, 'ratio', Number.MIN_VALUE)),
  multiplier(params, ctx) {
    const { ratio } = params as { ratio: number }
    return ctx.userLevel >= ratio * ctx.target.level ? multiplierOf(params) : 1
  }
}

// ---------- weightTiers: theo cân nặng quái hoang, cộng vào catchRate (Heavy Ball) ----------

interface WeightTier {
  fromKg: number
  catchRateAdd: number
}

const weightTiers: BallBonusHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj || !Array.isArray(obj.tiers) || obj.tiers.length === 0) {
      return ['params.tiers phải là danh sách không rỗng']
    }
    let last = -1
    return obj.tiers.flatMap((value, i) => {
      const tier = asObject(value)
      if (!tier) return [`tiers[${i}] phải là object`]
      const issues = [
        ...checkNumber(tier.fromKg, `tiers[${i}].fromKg`, 0),
        ...checkNumber(tier.catchRateAdd, `tiers[${i}].catchRateAdd`)
      ]
      if (typeof tier.fromKg === 'number') {
        if (tier.fromKg <= last) issues.push(`tiers[${i}].fromKg phải tăng dần`)
        last = tier.fromKg
      }
      return issues
    })
  },
  catchRateAdd(params, ctx) {
    const { tiers } = params as { tiers: WeightTier[] }
    const kg = monsterWeightKg(ctx.data, ctx.target)
    let add = 0
    for (const tier of tiers) if (kg >= tier.fromKg) add = tier.catchRateAdd
    return add
  }
}

// ---------- Registry ----------

export const BALL_BONUSES: Readonly<Record<string, BallBonusHandler>> = {
  firstTurn,
  turnScaling,
  targetElement,
  targetRace,
  hours,
  ownedSpecies,
  levelAdvantage,
  weightTiers
}

/** Tích hệ số các điều kiện của bóng trong bối cảnh này (bóng không có điều kiện = 1). */
export function ballBonusMultiplier(ball: BallItem, ctx: BallContext): number {
  return (ball.bonuses ?? []).reduce(
    (product, bonus) => product * (BALL_BONUSES[bonus.type].multiplier?.(bonus.params, ctx) ?? 1),
    1
  )
}

/** Tổng điểm cộng vào catchRate của các điều kiện của bóng (kiểu Heavy Ball; không có = 0). */
export function ballCatchRateBonus(ball: BallItem, ctx: BallContext): number {
  return (ball.bonuses ?? []).reduce(
    (sum, bonus) => sum + (BALL_BONUSES[bonus.type].catchRateAdd?.(bonus.params, ctx) ?? 0),
    0
  )
}
