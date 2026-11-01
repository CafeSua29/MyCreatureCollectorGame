// Động phủ (docs/rules/dwelling.md): công trình (xây / nâng cấp), quái trong kho làm việc theo
// chỉ số làm việc, sức làm việc (Linh mạch cộng thêm), việc theo ngày (sản xuất vào kho động phủ, chăm sóc,
// linh điền lớn, thân mật quái làm việc), lấy đồ về túi, cộng % luyện.

import { addBooks, addItems, learnsetSkillIds, removeItems, rollSkillBooks } from '../inventory'
import { changeAffinity, workerPower } from '../registries'
import { assertNotBusy, isFainted } from '../monster'
import { biomeOfFloor } from '../world'
import {
  ActionError,
  assertNever,
  rollAmount,
  spendMoney,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import {
  type BuildingDef,
  type BuildingState,
  type CraftStation,
  type DayEvent,
  type DwellingState,
  type GameData,
  type GameState
} from '../model'
import { growCrops } from './garden'
import { needsDay } from './needs'
import { requireTown } from './town'

// Khả năng làm việc của quái ở registries/work.ts; xuất lại cho bên ngoài core (UI, mô phỏng).
export {
  speciesWorkStats,
  workConditionPercent,
  workSpeedPercent,
  workStats,
  workerPower
} from '../registries'

/** Sức gốc: cấp × Σ sức quái đang làm (quái đã rời kho không tính). */
function basePower(
  data: GameData,
  state: GameState,
  { def, building }: { def: BuildingDef; building: BuildingState }
): number {
  const total = building.workers.reduce((sum, monsterId) => {
    const monster = state.storage.find((m) => m.id === monsterId)
    return monster ? sum + workerPower(data, monster, def.workType) : sum
  }, 0)
  return building.level * total
}

/**
 * Sức làm việc của mọi công trình đã xây: sức gốc × (1 + Σ % của công trình `outputBoost` / 100);
 * công trình `outputBoost` không tự cộng cho mình.
 */
export function buildingPowers(data: GameData, state: GameState): Record<string, number> {
  const base: Record<string, number> = {}
  let boostPercent = 0
  for (const [id, building] of Object.entries(state.dwelling.buildings)) {
    const def = data.buildings[id]
    base[id] = basePower(data, state, { def, building })
    if (def.effect.type === 'outputBoost') boostPercent += def.effect.percentPerPower * base[id]
  }
  return Object.fromEntries(
    Object.entries(base).map(([id, power]) => [
      id,
      data.buildings[id].effect.type === 'outputBoost' ? power : power * (1 + boostPercent / 100)
    ])
  )
}

/** Tổng `percentPerPower × sức` của các công trình thỏa `matches` (cộng % luyện, linh điền lớn). */
function sumEffectPercent(
  data: GameData,
  state: GameState,
  matches: (def: BuildingDef) => number | null
): number {
  const powers = buildingPowers(data, state)
  return Object.entries(powers).reduce((sum, [id, power]) => {
    const percent = matches(data.buildings[id])
    return percent === null ? sum : sum + percent * power
  }, 0)
}

/** + điểm % thành công ở nơi luyện từ công trình `craftBonus` (Luyện khí phòng). */
export const dwellingCraftBonus = (
  data: GameData,
  state: GameState,
  station: CraftStation
): number =>
  sumEffectPercent(data, state, (def) =>
    def.effect.type === 'craftBonus' && def.effect.stations.includes(station)
      ? def.effect.percentPerPower
      : null
  )

/** % linh điền lớn thêm mỗi ngày từ công trình `cropGrowth` (Linh tuyền). */
export const cropGrowthPercent = (data: GameData, state: GameState): number =>
  sumEffectPercent(data, state, (def) =>
    def.effect.type === 'cropGrowth' ? def.effect.percentPerPower : null
  )

/** Số ô linh điền theo cấp các công trình `garden`. */
export function dwellingPlotCount(
  data: GameData,
  buildings: Readonly<Record<string, BuildingState>>
): number {
  return Object.entries(buildings).reduce((sum, [id, building]) => {
    const effect = data.buildings[id]?.effect
    return effect?.type === 'garden' ? sum + building.level * effect.plotsPerLevel : sum
  }, 0)
}

/** Động phủ lúc tạo game: công trình có startLevel ≥ 1, ô linh điền trống, kho rỗng. */
export function newDwellingState(data: GameData): DwellingState {
  const buildings: Record<string, BuildingState> = {}
  for (const def of Object.values(data.buildings)) {
    if (def.startLevel > 0) buildings[def.id] = { level: def.startLevel, workers: [] }
  }
  return {
    buildings,
    plots: Array.from({ length: dwellingPlotCount(data, buildings) }, () => null),
    storage: { stacks: {}, books: [] },
    feedBox: {}
  }
}

function requireBuildingDef(data: GameData, buildingId: string): BuildingDef {
  const def = Object.hasOwn(data.buildings, buildingId) ? data.buildings[buildingId] : undefined
  if (!def) throw new ActionError('unknownBuilding', { buildingId })
  return def
}

/** Cấp hiện tại của công trình (0 = chưa xây). */
export const buildingLevel = (state: GameState, buildingId: string): number =>
  state.dwelling.buildings[buildingId]?.level ?? 0

/** Số ô quái làm việc của công trình: cấp × slotsPerLevel. */
export const buildingSlots = (data: GameData, state: GameState, buildingId: string): number =>
  buildingLevel(state, buildingId) * data.buildings[buildingId].slotsPerLevel

/**
 * Giá nâng công trình lên cấp kế tiếp (cấp L, n = L − startLevel): tiền money × moneyGrowth ^ (n − 1),
 * mỗi món count × (n − 1) (bậc đầu chỉ tốn tiền, để xây được trước khi có nguyên liệu).
 */
export function buildingUpgradeCost(
  data: GameData,
  state: GameState,
  buildingId: string
): { money: Decimal; items: { itemId: string; count: number }[] } {
  const def = requireBuildingDef(data, buildingId)
  const steps = Math.max(1, buildingLevel(state, buildingId) + 1 - def.startLevel)
  return {
    money: toBig(def.cost.moneyGrowth)
      .pow(steps - 1)
      .times(def.cost.money)
      .floor(),
    items:
      steps > 1
        ? def.cost.items.map(({ itemId, count }) => ({ itemId, count: count * (steps - 1) }))
        : []
  }
}

/** Xây (cấp 0 → 1) hoặc nâng cấp công trình ở thị trấn; linh điền thêm ô trống. */
export function upgradeBuilding(data: GameData, state: GameState, buildingId: string): GameState {
  requireTown(state)
  const def = requireBuildingDef(data, buildingId)
  const level = buildingLevel(state, buildingId)
  if (def.maxLevel !== undefined && level >= def.maxLevel) {
    throw new ActionError('buildingMaxLevel', { buildingId, maxLevel: def.maxLevel })
  }
  const cost = buildingUpgradeCost(data, state, buildingId)
  const inventory = cost.items.reduce(
    (current, { itemId, count }) => removeItems(current, itemId, count),
    state.inventory
  )
  const paid = spendMoney(state, cost.money)
  const current = state.dwelling.buildings[buildingId]
  const buildings = {
    ...state.dwelling.buildings,
    [buildingId]: { level: level + 1, workers: current?.workers ?? [] }
  }
  const added = dwellingPlotCount(data, buildings) - state.dwelling.plots.length
  const plots = [...state.dwelling.plots, ...Array.from({ length: added }, () => null)]
  return { ...paid, inventory, dwelling: { ...state.dwelling, buildings, plots } }
}

/** Giao quái trong kho (rảnh, không gục) làm việc ở công trình đã xây còn ô (thị trấn). */
export function assignWorker(
  data: GameData,
  state: GameState,
  { buildingId, monsterId }: { buildingId: string; monsterId: string }
): GameState {
  requireTown(state)
  requireBuildingDef(data, buildingId)
  const building = state.dwelling.buildings[buildingId]
  if (!building) throw new ActionError('buildingNotBuilt', { buildingId })
  const slots = buildingSlots(data, state, buildingId)
  if (building.workers.length >= slots) {
    throw new ActionError('buildingSlotsFull', { buildingId, slots })
  }
  const monster = state.storage.find((m) => m.id === monsterId)
  if (!monster) throw new ActionError('monsterNotInStorage', { monsterId })
  assertNotBusy(monster)
  if (isFainted(data, monster)) throw new ActionError('monsterFainted', { monsterId })
  return {
    ...state,
    storage: state.storage.map((m) =>
      m.id === monsterId ? { ...m, assignment: { kind: 'dwelling' as const, id: buildingId } } : m
    ),
    dwelling: {
      ...state.dwelling,
      buildings: {
        ...state.dwelling.buildings,
        [buildingId]: { ...building, workers: [...building.workers, monsterId] }
      }
    }
  }
}

/** Cho quái nghỉ việc ở động phủ (ngoài trận, ở đâu cũng được). */
export function unassignWorker(state: GameState, monsterId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const monster = state.storage.find((m) => m.id === monsterId)
  if (monster?.assignment?.kind !== 'dwelling') {
    throw new ActionError('monsterNotWorking', { monsterId })
  }
  const buildingId = monster.assignment.id
  const building = state.dwelling.buildings[buildingId]
  return {
    ...state,
    storage: state.storage.map((m) => (m.id === monsterId ? { ...m, assignment: null } : m)),
    dwelling: {
      ...state.dwelling,
      buildings: {
        ...state.dwelling.buildings,
        [buildingId]: { ...building, workers: building.workers.filter((id) => id !== monsterId) }
      }
    }
  }
}

/** Lấy hết đồ và sách trong kho động phủ về túi (thị trấn); kho rỗng thì không đổi gì. */
export function collectDwelling(state: GameState): GameState {
  requireTown(state)
  const { stacks, books } = state.dwelling.storage
  const entries = Object.entries(stacks)
  if (entries.length === 0 && books.length === 0) return state
  const withItems = entries.reduce(
    (current, [itemId, count]) => addItems(current, itemId, count),
    state.inventory
  )
  const inventory = books.reduce((current, book) => addBooks(current, book, book.count), withItems)
  return {
    ...state,
    inventory,
    dwelling: { ...state.dwelling, storage: { stacks: {}, books: [] } }
  }
}

/** Bỏ quái đã rời kho (tọa hóa) khỏi danh sách làm việc. */
function pruneWorkers(state: GameState): GameState {
  const stored = new Set(state.storage.map((m) => m.id))
  const entries = Object.entries(state.dwelling.buildings)
  if (entries.every(([, b]) => b.workers.every((id) => stored.has(id)))) return state
  const buildings = Object.fromEntries(
    entries.map(([id, b]) => [id, { ...b, workers: b.workers.filter((w) => stored.has(w)) }])
  )
  return { ...state, dwelling: { ...state.dwelling, buildings } }
}

/** Sách kỹ năng của Tàng thư các: skill trong learnset loài của map tầng cao nhất (như rương bí cảnh). */
function researchBooks(
  data: GameData,
  state: GameState,
  { count, reusableChance }: { count: number; reusableChance: number }
): GameState {
  const biome = biomeOfFloor(data, state, state.highestFloor)
  const [books, rng] = rollSkillBooks(data, state.rng, {
    skillIds: learnsetSkillIds(
      data,
      biome.encounters.map((entry) => entry.speciesId)
    ),
    party: state.party,
    count,
    reusableChance
  })
  const storage = books.reduce(
    (current, book) => addBooks(current, book, 1),
    state.dwelling.storage
  )
  return { ...state, rng, dwelling: { ...state.dwelling, storage } }
}

/** Việc trong ngày của một công trình theo loại hiệu ứng (sức > 0). */
function runBuildingDay(
  data: GameData,
  state: GameState,
  { def, power }: { def: BuildingDef; power: number }
): GameState {
  const effect = def.effect
  switch (effect.type) {
    case 'produce': {
      let rng: RngState = state.rng
      let storage = state.dwelling.storage
      for (const drop of effect.drops) {
        let count: number
        ;[count, rng] = rollAmount(rng, drop.perDay * power)
        if (count > 0) storage = addItems(storage, drop.itemId, count)
      }
      return { ...state, rng, dwelling: { ...state.dwelling, storage } }
    }
    case 'nurture': {
      const [affinity, afterAffinity] = rollAmount(state.rng, effect.affinityPerPower * power)
      const [steps, rng] = rollAmount(afterAffinity, effect.eggStepsPerPower * power)
      return {
        ...state,
        rng,
        storage:
          affinity > 0
            ? state.storage.map((m) => changeAffinity(data, m, affinity))
            : state.storage,
        eggs:
          steps > 0
            ? state.eggs.map((egg) => ({
                ...egg,
                battlesLeft: Math.max(0, egg.battlesLeft - steps)
              }))
            : state.eggs
      }
    }
    case 'research': {
      const [count, rng] = rollAmount(state.rng, effect.booksPerPower * power)
      if (count === 0) return { ...state, rng }
      return researchBooks(
        data,
        { ...state, rng },
        { count, reusableChance: effect.reusableChance }
      )
    }
    // Tác dụng tính lúc dùng (sức, % luyện, linh điền lớn) hoặc ở needsDay (nghỉ ngơi).
    case 'rest':
    case 'garden':
    case 'cropGrowth':
    case 'outputBoost':
    case 'craftBonus':
      return state
    default:
      return assertNever(effect)
  }
}

/**
 * Việc theo ngày (DAILY_TASKS): công trình làm việc theo sức (tính đầu ngày), đói / tinh thần, linh
 * điền lớn, quái làm việc + thân mật mỗi workerAffinityDays ngày.
 */
export function dwellingDailyTask(
  data: GameData,
  state: GameState,
  events: DayEvent[],
  day: number
): GameState {
  let next = pruneWorkers(state)
  const powers = buildingPowers(data, next)
  const growthPercent = cropGrowthPercent(data, next)
  for (const def of Object.values(data.buildings)) {
    const power = powers[def.id] ?? 0
    if (power > 0) next = runBuildingDay(data, next, { def, power })
  }
  // Đói / tinh thần sau khi làm việc (sức trong ngày theo tình trạng đầu ngày; needs.ts).
  next = needsDay(data, next)
  next = growCrops(data, next, { events, growthPercent })
  const { workerAffinity, workerAffinityDays } = data.config.dwelling
  if (workerAffinity > 0 && day % workerAffinityDays === 0) {
    next = {
      ...next,
      storage: next.storage.map((m) =>
        m.assignment?.kind === 'dwelling' ? changeAffinity(data, m, workerAffinity) : m
      )
    }
  }
  return next
}
