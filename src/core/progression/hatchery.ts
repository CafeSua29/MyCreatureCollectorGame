// Phòng ấp theo môi trường (docs/rules/hatchery.md, theo Hatching room của Portals of Phereon): trứng
// đặt trong phòng có môi trường dựng sẵn. Loại trứng theo hệ của quái trong trứng; luật cộng sức lớn
// (bước mỗi trận thắng / mỗi ngày) và độ ổn định theo loại trứng × môi trường và theo trứng khác cùng
// phòng (config.hatchery.rules / neighborRules), cộng hook trait của quái trong trứng và tinh chất.
// Trứng trong phòng lúc nở tung độ ổn định: thất bại thì trứng hỏng, ổn định trên 100 thì gen tăng.

import {
  ActionError,
  BIG_ONE,
  pick,
  rollPercent,
  spendMoney,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import { assertNotBusy, expForLevel, monsterGrowthRate } from '../monster'
import { addItems, addSoulCrystalPoints } from '../inventory'
import { traitEggRoomPercent, traitHatcherPercent } from '../registries'
import {
  STAT_NAMES,
  type Egg,
  type EssenceState,
  type GameData,
  type GameState,
  type HatcheryHabitat,
  type HatcheryNeighborRule,
  type HatcheryRoom,
  type HatcheryRule,
  type HatcheryState,
  type HatcheryUpgradeEffect,
  type Monster,
  type StatName
} from '../model'
import { essenceEggBonus } from './essences'

/** Phần state phòng ấp cần: phòng, tinh chất, mọi trứng (trứng cùng phòng ảnh hưởng nhau). */
export interface HatcheryView {
  hatchery: HatcheryState
  essences: EssenceState
  eggs: readonly Egg[]
  /** Người ấp là quái trong kho. */
  storage: readonly Monster[]
}

/** Loại trứng của quái: loài ghi `eggType` thì dùng, không thì theo hệ đầu tiên có trong bảng. */
export function eggTypeOf(data: GameData, monster: Monster): string {
  const species = data.species[monster.baseSpeciesId]
  if (species?.kind === 'normal' && species.eggType !== undefined) return species.eggType
  const { eggTypeByElement, defaultEggType } = data.config.hatchery
  const elementId = monster.elementIds.find((id) => Object.hasOwn(eggTypeByElement, id))
  return elementId === undefined ? defaultEggType : eggTypeByElement[elementId]
}

/** Môi trường của phòng `roomIndex` (phòng chưa dựng = môi trường mặc định). */
export function roomHabitatId(
  data: GameData,
  state: Pick<GameState, 'hatchery'>,
  roomIndex: number
): string {
  return state.hatchery.rooms[roomIndex]?.habitatId ?? data.config.hatchery.defaultHabitatId
}

const matches = (list: readonly string[] | undefined, value: string): boolean =>
  list === undefined || list.includes(value)
const excludes = (list: readonly string[] | undefined, value: string): boolean =>
  list === undefined || !list.includes(value)

function ruleApplies(rule: HatcheryRule, eggType: string, habitatId: string): boolean {
  return (
    matches(rule.eggTypes, eggType) &&
    excludes(rule.notEggTypes, eggType) &&
    matches(rule.habitatIds, habitatId) &&
    excludes(rule.notHabitatIds, habitatId)
  )
}

function neighborApplies(
  rule: HatcheryNeighborRule,
  eggType: string,
  neighborType: string
): boolean {
  return (
    matches(rule.eggTypes, eggType) &&
    excludes(rule.notEggTypes, eggType) &&
    matches(rule.neighborEggTypes, neighborType) &&
    excludes(rule.notNeighborEggTypes, neighborType)
  )
}

/** Hiệu ứng của các nâng cấp phòng đang có tác dụng (đúng môi trường). */
export function roomEffects(
  data: GameData,
  state: Pick<HatcheryView, 'hatchery'>,
  roomIndex: number
): HatcheryUpgradeEffect[] {
  const room = state.hatchery.rooms[roomIndex]
  if (!room) return []
  return room.upgrades.flatMap(
    (id) => data.config.hatchery.upgrades.find((upgrade) => upgrade.id === id)?.effects ?? []
  )
}

/** Sức ấp của quái theo công đặc biệt gốc của loài, giảm dần như getBaseHatcherBonus của gốc. */
export function hatcherPower(data: GameData, monster: Monster): number {
  const { statPerPoint, diminishEvery, diminishFactor } = data.config.hatchery.hatcher
  const species = data.species[monster.baseSpeciesId]
  const stat = species?.kind === 'normal' ? species.baseStats.spAttack : 0
  let points = stat / statPerPoint
  let total = 0
  let factor = 1
  while (points > 0 && factor > 0.001) {
    total += Math.min(points, diminishEvery) * factor
    points -= diminishEvery
    factor *= diminishFactor
  }
  const percent = traitHatcherPercent(data, monster)
  return Math.round(total * (1 + percent / 100))
}

/** Sức lớn người ấp cho trứng: sức ấp, cùng loại trứng, loại trứng của người ấp hợp môi trường. */
function hatcherGrowth(
  data: GameData,
  state: HatcheryView,
  { roomIndex, eggType }: { roomIndex: number; eggType: string }
): number {
  const hatcherId = state.hatchery.rooms[roomIndex]?.hatcherId
  if (hatcherId === undefined || hatcherId === null) return 0
  const hatcher = state.storage.find((monster) => monster.id === hatcherId)
  if (!hatcher) return 0
  const config = data.config.hatchery.hatcher
  const ownType = eggTypeOf(data, hatcher)
  const habitatType = config.habitatEggTypes[roomHabitatId(data, state, roomIndex)]
  return (
    hatcherPower(data, hatcher) +
    (ownType === eggType ? config.sameEggTypeGrowth : 0) +
    (ownType === habitatType ? config.habitatGrowth : 0)
  )
}

/** Sức lớn (% bước) và độ ổn định (điểm %) của một trứng đang ở phòng ấp. */
export function eggRoomBonus(
  data: GameData,
  state: HatcheryView,
  egg: Egg
): { growth: number; stability: number } {
  const config = data.config.hatchery
  if (egg.roomIndex === undefined) return { growth: 0, stability: 0 }
  const eggType = eggTypeOf(data, egg.monster)
  const habitatId = roomHabitatId(data, state, egg.roomIndex)
  let growth = 0
  let stability = config.baseStability
  for (const rule of config.rules) {
    if (!ruleApplies(rule, eggType, habitatId)) continue
    growth += rule.growth ?? 0
    stability += rule.stability ?? 0
  }
  for (const other of state.eggs) {
    if (other.id === egg.id || other.roomIndex !== egg.roomIndex) continue
    const neighborType = eggTypeOf(data, other.monster)
    for (const rule of config.neighborRules) {
      if (!neighborApplies(rule, eggType, neighborType)) continue
      growth += rule.growth ?? 0
      stability += rule.stability ?? 0
    }
  }
  const essence = essenceEggBonus(data, state.essences)
  growth += essence.growth + traitEggRoomPercent(data, egg.monster, 'growth')
  stability += essence.stability + traitEggRoomPercent(data, egg.monster, 'stability')
  growth += hatcherGrowth(data, state, { roomIndex: egg.roomIndex, eggType })
  for (const effect of roomEffects(data, state, egg.roomIndex)) {
    if (effect.kind === 'bonus') {
      growth += effect.growth ?? 0
      stability += effect.stability ?? 0
    } else if (effect.kind === 'sameSpecies') {
      const same = state.eggs.filter(
        (other) =>
          other.id !== egg.id &&
          other.roomIndex === egg.roomIndex &&
          other.monster.baseSpeciesId === egg.monster.baseSpeciesId
      )
      growth += effect.growth * same.length
    } else if (effect.kind === 'readyEggs') {
      const ready = state.eggs.filter(
        (other) =>
          other.id !== egg.id && other.roomIndex === egg.roomIndex && other.battlesLeft <= 1
      )
      stability += effect.stability * ready.length
    }
  }
  return { growth, stability }
}

/**
 * Số bước trứng tiến trong một lần (`steps` bước gốc): trứng ở phòng nhân (1 + sức lớn %), phần lẻ
 * tung theo tỉ lệ (sức lớn âm có thể không tiến). Trứng mang theo không tốn RNG.
 */
export function roomSteps(
  data: GameData,
  rng: RngState,
  { state, egg, steps }: { state: HatcheryView; egg: Egg; steps: number }
): [number, RngState] {
  if (egg.roomIndex === undefined) return [steps, rng]
  const { growth } = eggRoomBonus(data, state, egg)
  // Delayed của gốc: giảm phần bước gốc, sức lớn cộng thêm giữ nguyên.
  const basePercent = roomEffects(data, state, egg.roomIndex).reduce(
    (sum, effect) => (effect.kind === 'bonus' ? sum + (effect.growthPercent ?? 0) : sum),
    100
  )
  const exact = Math.max(0, steps * ((Math.max(0, basePercent) + growth) / 100))
  const whole = Math.floor(exact)
  const fraction = Math.round((exact - whole) * 100)
  const [extra, next] = rollPercent(rng, fraction)
  return [whole + (extra ? 1 : 0), next]
}

/** Kết quả nở của trứng trong phòng. */
export type RoomHatch =
  /** Nở được: quái bên trong (đã áp nâng cấp). */
  | { outcome: 'hatched'; monster: Monster }
  /** Hỏng, mất trứng. */
  | { outcome: 'lost' }
  /** Hỏng nhưng trứng lùi về `battlesLeft` (Continuous). */
  | { outcome: 'retry'; battlesLeft: number }

/** Áp phần ổn định dư lên gen: mọi gen, hoặc chỉ gen cao nhất / thấp nhất (Focusing, Equalizing). */
function applyExcessStability(
  data: GameData,
  monster: Monster,
  { excess, effects }: { excess: number; effects: readonly HatcheryUpgradeEffect[] }
): Monster {
  if (excess <= 0) return monster
  const { genePercentPerExcessStability } = data.config.hatchery
  const focus = effects.find((effect) => effect.kind === 'excessGenes')
  const pickStat = (better: (a: Decimal, b: Decimal) => boolean): StatName =>
    STAT_NAMES.reduce((best, stat) =>
      better(monster.genes[stat], monster.genes[best]) ? stat : best
    )
  const stats: readonly StatName[] = !focus
    ? STAT_NAMES
    : [focus.target === 'highest' ? pickStat((a, b) => a.gt(b)) : pickStat((a, b) => a.lt(b))]
  const factor = 1 + (excess * genePercentPerExcessStability * (focus?.multiplier ?? 1)) / 100
  return { ...monster, genes: raiseGenes(monster.genes, stats, factor) }
}

/** Gen các chỉ số × hệ số, làm tròn xuống, ít nhất +1 (số cực lớn vẫn là Decimal). */
function raiseGenes(
  genes: Monster['genes'],
  stats: readonly StatName[],
  factor: number
): Monster['genes'] {
  const raised = { ...genes }
  for (const stat of stats) {
    const boosted = raised[stat].times(factor).floor()
    raised[stat] = boosted.gt(raised[stat]) ? boosted : raised[stat].plus(BIG_ONE)
  }
  return raised
}

/** Thêm một trait ngẫu nhiên chưa có, còn ô (Mutating; gốc thử tối đa 5 lần). */
function gainRandomTrait(data: GameData, rng: RngState, monster: Monster): [Monster, RngState] {
  const free = Object.values(data.traits).filter(
    (trait) =>
      (trait.kind === 'positive' || trait.kind === 'rare') &&
      !monster.traits.some(
        (own) =>
          own.id === trait.id ||
          (trait.exclusiveGroup !== undefined &&
            data.traits[own.id].exclusiveGroup === trait.exclusiveGroup)
      )
  )
  if (free.length === 0 || monster.traits.length >= monster.traitSlots) return [monster, rng]
  const [trait, next] = pick(rng, free)
  return [{ ...monster, traits: [...monster.traits, { id: trait.id, level: 1 }] }, next]
}

/** Áp nâng cấp và môi trường lên quái vừa nở thành công. */
function applyHatchEffects(
  data: GameData,
  rng: RngState,
  {
    monster,
    effects,
    habitatId
  }: { monster: Monster; effects: readonly HatcheryUpgradeEffect[]; habitatId: string }
): [Monster, RngState] {
  let result = monster
  const grant = (traitId: string): void => {
    if (
      !result.traits.some((own) => own.id === traitId) &&
      result.traits.length < result.traitSlots
    ) {
      result = { ...result, traits: [...result.traits, { id: traitId, level: 1 }] }
    }
  }
  const habitat = data.config.hatchery.habitats.find((entry) => entry.id === habitatId)
  if (habitat?.hatchTraitId) grant(habitat.hatchTraitId)
  for (const effect of effects) {
    if (effect.kind === 'hatchTrait') grant(effect.traitId)
    else if (effect.kind === 'randomTrait') [result, rng] = gainRandomTrait(data, rng, result)
    else if (effect.kind === 'hatchGenes') {
      result = { ...result, genes: raiseGenes(result.genes, STAT_NAMES, 1 + effect.percent / 100) }
    } else if (effect.kind === 'hatchLevels') {
      const level = result.level + effect.levels
      result = { ...result, level, exp: expForLevel(level, monsterGrowthRate(data, result)) }
    } else if (effect.kind === 'hatchCare') {
      const { max } = data.config.dwelling.needs
      result = { ...result, fullness: max, sanity: max }
    }
  }
  return [result, rng]
}

/**
 * Trứng ở phòng ấp lúc nở: tung độ ổn định (kẹp dưới minHatchChance, trên 100 luôn nở). Thành công: gen tăng
 * theo phần dư, áp nâng cấp và trait môi trường. Thất bại: mất trứng, hoặc lùi lại nếu phòng có Continuous.
 * Trứng mang theo nở như cũ, không tốn RNG.
 */
export function hatchFromRoom(
  data: GameData,
  rng: RngState,
  { state, egg }: { state: HatcheryView; egg: Egg }
): [RoomHatch, RngState] {
  if (egg.roomIndex === undefined) return [{ outcome: 'hatched', monster: egg.monster }, rng]
  const { minHatchChance } = data.config.hatchery
  const { stability } = eggRoomBonus(data, state, egg)
  const effects = roomEffects(data, state, egg.roomIndex)
  const [hatched, next] = rollPercent(rng, Math.max(minHatchChance, stability))
  if (!hatched) {
    const fail = effects.find(
      (effect) => effect.kind === 'onFail' && effect.battlesLeft !== undefined
    )
    return fail?.kind === 'onFail' && fail.battlesLeft !== undefined
      ? [{ outcome: 'retry', battlesLeft: fail.battlesLeft }, next]
      : [{ outcome: 'lost' }, next]
  }
  const raised = applyExcessStability(data, egg.monster, { excess: stability - 100, effects })
  const [monster, after] = applyHatchEffects(data, next, {
    monster: raised,
    effects,
    habitatId: roomHabitatId(data, state, egg.roomIndex)
  })
  return [{ outcome: 'hatched', monster }, after]
}

/**
 * Việc sau khi trứng trong phòng nở / hỏng: nâng cấp cho trứng khác tiến bước (dừng ở 1), vật phẩm, điểm hồn
 * tinh. Trả phần state đổi.
 */
export function settleRoomHatch<T extends HatcheryView & Pick<GameState, 'inventory'>>(
  data: GameData,
  state: T,
  { egg, succeeded }: { egg: Egg; succeeded: boolean }
): T {
  if (egg.roomIndex === undefined) return state
  let steps = 0
  let { inventory } = state
  const eggType = eggTypeOf(data, egg.monster)
  for (const effect of roomEffects(data, state, egg.roomIndex)) {
    if (succeeded && effect.kind === 'boostOthers') steps += effect.steps
    if (succeeded && effect.kind === 'hatchItem' && effect.eggTypes.includes(eggType)) {
      inventory = addItems(inventory, effect.itemId, effect.count)
    }
    if (!succeeded && effect.kind === 'onFail') {
      steps += effect.spreadSteps ?? 0
      if (effect.soulPoints) inventory = addSoulCrystalPoints(data, inventory, effect.soulPoints)
    }
  }
  const eggs = state.eggs.map((other) =>
    other.id !== egg.id && other.roomIndex === egg.roomIndex && other.battlesLeft > 1
      ? { ...other, battlesLeft: Math.max(1, other.battlesLeft - steps) }
      : other
  )
  return { ...state, inventory, eggs }
}

function requireHabitat(data: GameData, habitatId: string): HatcheryHabitat {
  const habitat = data.config.hatchery.habitats.find((entry) => entry.id === habitatId)
  if (!habitat) throw new ActionError('unknownHabitat', { habitatId })
  return habitat
}

function requireRoom(data: GameData, roomIndex: unknown): number {
  const { roomCount } = data.config.hatchery
  if (
    !Number.isSafeInteger(roomIndex) ||
    (roomIndex as number) < 0 ||
    (roomIndex as number) >= roomCount
  ) {
    throw new ActionError('roomNotFound', { roomIndex: String(roomIndex) })
  }
  return roomIndex as number
}

/** Phòng theo chỉ số (phòng chưa dựng: mặc định). */
function roomAt(data: GameData, state: Pick<GameState, 'hatchery'>, index: number): HatcheryRoom {
  return (
    state.hatchery.rooms[index] ?? {
      habitatId: data.config.hatchery.defaultHabitatId,
      upgrades: [],
      hatcherId: null
    }
  )
}

/** Danh sách phòng sau khi đặt phòng `index` (phòng chưa dựng phía trước dùng mặc định). */
function withRoom(
  data: GameData,
  state: Pick<GameState, 'hatchery'>,
  index: number,
  room: HatcheryRoom
): HatcheryRoom[] {
  const length = Math.max(state.hatchery.rooms.length, index + 1)
  return Array.from({ length }, (_, i) => (i === index ? room : roomAt(data, state, i)))
}

function upgradeFitsHabitat(data: GameData, upgradeId: string, habitatId: string): boolean {
  const upgrade = data.config.hatchery.upgrades.find((entry) => entry.id === upgradeId)
  return upgrade?.habitatIds === undefined || upgrade.habitatIds.includes(habitatId)
}

/** Mua nâng cấp phòng (thị trấn, ngoài trận): đúng môi trường, chưa có, chưa đủ upgradeCap. */
export function buyHatcheryUpgrade(
  data: GameData,
  state: GameState,
  { roomIndex, upgradeId }: { roomIndex: number; upgradeId: string }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const index = requireRoom(data, roomIndex)
  const { upgrades, upgradeCap } = data.config.hatchery
  const upgrade = upgrades.find((entry) => entry.id === upgradeId)
  if (!upgrade) throw new ActionError('unknownHatcheryUpgrade', { upgradeId })
  const room = roomAt(data, state, index)
  if (room.upgrades.includes(upgradeId)) {
    throw new ActionError('hatcheryUpgradeOwned', { roomIndex: index, upgradeId })
  }
  if (!upgradeFitsHabitat(data, upgradeId, room.habitatId)) {
    throw new ActionError('hatcheryUpgradeWrongHabitat', { roomIndex: index, upgradeId })
  }
  if (room.upgrades.length >= upgradeCap) {
    throw new ActionError('hatcheryUpgradeCap', { roomIndex: index, max: upgradeCap })
  }
  const paid = spendMoney(state, toBig(upgrade.price))
  const next = { ...room, upgrades: [...room.upgrades, upgradeId] }
  return { ...paid, hatchery: { rooms: withRoom(data, paid, index, next) } }
}

/**
 * Đặt / đổi người ấp (ngoài trận): quái trong kho, rảnh; người cũ của phòng được thả. monsterId null = cho
 * nghỉ. Người ấp bị khóa như quái đang làm việc (assignment `hatchery`).
 */
export function setHatcher(
  data: GameData,
  state: GameState,
  { roomIndex, monsterId }: { roomIndex: number; monsterId: string | null }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const index = requireRoom(data, roomIndex)
  const room = roomAt(data, state, index)
  if (monsterId !== null) {
    const monster = state.storage.find((entry) => entry.id === monsterId)
    if (!monster) throw new ActionError('hatcherNotInStorage', { monsterId })
    assertNotBusy(monster)
  }
  const storage = state.storage.map((monster) => {
    if (monster.id === monsterId) {
      return { ...monster, assignment: { kind: 'hatchery' as const, id: `room-${index}` } }
    }
    return monster.id === room.hatcherId ? { ...monster, assignment: null } : monster
  })
  const next = { ...room, hatcherId: monsterId }
  return { ...state, storage, hatchery: { rooms: withRoom(data, state, index, next) } }
}

/** Dựng lại phòng thành môi trường khác (thị trấn, ngoài trận): trả tiền dựng. */
export function buildHatcheryHabitat(
  data: GameData,
  state: GameState,
  { roomIndex, habitatId }: { roomIndex: number; habitatId: string }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const index = requireRoom(data, roomIndex)
  const habitat = requireHabitat(data, habitatId)
  if (roomHabitatId(data, state, index) === habitatId) {
    throw new ActionError('habitatAlreadyBuilt', { roomIndex: index, habitatId })
  }
  const paid = spendMoney(state, toBig(habitat.buildCost))
  const room = roomAt(data, paid, index)
  // Nâng cấp chỉ hợp môi trường cũ thì mất.
  const upgrades = room.upgrades.filter((id) => upgradeFitsHabitat(data, id, habitatId))
  return {
    ...paid,
    hatchery: { rooms: withRoom(data, paid, index, { ...room, habitatId, upgrades }) }
  }
}

/** Đặt trứng vào phòng (`roomIndex`) hoặc lấy ra mang theo (null); phòng đầy thì roomFull. */
export function placeEgg(
  data: GameData,
  state: GameState,
  { eggId, roomIndex }: { eggId: string; roomIndex: number | null }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const egg = state.eggs.find((entry) => entry.id === eggId)
  if (!egg) throw new ActionError('eggNotFound', { eggId })
  if (roomIndex !== null) {
    const index = requireRoom(data, roomIndex)
    const used = state.eggs.filter((e) => e.roomIndex === index && e.id !== eggId).length
    if (used >= data.config.hatchery.eggsPerRoom) {
      throw new ActionError('roomFull', { roomIndex: index, max: data.config.hatchery.eggsPerRoom })
    }
  }
  const eggs = state.eggs.map((entry) => {
    if (entry.id !== eggId) return entry
    const { roomIndex: _old, ...rest } = entry
    return roomIndex === null ? rest : { ...rest, roomIndex }
  })
  return { ...state, eggs }
}

/**
 * Việc theo ngày (DAILY_TASKS): trứng trong phòng tiến `dailySteps` bước (nhân sức lớn) nhưng dừng ở 1
 * (trứng chỉ nở sau trận thắng, nơi xử lý chỗ trong đội / kho).
 */
export function hatcheryDailyTask(data: GameData, state: GameState): GameState {
  const { dailySteps } = data.config.hatchery
  if (!state.eggs.some((egg) => egg.roomIndex !== undefined)) return state
  let rng = state.rng
  let { inventory } = state
  for (const egg of state.eggs) {
    if (egg.roomIndex === undefined) continue
    const eggType = eggTypeOf(data, egg.monster)
    for (const effect of roomEffects(data, state, egg.roomIndex)) {
      if (effect.kind === 'dailyItem' && effect.eggTypes.includes(eggType)) {
        inventory = addItems(inventory, effect.itemId, effect.count)
      }
    }
  }
  if (dailySteps <= 0) return { ...state, inventory }
  const eggs = state.eggs.map((egg) => {
    if (egg.roomIndex === undefined || egg.battlesLeft <= 1) return egg
    let steps: number
    ;[steps, rng] = roomSteps(data, rng, { state, egg, steps: dailySteps })
    return { ...egg, battlesLeft: Math.max(1, egg.battlesLeft - steps) }
  })
  return { ...state, rng, inventory, eggs }
}
