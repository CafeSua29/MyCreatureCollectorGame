// Hiệu ứng vật phẩm của thiên tài địa bảo (docs/rules/treasures.md): tăng gen (một chỉ số, mọi chỉ
// số, chỉ số gốc cao nhất của loài), exp thuần thục của skill chọn lúc dùng, cấp trait ngẫu nhiên.
// Hiệu quả × hệ số tầng (gen) × kháng theo số lần đã ăn đúng món × khẩu vị (treasurePotency).
// Thêm hiệu ứng mới = thêm một handler, gộp vào ITEM_EFFECTS (itemEffects.ts).

import { STAT_NAMES, type GameData, type Monster, type StatName } from '../model'
import { addMasteryExp, getBaseSpecies, mapBigStats } from '../monster'
import { asObject, checkInteger, checkNumber, pick, toBig, type Decimal } from '../shared'
import { floorGeneMultiplier } from './aptitude'
import type { ItemEffectContext, ItemEffectHandler } from './itemEffects'

/** Hệ số hiệu quả của lần ăn: kháng^(số lần đã ăn) × khẩu vị (nếu đúng khẩu vị). */
export function treasurePotency(
  data: GameData,
  { useCount, favorite }: Pick<ItemEffectContext, 'useCount' | 'favorite'>
): Decimal {
  const { resistance, favoriteMultiplier } = data.config.treasures
  return toBig(resistance)
    .pow(useCount)
    .times(favorite ? favoriteMultiplier : 1)
}

/** Lượng gen cộng: amount × hệ số gen của tầng cao nhất × hiệu quả, làm tròn xuống. */
function geneGain(amount: number, ctx: ItemEffectContext): Decimal {
  return toBig(amount)
    .times(floorGeneMultiplier(ctx.data, ctx.highestFloor))
    .times(treasurePotency(ctx.data, ctx))
    .floor()
}

/** Cộng gen vào các chỉ số đã chọn; lượng 0 thì không có tác dụng. */
function withGenes(monster: Monster, stats: readonly StatName[], gain: Decimal): Monster | null {
  if (gain.lte(0)) return null
  const genes = mapBigStats((stat) =>
    stats.includes(stat) ? monster.genes[stat].plus(gain) : monster.genes[stat]
  )
  return { ...monster, genes }
}

const validateAmount = (params: unknown): string[] => {
  const obj = asObject(params)
  return obj ? checkNumber(obj.amount, 'amount', Number.MIN_VALUE) : ['params phải là object']
}

const addGenes: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    if (!obj) return ['params phải là object']
    const issues = checkNumber(obj.amount, 'amount', Number.MIN_VALUE)
    if (!(STAT_NAMES as readonly unknown[]).includes(obj.stat)) {
      issues.push(`stat phải là chỉ số, nhận "${String(obj.stat)}"`)
    }
    return issues
  },
  apply(params, ctx) {
    const { stat, amount } = params as { stat: StatName; amount: number }
    return withGenes(ctx.monster, [stat], geneGain(amount, ctx))
  },
  countsUses: true
}

const addGenesAll: ItemEffectHandler = {
  validateParams: validateAmount,
  apply(params, ctx) {
    return withGenes(ctx.monster, STAT_NAMES, geneGain((params as { amount: number }).amount, ctx))
  },
  countsUses: true
}

/** Chỉ số gốc cao nhất của loài gốc (hòa thì theo thứ tự STAT_NAMES). */
function topBaseStat(data: GameData, monster: Monster): StatName {
  const species = getBaseSpecies(data, monster)
  if (!species) return STAT_NAMES[0]
  return STAT_NAMES.reduce((best, stat) =>
    species.baseStats[stat] > species.baseStats[best] ? stat : best
  )
}

// Yêu đan: gen vào chỉ số gốc cao nhất của loài của quái ăn.
const addGenesTopStat: ItemEffectHandler = {
  validateParams: validateAmount,
  apply(params, ctx) {
    const stat = topBaseStat(ctx.data, ctx.monster)
    return withGenes(ctx.monster, [stat], geneGain((params as { amount: number }).amount, ctx))
  },
  countsUses: true
}

// Exp thuần thục cho skill người chơi chọn lúc dùng (ctx.skillId, quái phải biết skill).
const addMasteryExpEffect: ItemEffectHandler = {
  validateParams: validateAmount,
  apply(params, ctx) {
    const { skillId, monster, data } = ctx
    if (skillId === undefined || !monster.skillIds.includes(skillId)) return null
    const amount = toBig((params as { amount: number }).amount)
      .times(treasurePotency(data, ctx))
      .floor()
    if (amount.lte(0)) return null
    return {
      ...monster,
      skillMastery: addMasteryExp(data, monster, { skillId, amount }).skillMastery
    }
  },
  countsUses: true,
  needsSkill: true
}

/** Trait được nâng cấp: mọi trait của quái trừ shiny / boss. */
const upgradableTraits = (data: GameData, monster: Monster): string[] =>
  monster.traits
    .filter((trait) => {
      const kind = data.traits[trait.id]?.kind
      return kind !== 'shiny' && kind !== 'boss'
    })
    .map((trait) => trait.id)

// Tẩy Tủy Đan: + count cấp cho một trait ngẫu nhiên (đều trên mọi trait nâng được).
const traitLevelUp: ItemEffectHandler = {
  validateParams(params) {
    const obj = asObject(params)
    return obj ? checkInteger(obj.count, 'count', 1) : ['params phải là object']
  },
  apply() {
    return null
  },
  applyRandom(params, ctx) {
    const candidates = upgradableTraits(ctx.data, ctx.monster)
    if (candidates.length === 0) return [null, ctx.rng]
    const [traitId, rng] = pick(ctx.rng, candidates)
    const { count } = params as { count: number }
    const traits = ctx.monster.traits.map((trait) =>
      trait.id === traitId ? { ...trait, level: trait.level + count } : trait
    )
    return [{ ...ctx.monster, traits }, rng]
  },
  countsUses: true
}

export const TREASURE_EFFECTS: Readonly<Record<string, ItemEffectHandler>> = {
  addGenes,
  addGenesAll,
  addGenesTopStat,
  addMasteryExp: addMasteryExpEffect,
  traitLevelUp
}
