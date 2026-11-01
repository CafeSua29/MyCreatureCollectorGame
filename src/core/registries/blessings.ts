// Chúc phúc của thần linh (docs/rules/deities.md): mỗi loại hiệu ứng một handler. `elementStatPercent`
// cộng % chỉ số trong trận cho quái ta có hệ của thần (nguồn % `blessing`), loại "%" còn lại nhân một
// kênh phần thưởng / tỉ lệ như món ăn linh thực. Bậc ân sủng theo đường cong đa thức (không trần).
// Nơi dùng hỏi qua blessingPercent / blessingStatPercent, không rẽ nhánh theo id thần.

import {
  STAT_NAMES,
  type BlessingEffectType,
  type DeityDef,
  type GameData,
  type Monster,
  type PartialStats,
  type StatName
} from '../model'
import {
  BIG_ZERO,
  asObject,
  checkNumber,
  curveExpForLevel,
  curveLevelFromExp,
  type Decimal,
  type LevelCurve
} from '../shared'

export interface BlessingEffectHandler {
  kind: 'stat' | 'percent'
  validateParams(params: unknown): string[]
}

/** Kênh % (mọi loại trừ elementStatPercent). */
export type BlessingChannel = Exclude<BlessingEffectType, 'elementStatPercent'>

/** Ân sủng theo thần (GameState.favor); thần chưa có mục = 0. */
export type FavorMap = Readonly<Record<string, Decimal>>

/** % khác 0, không dưới −100 (hệ số không âm), không trường lạ ngoài `extra`. */
function checkPercentParams(params: unknown, extra: readonly string[] = []): string[] {
  const obj = asObject(params)
  if (!obj) return ['params phải là object']
  const issues = checkNumber(obj.percent, 'percent', -100)
  if (obj.percent === 0) issues.push('percent phải khác 0')
  for (const key of Object.keys(obj)) {
    if (key !== 'percent' && !extra.includes(key)) issues.push(`trường lạ "${key}"`)
  }
  return issues
}

const percentEffect: BlessingEffectHandler = {
  kind: 'percent',
  validateParams: (params) => checkPercentParams(params)
}

export const BLESSING_EFFECTS: Readonly<Record<BlessingEffectType, BlessingEffectHandler>> = {
  // { percent, stat? }: không ghi stat = mọi chỉ số kể cả max HP; chỉ quái ta có hệ của thần.
  elementStatPercent: {
    kind: 'stat',
    validateParams(params) {
      const issues = checkPercentParams(params, ['stat'])
      const stat = asObject(params)?.stat
      if (stat !== undefined && !STAT_NAMES.some((name) => name === stat)) {
        issues.push(`stat lạ "${String(stat)}"`)
      }
      return issues
    }
  },
  expPercent: percentEffect,
  moneyPercent: percentEffect,
  dropRatePercent: percentEffect,
  catchRatePercent: percentEffect,
  recruitPercent: percentEffect,
  shinyChancePercent: percentEffect
}

export const isBlessingEffectType = (type: string): type is BlessingEffectType =>
  Object.hasOwn(BLESSING_EFFECTS, type)

const rankCurve = (data: GameData): LevelCurve => ({
  base: data.config.deities.rankBase,
  power: data.config.deities.rankPower
})

/** Ân sủng cần cho bậc `rank` (bậc 0 = 0): rankBase × rank^rankPower, làm tròn lên. */
export const favorForRank = (data: GameData, rank: number): Decimal =>
  curveExpForLevel(rankCurve(data), rank + 1)

/** Bậc ân sủng: bậc cao nhất có favorForRank ≤ ân sủng (0 = chưa có chúc phúc nào). */
export const favorRank = (data: GameData, favor: Decimal): number =>
  curveLevelFromExp(rankCurve(data), favor, 'ân sủng') - 1

/** Ân sủng hiện có với thần (0 nếu chưa có). */
export const favorOf = (favor: FavorMap, deityId: string): Decimal =>
  Object.hasOwn(favor, deityId) ? favor[deityId] : BIG_ZERO

/**
 * Số lần chúc phúc thứ `index` đã mở ở bậc `rank`: bậc k mở chúc phúc ((k − 1) mod n), hết danh sách
 * thì lặp lại và cộng dồn.
 */
export function blessingUnlocks(deity: DeityDef, index: number, rank: number): number {
  if (rank <= index) return 0
  return Math.floor((rank - 1 - index) / deity.blessings.length) + 1
}

/** Mỗi hiệu ứng của thần kèm số lần đã mở (bỏ hiệu ứng chưa mở). */
function unlockedEffects(
  data: GameData,
  favor: FavorMap,
  deityId: string | null
): { type: BlessingEffectType; params: unknown; times: number }[] {
  // Chưa có ân sủng thì khỏi tính bậc (hàm nằm trên đường tính chỉ số trong trận).
  if (deityId === null || !Object.hasOwn(favor, deityId)) return []
  if (!Object.hasOwn(data.deities, deityId)) return []
  const deity = data.deities[deityId]
  const rank = favorRank(data, favorOf(favor, deityId))
  if (rank === 0) return []
  return deity.blessings.flatMap((blessing, index) => {
    const times = blessingUnlocks(deity, index, rank)
    return times === 0 ? [] : blessing.effects.map((effect) => ({ ...effect, times }))
  })
}

/** Tổng % một kênh của chúc phúc đã mở của thần (null / chưa có bậc: 0). */
export function blessingPercent(
  data: GameData,
  favor: FavorMap,
  { deityId, channel }: { deityId: string | null; channel: BlessingChannel }
): number {
  return (
    unlockedEffects(data, favor, deityId)
      .filter((effect) => effect.type === channel)
      // Ép kiểu: kiểm tra dữ liệu (BLESSING_EFFECTS.validateParams) đảm bảo params có percent.
      .reduce(
        (sum, effect) => sum + (effect.params as { percent: number }).percent * effect.times,
        0
      )
  )
}

/** Hệ số của một kênh: 1 + blessingPercent / 100 (không dưới 0). */
export const blessingMultiplier = (
  data: GameData,
  favor: FavorMap,
  target: { deityId: string | null; channel: BlessingChannel }
): number => Math.max(0, 1 + blessingPercent(data, favor, target) / 100)

/** % chỉ số trong trận của chúc phúc cho một quái ta: chỉ khi quái có hệ của thần. */
export function blessingStatPercent(
  data: GameData,
  favor: FavorMap,
  { deityId, monster }: { deityId: string | null; monster: Monster }
): PartialStats {
  const total: PartialStats = {}
  if (deityId === null || !Object.hasOwn(data.deities, deityId)) return total
  if (!monster.elementIds.includes(data.deities[deityId].elementId)) return total
  for (const effect of unlockedEffects(data, favor, deityId)) {
    if (effect.type !== 'elementStatPercent') continue
    // Ép kiểu: kiểm tra dữ liệu đảm bảo params { percent, stat? }.
    const { percent, stat } = effect.params as { percent: number; stat?: StatName }
    for (const name of stat ? [stat] : STAT_NAMES) {
      total[name] = (total[name] ?? 0) + percent * effect.times
    }
  }
  return total
}
