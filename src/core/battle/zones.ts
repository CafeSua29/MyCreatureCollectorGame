// Hiểm địa (docs/rules/zones.md): vào ở thị trấn khi đạt điều kiện, khám phá từng bước (loại bước
// theo registry ZONE_STEPS), bước cuối là boss canh giữ, rời giữa chừng. Việc sau trận hiểm địa ở
// SPECIAL_BATTLE_RULES.zone (specialBattles.ts).

import { ActionError, pickWeighted, type RngState } from '../shared'
import { addItems, removeItems, rollChestItems } from '../inventory'
import {
  assertNoTournament,
  assertZoneOpen,
  assertZoneRequirements,
  closeZoneVisit,
  generateAnyBossEncounter,
  generateEncounter,
  generateFloorBossEncounter,
  requireZone,
  rollZoneVisit,
  zoneSite,
  type FloorSite
} from '../world'
import {
  ZONE_STEP_KINDS,
  type GameData,
  type GameState,
  type ItemReward,
  type ZoneDef,
  type ZoneLootTable,
  type ZoneStepKind,
  type ZoneStepResult,
  type ZoneVisit
} from '../model'
import { openBattle } from './openBattle'
import { healPercentOfMaxHp } from './rewards'
import { assertReadyForBattle, requireTown } from './trainerBattles'

/** Lượt vào đang diễn ra; không có thì noZoneVisit. */
function requireVisit(state: GameState): ZoneVisit {
  if (!state.zones.visit) throw new ActionError('noZoneVisit')
  return state.zones.visit
}

/** Điều kiện vật phẩm có `consume`: mất khi vào. */
function consumeEntryItems(zone: ZoneDef, state: GameState): GameState['inventory'] {
  let { inventory } = state
  for (const req of zone.requirements) {
    if (req.type === 'item' && req.consume)
      inventory = removeItems(inventory, req.itemId, req.count)
  }
  return inventory
}

/**
 * Vào hiểm địa ở thị trấn: hiểm địa đang mở (không trong thời gian khóa), mọi điều kiện vào đạt,
 * còn quái đánh được, không trong phó bản / giải đấu khác. Chưa đi bước nào.
 */
export function enterZone(data: GameData, state: GameState, zoneId: string): GameState {
  assertReadyForBattle(data, state)
  requireTown(state)
  assertNoTournament(state)
  const zone = requireZone(data, zoneId)
  assertZoneOpen(state, zoneId)
  assertZoneRequirements(data, state, zone)
  const [visit, rng] = rollZoneVisit(data, state.rng, { zoneId, highestFloor: state.highestFloor })
  return {
    ...state,
    rng,
    inventory: consumeEntryItems(zone, state),
    zones: { ...state.zones, visit }
  }
}

/** Rời hiểm địa giữa hai bước: giữ mọi thứ đã nhận, hiểm địa khóa như lượt vào đã xong. */
export function leaveZone(data: GameData, state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  requireVisit(state)
  return { ...state, zones: closeZoneVisit(data, state) }
}

interface StepContext {
  zone: ZoneDef
  site: FloorSite
  /** Lượt vào sau khi tính bước này (stepsTaken đã cộng). */
  visit: ZoneVisit
}

/** Ghi lượt vào (kèm kết quả bước) vào state. */
const withVisit = (state: GameState, visit: ZoneVisit, lastStep: ZoneStepResult): GameState => ({
  ...state,
  zones: { ...state.zones, visit: { ...visit, lastStep } }
})

/** Rương: tung bảng của hiểm địa, món vào túi. */
function openTreasure(
  data: GameData,
  state: GameState,
  {
    table,
    kind,
    visit
  }: { table: ZoneLootTable; kind: 'treasure' | 'rareTreasure'; visit: ZoneVisit }
): GameState {
  const [items, rng] = rollChestItems(data, state.rng, {
    entries: table.items,
    rolls: table.rolls,
    options: state.options
  })
  const inventory = items.reduce(
    (inv, { itemId, count }) => addItems(inv, itemId, count),
    state.inventory
  )
  return withVisit({ ...state, rng, inventory }, visit, { kind, items })
}

