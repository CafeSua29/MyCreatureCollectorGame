// Tiến hóa.
// - Hướng chỉ cần level: tự tiến hóa sau mỗi trận thắng (mọi quái trong đội đủ điều kiện).
//   Nhiều hướng level cùng đủ thì quái nhận pendingEvolutionIds, người chơi chọn (chooseEvolution).
// - Hướng cần vật phẩm (đá): chỉ khi người chơi dùng đá lên quái đủ level (registries/itemEffects.ts).
// - Mỗi hướng có thể có điều kiện phụ (`conditions`, registries/evolutionConditions.ts) và tiến hóa
//   dị biến (`mutation`): tung tỉ lệ thành loài khác, xúc tác đang lắp tăng tỉ lệ.
// - Mỗi lần lên một bậc. Quái đã fuse không tiến hóa.
// Khi tiến hóa: đổi loài theo luật chung changeSpecies (monster/speciesChange.ts).
// - Quái vừa thoái hóa (devolvedFromSpeciesId, mục "Thoái hóa"): lần tự tiến hóa kế tiếp luôn hỏi
//   người chơi kể cả khi chỉ một hướng đủ điều kiện, bỏ qua được (skipEvolution).

import { ActionError, rollPercent, type RngState } from '../shared'
import { locateOwned } from '../roster'
import { addMilestone, changeSpecies } from '../monster'
import {
  EVOLUTION_CONDITIONS,
  isEvolutionConditionMet,
  aptitudeFloor,
  isEquippedItem,
  isHolding,
  partySlotsOf,
  partySlotsUsed,
  type EvolutionScene,
  recordEvolutionResearch
} from '../registries'
import {
  dayOf,
  evolutionTargetIds,
  type BattleEvent,
  type EffectDef,
  type Evolution,
  type EvolutionMutation,
  type GameData,
  type GameState,
  type Monster,
  type NormalSpecies
} from '../model'

function currentSpecies(data: GameData, monster: Monster): NormalSpecies | null {
  if (monster.fused) return null
  const species = data.species[monster.speciesId]
  return species?.kind === 'normal' ? species : null
}

/**
 * Quái trong đội tiến hóa thành loài chiếm nhiều ô đội hơn (quái lớn, docs/rules/monster-size.md)
 * cần đội còn đủ ô cho mọi loài hướng này có thể ra (kể cả dị biến); quái trong kho không cần.
 */
function hasPartyRoomToEvolve(
  data: GameData,
  monster: Monster,
  evolution: Evolution,
  party: readonly Monster[]
): boolean {
  if (!party.some((m) => m.id === monster.id)) return true
  const others = partySlotsUsed(
    data,
    party.filter((m) => m.id !== monster.id)
  )
  return evolutionTargetIds(evolution).every(
    (id) =>
      others + partySlotsOf(data, { speciesId: id, baseSpeciesId: id }) <= data.config.partySize
  )
}

/**
 * Mọi điều kiện phụ của hướng tiến hóa đều đủ (assumeScene: xem isEvolutionConditionMet) và đội đủ
 * ô cho loài mới.
 */
function conditionsMet(
  data: GameData,
  monster: Monster,
  evolution: Evolution,
  options: { scene: EvolutionScene; assumeScene?: boolean }
): boolean {
  return (
    hasPartyRoomToEvolve(data, monster, evolution, options.scene.party) &&
    (evolution.conditions ?? []).every((condition) =>
      isEvolutionConditionMet(data, monster, condition, options)
    )
  )
}

/** Các hướng quái tự tiến hóa theo được ngay (hướng chỉ cần level, đủ level và điều kiện). */
function levelEvolutions(data: GameData, monster: Monster, scene: EvolutionScene): Evolution[] {
  const species = currentSpecies(data, monster)
  if (!species) return []
  return species.evolutions.filter(
    (e) =>
      e.itemId === undefined &&
      e.level <= monster.level &&
      conditionsMet(data, monster, e, { scene })
  )
}

/** Các loài quái tự tiến hóa thành được ngay (hướng chỉ cần level, đủ level và điều kiện). */
export function levelEvolutionOptions(
  data: GameData,
  monster: Monster,
  scene: EvolutionScene
): string[] {
  return levelEvolutions(data, monster, scene).map((e) => e.speciesId)
}

/** Hướng tiến hóa dùng đá itemId, nếu quái đủ level và điều kiện. */
export function stoneEvolution(
  data: GameData,
  monster: Monster,
  { itemId, scene }: { itemId: string; scene: EvolutionScene }
): Evolution | null {
  const species = currentSpecies(data, monster)
  const evolution = species?.evolutions.find((e) => e.itemId === itemId)
  if (!evolution || evolution.level > monster.level) return null
  return conditionsMet(data, monster, evolution, { scene }) ? evolution : null
}

