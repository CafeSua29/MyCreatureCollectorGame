// Điểm nỗ lực, như EV của Pokémon (docs/rules/effort-values.md): quái nhận điểm theo loài bị hạ /
// bị bắt khi thắng trận, mỗi điểm +% đúng chỉ số đó (nguồn % `effort`), có trần mỗi chỉ số và trần
// tổng. Điểm đổi qua vật phẩm (vitamin, lông vũ, quả mọng giảm, bánh tẩy) ở registries/itemEffects.

import { traitEffortBonus, traitEffortMultiplier } from '../registries'
import {
  STAT_NAMES,
  type GameData,
  type Monster,
  type NormalSpecies,
  type PartialStats,
  type Stats
} from '../model'
import { mapStats } from './stats'
import { getBaseSpecies } from './validateMonster'
import { spiritVirusEffortMultiplier } from './spiritVirus'

/** Mọi chỉ số 0 điểm (quái mới, con breeding, quái hoang). */
export function emptyEffortValues(): Stats {
  return mapStats(() => 0)
}

/** Tổng điểm nỗ lực mọi chỉ số. */
export const effortTotal = (values: Stats): number =>
  STAT_NAMES.reduce((sum, stat) => sum + values[stat], 0)

/**
 * Điểm nỗ lực quái loài này cho khi bị hạ / bị bắt: effortYield của loài; bỏ trống thì suy từ chỉ
 * số gốc: tổng điểm theo bậc tổng chỉ số gốc (config.effort.derivedYield), chia lần lượt cho các
 * chỉ số gốc cao nhất (hòa thì theo thứ tự STAT_NAMES).
 */
export function speciesEffortYield(data: GameData, species: NormalSpecies): PartialStats {
  if (species.effortYield) return species.effortYield
  const { baseStats } = species
  const total = effortTotal(baseStats)
  let points = 0
  for (const tier of data.config.effort.derivedYield) {
    if (tier.minBaseStatTotal <= total) points = tier.points
  }
  const highest = Math.max(...STAT_NAMES.map((stat) => baseStats[stat]))
  const top = STAT_NAMES.filter((stat) => baseStats[stat] === highest)
  const yields: PartialStats = {}
  for (let i = 0; i < points; i++) {
    const stat = top[i % top.length]
    yields[stat] = (yields[stat] ?? 0) + 1
  }
  return yields
}

/** Cộng dồn `gains` vào `into` (theo từng chỉ số, × factor). */
function addInto(into: PartialStats, gains: PartialStats, factor = 1): void {
  for (const stat of STAT_NAMES) {
    const amount = gains[stat]
    if (amount !== undefined) into[stat] = (into[stat] ?? 0) + amount * factor
  }
}

/**
 * Điểm nỗ lực một quái nhận khi thắng trận: mỗi quái bị hạ / bị bắt cho điểm của loài gốc của nó
 * cộng điểm thêm từ hook (Power Weight), rồi nhân % từ hook (Macho Brace), làm tròn xuống. Chưa áp
 * trần (addEffortValues áp).
 */
export function battleEffortGain(
  data: GameData,
  receiver: Monster,
  defeated: readonly Monster[]
): PartialStats {
  const bonus = traitEffortBonus(data, receiver)
  const multiplier = traitEffortMultiplier(data, receiver)
  const virusMultiplier = spiritVirusEffortMultiplier(data, receiver)
  const gains: PartialStats = {}
  for (const enemy of defeated) {
    const species = getBaseSpecies(data, enemy)
    if (species) addInto(gains, speciesEffortYield(data, species))
    addInto(gains, bonus)
  }
  const result: PartialStats = {}
  for (const stat of STAT_NAMES) {
    // Linh dịch nhân riêng sau hook (như Pokémon: Macho Brace + Pokérus = ×4).
    const amount = Math.floor(Math.floor((gains[stat] ?? 0) * multiplier) * virusMultiplier)
    if (amount > 0) result[stat] = amount
  }
  return result
}

/**
 * Cộng (hoặc trừ, số âm) điểm nỗ lực theo thứ tự STAT_NAMES: điểm tăng không vượt trần chỉ số và
 * phần còn lại của trần tổng (như Pokémon), điểm giảm không dưới 0. Không đổi gì thì trả lại đúng
 * object quái cũ.
 */
export function addEffortValues(data: GameData, monster: Monster, gains: PartialStats): Monster {
  const { maxPerStat, maxTotal } = data.config.effort
  const values = { ...monster.effortValues }
  let total = effortTotal(values)
  let changed = false
  for (const stat of STAT_NAMES) {
    const amount = gains[stat] ?? 0
    const current = values[stat]
    const next =
      amount >= 0
        ? current + Math.max(0, Math.min(amount, maxPerStat - current, maxTotal - total))
        : Math.max(0, current + amount)
    if (next === current) continue
    values[stat] = next
    total += next - current
    changed = true
  }
  return changed ? { ...monster, effortValues: values } : monster
}

/** Hiển thị điểm nỗ lực của quái (MonsterView); % theo chỉ số ở statPercents.effort. */
export interface EffortView {
  values: Stats
  total: number
  maxPerStat: number
  maxTotal: number
  /** Điểm loài của quái cho khi bị hạ (như Pokédex ghi EV yield). */
  yield: PartialStats
}

/** Điểm nỗ lực của quái và điểm loài của nó cho khi bị hạ. */
export function effortView(data: GameData, monster: Monster): EffortView {
  const { maxPerStat, maxTotal } = data.config.effort
  const species = getBaseSpecies(data, monster)
  return {
    values: { ...monster.effortValues },
    total: effortTotal(monster.effortValues),
    maxPerStat,
    maxTotal,
    yield: species ? speciesEffortYield(data, species) : {}
  }
}