/** Trận của bước khám phá (quái hoang / tinh anh / boss canh giữ) với map của hiểm địa. */
function openZoneBattle(
  data: GameData,
  state: GameState,
  {
    visit,
    site,
    kind
  }: Pick<StepContext, 'visit' | 'site'> & { kind: 'battle' | 'elite' | 'guardian' }
): GameState {
  const generate =
    kind === 'guardian'
      ? generateFloorBossEncounter
      : kind === 'elite'
        ? generateAnyBossEncounter
        : generateEncounter
  const encounter = generate(data, state.rng, site, state.nextMonsterId)
  const marked = withVisit(state, visit, { kind })
  return openBattle(data, marked, {
    site,
    encounter,
    special: { kind: 'zone', zoneId: visit.zoneId, guardian: kind === 'guardian' }
  })
}

/** Luật theo loại bước khám phá (trừ bước cuối là boss canh giữ). Thêm loại = thêm một mục. */
const ZONE_STEPS: Record<
  ZoneStepKind,
  (data: GameData, state: GameState, context: StepContext) => GameState
> = {
  battle: (data, state, { visit, site }) =>
    openZoneBattle(data, state, { visit, site, kind: 'battle' }),
  // Quái tinh anh: boss ngẫu nhiên của map (map không có thì boss canh giữ, như bí cảnh bossOnly).
  elite: (data, state, { visit, site }) =>
    openZoneBattle(data, state, { visit, site, kind: 'elite' }),
  treasure: (data, state, { zone, visit }) =>
    openTreasure(data, state, { table: zone.treasure, kind: 'treasure', visit }),
  rareTreasure: (data, state, { zone, visit }) =>
    openTreasure(data, state, { table: zone.rareTreasure, kind: 'rareTreasure', visit }),
  // Linh tuyền: hồi % max HP cho mọi quái trong đội, kể cả quái đã gục.
  spring: (data, state, { visit }) => {
    const healPercent = data.config.zones.springHealPercent
    const party = state.party.map((m) => healPercentOfMaxHp(data, m, healPercent).monster)
    return withVisit({ ...state, party }, visit, { kind: 'spring', healPercent })
  }
}

/** Loại bước theo trọng số của config (bỏ loại trọng số 0). */
function rollStepKind(data: GameData, rng: RngState): [ZoneStepKind, RngState] {
  const weights = data.config.zones.stepWeights
  const kinds = ZONE_STEP_KINDS.filter((kind) => weights[kind] > 0)
  return pickWeighted(rng, kinds, (kind) => weights[kind])
}

/**
 * Khám phá bước kế tiếp: bước cuối (stepsTaken + 1 = steps) là boss canh giữ của map hiểm địa
 * (không tính bước: chạy thì gặp lại lần khám phá sau; thắng / bắt là xong lượt vào); bước khác
 * tung loại theo trọng số rồi làm theo ZONE_STEPS.
 */
export function exploreZone(data: GameData, state: GameState): GameState {
  assertReadyForBattle(data, state)
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  const visit = requireVisit(state)
  const zone = requireZone(data, visit.zoneId)
  const site = zoneSite(data, state, visit)
  if (visit.stepsTaken + 1 >= visit.steps) {
    return openZoneBattle(data, state, { visit, site, kind: 'guardian' })
  }
  const [kind, rng] = rollStepKind(data, state.rng)
  const next = { ...visit, stepsTaken: visit.stepsTaken + 1 }
  return ZONE_STEPS[kind](data, { ...state, rng }, { zone, site, visit: next })
}

/** Thưởng hạ / bắt boss canh giữ: guardianRareRolls lần rương hiếm. */
export function rollGuardianRewards(
  data: GameData,
  rng: RngState,
  { zone, options }: { zone: ZoneDef; options: GameState['options'] }
): [ItemReward[], RngState] {
  const { rolls, items } = zone.rareTreasure
  return rollChestItems(data, rng, {
    entries: items,
    rolls: rolls * data.config.zones.guardianRareRolls,
    options
  })
}