/** Một điều kiện phụ cho UI: đủ chưa, xét ở nơi quái đang ở (map, môi trường). */
export interface EvolutionConditionInfo extends EffectDef {
  met: boolean
}

/** Một hướng tiến hóa cho UI (MonsterView.evolutions): chỉ id, không có tên. */
export interface EvolutionInfo {
  speciesId: string
  level: number
  itemId?: string
  levelReached: boolean
  conditions: EvolutionConditionInfo[]
  mutation?: EvolutionMutation
}

/** Mọi hướng tiến hóa của quái, kèm đã đủ level / từng điều kiện chưa ở `scene` (cho UI). */
export function evolutionInfo(
  data: GameData,
  monster: Monster,
  scene: EvolutionScene
): EvolutionInfo[] {
  const species = currentSpecies(data, monster)
  if (!species) return []
  return species.evolutions.map((e) => ({
    speciesId: e.speciesId,
    level: e.level,
    ...(e.itemId !== undefined ? { itemId: e.itemId } : {}),
    levelReached: e.level <= monster.level,
    conditions: (e.conditions ?? []).map(({ type, params }) => ({
      type,
      params,
      met: isEvolutionConditionMet(data, monster, { type, params }, { scene })
    })),
    ...(e.mutation ? { mutation: { ...e.mutation } } : {})
  }))
}

/** Kết quả tiến hóa: quái mới, sự kiện log, RNG sau khi tung (dị biến, giới tính). */
export interface EvolutionResult {
  monster: Monster
  events: BattleEvent[]
  rng: RngState
}

/** Bối cảnh tiến hóa: RNG (tung dị biến, giới tính) và ngày game (mốc lý lịch). */
export interface EvolutionContext {
  rng: RngState
  day: number
}

/**
 * Biến quái thành loài toSpeciesId (không kiểm tra điều kiện; nơi gọi đã kiểm tra), thêm mốc lý
 * lịch "evolved" (dị biến: "mutatedEvolution").
 */
export function evolveMonster(
  data: GameData,
  monster: Monster,
  {
    toSpeciesId,
    rng,
    day,
    mutated = false
  }: EvolutionContext & { toSpeciesId: string; mutated?: boolean }
): EvolutionResult {
  const target = data.species[toSpeciesId] as NormalSpecies
  const changed = changeSpecies(data, monster, { target, rng })
  const change = { fromSpeciesId: monster.speciesId, toSpeciesId: target.id }
  const kind = mutated ? 'mutatedEvolution' : 'evolved'
  return {
    monster: addMilestone(data, changed.monster, { day, kind, ...change }),
    rng: changed.rng,
    events: [
      { type: mutated ? 'mutatedEvolution' : 'evolve', monsterId: monster.id, ...change },
      ...changed.events
    ]
  }
}

/** Bỏ một món itemId (đồ cầm / trang bị) khỏi ô của quái (mất hẳn, không về túi), kèm log. */
function consumeHeld(monster: Monster, itemId: string): { monster: Monster; event: BattleEvent } {
  const index = monster.equipment.findIndex((entry) => isEquippedItem(entry, itemId))
  return {
    monster: { ...monster, equipment: monster.equipment.filter((_, i) => i !== index) },
    event: { type: 'heldItemConsumed', monsterId: monster.id, itemId }
  }
}

/** Tung dị biến: có trúng không, và xúc tác bị tiêu (đang lắp xúc tác và trúng). */
function rollMutation(
  rng: RngState,
  monster: Monster,
  mutation: EvolutionMutation
): [{ mutated: boolean; catalystUsed: boolean }, RngState] {
  const { catalystItemId, catalystChance } = mutation
  const hasCatalyst = catalystItemId !== undefined && isHolding(monster, catalystItemId)
  const [mutated, next] = rollPercent(rng, hasCatalyst ? (catalystChance ?? 0) : mutation.chance)
  return [{ mutated, catalystUsed: mutated && hasCatalyst }, next]
}

/**
 * Tiến hóa theo một hướng (đã kiểm tra điều kiện): tiêu đồ cầm của điều kiện `consume`, tung dị
 * biến (xúc tác bị tiêu khi trúng), rồi đổi loài.
 */
