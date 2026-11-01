// Khả năng làm việc của quái (docs/rules/dwelling.md mục "Chỉ số làm việc", "Trait làm việc"): chỉ
// số làm việc dạng số theo loài (suy từ hệ / race × tổng chỉ số gốc, loài ghi đè được) + điểm sách
// làm việc + cô đặc khi hiến tế đủ stack, tốc độ làm việc theo loài / trait / hồn tinh (như Work
// Suitability / Work Speed / passive skill / Statue of Power của Palworld), sức làm việc. Điểm duy
// nhất trả lời "quái này làm việc X giỏi tới đâu" cho động phủ, MonsterView, Dex và mô phỏng.

import {
  STAT_NAMES,
  WORK_TYPES,
  type GameData,
  type Monster,
  type NormalSpecies,
  type PartialStats,
  type WorkStats,
  type WorkTraitEffect,
  type WorkType
} from '../model'
import { raceMatches } from './races'
import { baseStatTotal } from './speciesRank'

/** Mọi hiệu ứng của các trait làm việc quái đang mang. */
const workTraitEffects = (data: GameData, monster: Monster): WorkTraitEffect[] =>
  monster.workTraits.flatMap((id) => data.workTraits[id]?.effects ?? [])

/** Chỉ số gốc trung bình của loài (tổng / số chỉ số): đơn vị của % chỉ số làm việc. */
const averageBaseStat = (species: NormalSpecies): number =>
  baseStatTotal(species) / STAT_NAMES.length

/** % của chỉ số gốc trung bình, làm tròn. */
const percentOfAverage = (species: NormalSpecies, percent: number): number =>
  Math.round((percent / 100) * averageBaseStat(species))

/**
 * Chỉ số làm việc gốc: `workStats` của loài nếu có, không thì % lớn nhất theo mọi hệ / race (nhóm
 * race) trong bảng × chỉ số gốc trung bình của loài.
 */
function baseWorkStats(
  data: GameData,
  {
    species,
    elementIds,
    raceId
  }: { species: NormalSpecies; elementIds: readonly string[]; raceId: string }
): WorkStats {
  if (species.workStats) return { ...species.workStats }
  const table = data.config.dwelling.workStatPercents
  const best: WorkStats = {}
  const merge = (entry: WorkStats): void => {
    for (const type of WORK_TYPES) {
      const value = entry[type]
      if (value !== undefined && value > (best[type] ?? 0)) best[type] = value
    }
  }
  for (const elementId of elementIds) {
    if (Object.hasOwn(table.elements, elementId)) merge(table.elements[elementId])
  }
  for (const [refId, entry] of Object.entries(table.races)) {
    if (raceMatches(data, raceId, refId)) merge(entry)
  }
  return Object.fromEntries(
    Object.entries(best).map(([type, percent]) => [type, percentOfAverage(species, percent)])
  ) as WorkStats
}

/** Chỉ số làm việc của loài (trang loài ở Dex, so loài): theo hệ / race của chính loài. */
export function speciesWorkStats(data: GameData, speciesId: string): WorkStats {
  const species = data.species[speciesId]
  if (species?.kind !== 'normal') return {}
  return baseWorkStats(data, { species, elementIds: species.elementIds, raceId: species.raceId })
}

/** Loài cho chỉ số làm việc của quái: loài hiện tại nếu ghi `workStats`, không thì loài gốc. */
function workSpeciesOf(data: GameData, monster: Monster): NormalSpecies | null {
  const own = data.species[monster.speciesId]
  if (own?.kind === 'normal' && own.workStats) return own
  const base = data.species[monster.baseSpeciesId]
  return base?.kind === 'normal' ? base : null
}

/**
 * Chỉ số làm việc của quái: gốc theo loài (hệ / race hiện tại của quái) + điểm sách làm việc (%
 * chỉ số gốc TB); hiến tế đủ condenseStacks stack thì mọi loại có chỉ số + condensePercent %.
 */
export function workStats(data: GameData, monster: Monster): WorkStats {
  const { condenseStacks, condensePercent } = data.config.dwelling
  const species = workSpeciesOf(data, monster)
  if (!species) return {}
  const stats = baseWorkStats(data, {
    species,
    elementIds: monster.elementIds,
    raceId: monster.raceId
  })
  for (const type of WORK_TYPES) {
    const points = monster.workPoints[type] ?? 0
    if (points > 0) stats[type] = (stats[type] ?? 0) + percentOfAverage(species, points)
  }
  if (monster.sacrificeStacks < condenseStacks || condensePercent === 0) return stats
  const bonus = percentOfAverage(species, condensePercent)
  for (const type of WORK_TYPES) {
    const value = stats[type] ?? 0
    if (value > 0) stats[type] = value + bonus
  }
  return stats
}

/**
 * Tốc độ làm việc (%) ở loại việc: tốc độ gốc của loài × (1 + (Σ % trait làm việc + cấp hồn tinh
 * tốc độ × soulWorkSpeedPercentPerLevel) / 100); trait `workSpeed` tính mọi loại việc,
 * `workTypeSpeed` chỉ đúng loại; không dưới minWorkSpeed.
 */
