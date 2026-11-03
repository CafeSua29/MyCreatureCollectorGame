// Cây thần ở thị trấn (docs/rules/gacha.md): trả tiền theo tầng cao nhất, nhận trứng quái random sẵn.
// Không bảo hiểm (pity). Sinh quái qua rollMonster như mọi trứng, chỉ khác trọng số loại trait.

import { preEvolutionsOf } from '../inventory'
import { startHistory } from '../monster'
import {
  bumpStat,
  charmEffect,
  researchMultiplier,
  speciesRankIndex,
  speciesRankOf,
  tamerBonusMultiplier
} from '../registries'
import { ActionError, levelCost, spendMoney, type Decimal, type RngState } from '../shared'
import { floorGeneMultiplier, rollMonster, type MonsterRollSpec } from '../world'
import {
  appendLog,
  BATTLE_FORM_KINDS,
  dayOf,
  type EncounterEntry,
  type GameData,
  type GameState,
  type Egg,
  type Monster,
  type NormalSpecies,
  type TraitKind
} from '../model'
import { wrapEgg } from './eggs'

/** Dạng đầu tiên, không phải dạng chỉ có trong trận: loài duy nhất nở ra từ trứng gacha được. */
export const isGachaForm = (data: GameData, species: NormalSpecies): boolean =>
  preEvolutionsOf(data, species.id).length === 0 &&
  !BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate')

/** Trọng số theo phẩm cấp loài; vượt danh sách lấy số cuối. */
function rankWeight(data: GameData, species: NormalSpecies): number {
  const weights = data.config.gacha.rankWeights
  const rank = speciesRankIndex(data, speciesRankOf(data, species).id)
  return weights[Math.min(Math.max(0, rank), weights.length - 1)] ?? 0
}

const poolCache = new WeakMap<GameData, readonly EncounterEntry[]>()

/**
 * Bảng loài của Cây thần: mọi dạng đầu có trọng số > 0. Trọng số là `gachaWeight` của loài nếu có,
 * không thì theo phẩm cấp với loài hoang; loài không gặp ở map nào (chỉ làm boss) không ra trừ khi
 * dữ liệu khai `gachaWeight`.
 */
export function gachaSpeciesPool(data: GameData): readonly EncounterEntry[] {
  const cached = poolCache.get(data)
  if (cached) return cached
  const pool = Object.values(data.species).flatMap((species) => {
    if (species.kind !== 'normal' || !isGachaForm(data, species)) return []
    const weight = species.gachaWeight ?? rankWeight(data, species)
    return weight > 0 ? [{ speciesId: species.id, weight }] : []
  })
  poolCache.set(data, pool)
  return pool
}

/** Trọng số loại trait của trứng theo tầng cao nhất (tầng càng cao càng dễ ra trait xịn). */
export function gachaTraitKindWeights(
  data: GameData,
  floor: number
): Partial<Record<TraitKind, number>> {
  const { traitKindWeights, traitKindFloorGrowth, traitKindFloorFalloff } = data.config.gacha
  const floorsAbove = floor - 1
  const weights: Partial<Record<TraitKind, number>> = {}
  for (const [kind, weight] of Object.entries(traitKindWeights) as [TraitKind, number][]) {
    const growth = 1 + (traitKindFloorGrowth[kind] ?? 0) * floorsAbove
    const falloff = 1 + (traitKindFloorFalloff[kind] ?? 0) * floorsAbove
    weights[kind] = (weight * growth) / falloff
  }
  return weights
}

/** Giá một lượt quay `count` trứng theo tầng cao nhất; không có cách quay đó thì ném ActionError. */
export function gachaCost(data: GameData, highestFloor: number, count: number): Decimal {
  const { costBase, pullOptions } = data.config.gacha
  const option = pullOptions.find((entry) => entry.count === count)
  if (!option) throw new ActionError('gachaInvalidCount', { count })
  return levelCost(costBase * option.costMultiplier, highestFloor)
}

/** Một trứng: quái level 1, gen theo tầng cao nhất, lý lịch nguồn gốc `gacha` ở thị trấn. */
function createGachaEgg(
  data: GameData,
  rng: RngState,
  { state, spec, id }: { state: GameState; spec: MonsterRollSpec; id: string }
): [Egg, RngState] {
  let monster: Monster
  ;[monster, rng] = rollMonster(data, rng, spec, id)
  monster = startHistory(
    { ...monster, affinity: data.config.affinity.start.egg },
    { kind: 'gacha' },
    { day: dayOf(state.time), floor: null, level: monster.level }
  )
  return wrapEgg(data, rng, monster)
}

/** Quay Cây thần `count` trứng (đúng một trong `pullOptions`; thị trấn, ngoài trận). */
export function pullGacha(data: GameData, state: GameState, count: number): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const cost = gachaCost(data, state.highestFloor, count)
  const encounters = gachaSpeciesPool(data)
  if (encounters.length === 0) throw new ActionError('gachaPoolEmpty')
  const paid = spendMoney(state, cost)
  const spec: MonsterRollSpec = {
    encounters,
    levelMin: 1,
    levelMax: 1,
    geneMultiplier: floorGeneMultiplier(data, state.highestFloor),
    // Bùa shiny và thưởng ngự thú sư nhân tỉ lệ như trứng breeding (docs/rules/dex.md mục "Bùa").
    shinyChance:
      data.config.shiny.wildChance *
      charmEffect(data, state.inventory, 'shinyChanceMultiplier') *
      tamerBonusMultiplier(data, state, 'shinyChancePercent'),
    speciesShinyMultiplier: (speciesId) =>
      researchMultiplier(data, state.research, speciesId, 'shinyChancePercent'),
    traitKindWeights: gachaTraitKindWeights(data, state.highestFloor),
    aging: state.options.lifespanEnabled
  }
  let { rng, nextMonsterId } = state
  const eggs = [...state.eggs]
  for (let i = 0; i < count; i++) {
    let egg: Egg
    ;[egg, rng] = createGachaEgg(data, rng, { state, spec, id: `m${nextMonsterId}` })
    nextMonsterId++
    eggs.push(egg)
  }
  const pulled = {
    ...paid,
    rng,
    nextMonsterId,
    eggs,
    stats: bumpStat(state.stats, 'gachaPulls', count)
  }
  const eggIds = eggs.slice(state.eggs.length).map((egg) => egg.id)
  return appendLog(pulled, { type: 'gachaPulled', eggIds })
}