export function evolveVia(
  data: GameData,
  monster: Monster,
  { evolution, rng, day }: EvolutionContext & { evolution: Evolution }
): EvolutionResult {
  let current = monster
  const events: BattleEvent[] = []
  const consumed = new Set<string>()
  const consume = (itemId: string): void => {
    // Mỗi món tiêu một lần dù vừa là xúc tác vừa là đồ cầm của điều kiện.
    if (consumed.has(itemId) || !isHolding(current, itemId)) return
    consumed.add(itemId)
    const result = consumeHeld(current, itemId)
    current = result.monster
    events.push(result.event)
  }
  let toSpeciesId = evolution.speciesId
  let mutated = false
  let nextRng = rng
  if (evolution.mutation) {
    let roll: { mutated: boolean; catalystUsed: boolean }
    ;[roll, nextRng] = rollMutation(rng, monster, evolution.mutation)
    mutated = roll.mutated
    if (mutated) toSpeciesId = evolution.mutation.speciesId
    if (roll.catalystUsed && evolution.mutation.catalystItemId !== undefined) {
      consume(evolution.mutation.catalystItemId)
    }
  }
  for (const { type, params } of evolution.conditions ?? []) {
    const itemId = EVOLUTION_CONDITIONS[type].consumedItemId?.(params) ?? null
    if (itemId !== null) consume(itemId)
  }
  const result = evolveMonster(data, current, { toSpeciesId, rng: nextRng, day, mutated })
  return { ...result, events: [...events, ...result.events] }
}

/**
 * Xét tự tiến hóa (sau trận thắng, sau khi lên level bằng vật phẩm): một hướng thì tiến hóa ngay;
 * nhiều hướng (hoặc quái vừa thoái hóa) thì đặt pendingEvolutionIds để người chơi chọn. Quái đang
 * chờ chọn thì giữ nguyên.
 */
export function autoEvolve(
  data: GameData,
  monster: Monster,
  { rng, day, scene }: EvolutionContext & { scene: EvolutionScene }
): EvolutionResult {
  if (monster.pendingEvolutionIds.length > 0) return { monster, events: [], rng }
  const evolutions = levelEvolutions(data, monster, scene)
  const mustAsk = monster.devolvedFromSpeciesId !== null
  if (evolutions.length === 1 && !mustAsk) {
    return evolveVia(data, monster, { evolution: evolutions[0], rng, day })
  }
  if (evolutions.length > 0) {
    const options = evolutions.map((e) => e.speciesId)
    return {
      monster: { ...monster, pendingEvolutionIds: options },
      events: [{ type: 'evolutionChoice', monsterId: monster.id, options }],
      rng
    }
  }
  return { monster, events: [], rng }
}

/**
 * Người chơi chọn hướng tiến hóa đang chờ (ngoài trận). Điều kiện theo quái / đội xét lại (đồ cầm
 * có thể đã tháo); điều kiện theo nơi (map, môi trường) đã đủ ở nơi đặt hướng chờ.
 */
export function chooseEvolution(
  data: GameData,
  state: GameState,
  monsterId: string,
  speciesId: string
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const { monster, replace } = locateOwned(state, monsterId)
  if (!monster.pendingEvolutionIds.includes(speciesId)) {
    throw new ActionError('notPendingEvolution', { speciesId })
  }
  const evolution = currentSpecies(data, monster)?.evolutions.find((e) => e.speciesId === speciesId)
  const scene: EvolutionScene = {
    party: state.party,
    place: null,
    aptitudeFloor: aptitudeFloor(state),
    time: state.time
  }
  if (!evolution || !conditionsMet(data, monster, evolution, { scene, assumeScene: true })) {
    throw new ActionError('evolutionConditionsUnmet', { speciesId })
  }
  const result = evolveVia(data, monster, { evolution, rng: state.rng, day: dayOf(state.time) })
  return {
    ...replace(result.monster),
    rng: result.rng,
    research: recordEvolutionResearch(data, state.research, result.events)
  }
}

/**
 * Bỏ qua hướng tiến hóa đang chờ của quái vừa thoái hóa (ngoài trận): xóa danh sách chờ, giữ cờ
 * vừa thoái hóa nên trận thắng sau lại hỏi (chờ đủ điều kiện nhánh khác). Quái thường không bỏ qua
 * được (tiến hóa không hủy được, mục "Tiến hóa").
 */
export function skipEvolution(state: GameState, monsterId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const { monster, replace } = locateOwned(state, monsterId)
  if (monster.pendingEvolutionIds.length === 0) {
    throw new ActionError('noPendingEvolution', { monsterId })
  }
  if (monster.devolvedFromSpeciesId === null) {
    throw new ActionError('evolutionNotSkippable', { monsterId })
  }
  return replace({ ...monster, pendingEvolutionIds: [] })
}