export function workSpeedPercent(data: GameData, monster: Monster, workType: WorkType): number {
  const { baseWorkSpeed, minWorkSpeed, soulWorkSpeedPercentPerLevel } = data.config.dwelling
  const species = data.species[monster.speciesId]
  const base = species?.kind === 'normal' ? (species.workSpeed ?? baseWorkSpeed) : baseWorkSpeed
  const soulPercent = monster.workSoulLevel * soulWorkSpeedPercentPerLevel
  const bonus = workTraitEffects(data, monster).reduce((sum, effect) => {
    if (effect.type === 'workSpeed') return sum + effect.percent
    if (effect.type === 'workTypeSpeed' && effect.workType === workType) return sum + effect.percent
    return sum
  }, soulPercent)
  return Math.max(minWorkSpeed, base * (1 + bonus / 100))
}

/**
 * Sức làm việc của một quái ở loại việc: chỉ số hiệu dụng (lớn nhất của chỉ số đúng việc, chỉ số vận
 * chuyển × transportRatio, wrongWorkPercent % chỉ số gốc TB) / powerStatUnit × level ^ levelExponent
 * × tốc độ làm việc / 100.
 */
export function workerPower(data: GameData, monster: Monster, workType: WorkType): number {
  const { wrongWorkPercent, transportRatio, levelExponent, powerStatUnit } = data.config.dwelling
  const species = workSpeciesOf(data, monster)
  const stats = workStats(data, monster)
  const effective = Math.max(
    stats[workType] ?? 0,
    (stats.transporting ?? 0) * transportRatio,
    species ? (wrongWorkPercent / 100) * averageBaseStat(species) : 0
  )
  const speed = workSpeedPercent(data, monster, workType)
  const shift =
    1 + (isNocturnal(data, monster) ? data.config.dwelling.needs.nocturnalWorkPercent : 0) / 100
  return (
    (effective / powerStatUnit) *
    Math.pow(monster.level, levelExponent) *
    (speed / 100) *
    shift *
    (workConditionPercent(data, monster) / 100)
  )
}

/** Quái có trait cú đêm (làm cả đêm, Nocturnal của Palworld). */
export const isNocturnal = (data: GameData, monster: Monster): boolean =>
  workTraitEffects(data, monster).some((effect) => effect.type === 'nocturnal')

/**
 * % sức theo tình trạng (docs/rules/dwelling.md mục "Đói và tinh thần", "Bệnh và chấn thương"): đói
 * lả (no 0) × starvingWorkPercent %, tinh thần dưới lowSanity × lowSanityWorkPercent %, bệnh ×
 * workPercent của bệnh, tinh thần 0 bỏ việc (0).
 */
export function workConditionPercent(data: GameData, monster: Monster): number {
  const { starvingWorkPercent, lowSanity, lowSanityWorkPercent } = data.config.dwelling.needs
  if (monster.sanity <= 0) return 0
  const hunger = monster.fullness <= 0 ? starvingWorkPercent / 100 : 1
  const mind = monster.sanity < lowSanity ? lowSanityWorkPercent / 100 : 1
  const ailment = monster.ailment
    ? (data.ailments[monster.ailment.id]?.workPercent ?? 100) / 100
    : 1
  return 100 * hunger * mind * ailment
}

/**
 * Hệ số tiêu hao mỗi ngày làm việc: no (`hungerRate`) và tinh thần (`sanityRate`) theo trait, cú
 * đêm + nocturnalDrainPercent % cả hai; không âm.
 */
export function needDrainMultipliers(
  data: GameData,
  monster: Monster
): { hunger: number; sanity: number } {
  const night = isNocturnal(data, monster) ? data.config.dwelling.needs.nocturnalDrainPercent : 0
  let hunger = night
  let sanity = night
  for (const effect of workTraitEffects(data, monster)) {
    if (effect.type === 'hungerRate') hunger += effect.percent
    if (effect.type === 'sanityRate') sanity += effect.percent
  }
  return { hunger: Math.max(0, 1 + hunger / 100), sanity: Math.max(0, 1 + sanity / 100) }
}

/** % chỉ số từ trait làm việc (Work Slave, Hooligan, Lucky...): nguồn % `workTraits`. */
export function workTraitStatPercent(data: GameData, monster: Monster): PartialStats {
  const percents: PartialStats = {}
  for (const effect of workTraitEffects(data, monster)) {
    if (effect.type !== 'statPercent') continue
    for (const [stat, percent] of Object.entries(effect.stats) as [keyof PartialStats, number][]) {
      percents[stat] = (percents[stat] ?? 0) + percent
    }
  }
  return percents
}

/** Số trait làm việc tối đa của một quái (số mục countWeights − 1). */
export const maxWorkTraits = (data: GameData): number =>
  Math.max(0, data.config.dwelling.workTraits.countWeights.length - 1)

/**
 * Thêm trait vào danh sách: bỏ qua nếu đã có, đủ chỗ thì không thêm; trait cùng nhóm bị thay. Trả
 * danh sách mới (cùng tham chiếu nếu không đổi).
 */
export function withWorkTrait(
  data: GameData,
  traits: readonly string[],
  traitId: string
): string[] {
  if (traits.includes(traitId)) return [...traits]
  const group = data.workTraits[traitId]?.group
  const rival =
    group === undefined ? -1 : traits.findIndex((id) => data.workTraits[id]?.group === group)
  if (rival >= 0) return traits.map((id, i) => (i === rival ? traitId : id))
  return traits.length >= maxWorkTraits(data) ? [...traits] : [...traits, traitId]
}
