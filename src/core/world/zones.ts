// Hiểm địa (docs/rules/zones.md): điều kiện vào (registry ZONE_REQUIREMENTS), sinh lượt vào, tầng và
// map của lượt vào, ngày mở lại. Action (vào, khám phá, rời) ở battle/zones.ts vì bước khám phá mở
// trận.

import { ActionError, nextInt, type RngState } from '../shared'
import { evolutionLineOf, getItemCount } from '../inventory'
import { isFainted } from '../monster'
import {
  bestFloorReached,
  dayOf,
  type GameData,
  type GameState,
  type Monster,
  type ZoneDef,
  type ZoneRequirement,
  type ZoneRequirementType,
  type ZoneState,
  type ZoneVisit
} from '../model'
import type { FloorSite } from './floors'

/** Hiểm địa lúc bắt đầu game: không có lượt vào, mọi hiểm địa đều mở. */
export const newZoneState = (): ZoneState => ({
  visit: null,
  reopenDay: {},
  portals: [],
  nextPortalId: 1
})

/** Hiểm địa theo id; không có thì zoneNotFound. */
export function requireZone(data: GameData, zoneId: string): ZoneDef {
  if (!Object.hasOwn(data.zones, zoneId)) throw new ActionError('zoneNotFound', { zoneId })
  return data.zones[zoneId]
}

type Requirement<K extends ZoneRequirementType> = Extract<ZoneRequirement, { type: K }>

/** Số quái còn đánh được trong đội thỏa điều kiện. */
const countFighters = (
  data: GameData,
  party: readonly Monster[],
  matches: (monster: Monster) => boolean
): number => party.filter((m) => !isFainted(data, m) && matches(m)).length

/** Điều kiện vào theo loại: đạt chưa (lúc vào; không kiểm lại trong lượt vào). */
export const ZONE_REQUIREMENTS: {
  [K in ZoneRequirementType]: (data: GameData, state: GameState, req: Requirement<K>) => boolean
} = {
  minFloor: (_data, state, req) => bestFloorReached(state) >= req.floor,
  partyElement: (data, state, req) =>
    countFighters(data, state.party, (m) => m.elementIds.includes(req.elementId)) >= req.count,
  partyRace: (data, state, req) =>
    countFighters(data, state.party, (m) => m.raceId === req.raceId) >= req.count,
  partyRaceGroup: (data, state, req) =>
    countFighters(data, state.party, (m) => data.races[m.raceId]?.groupId === req.raceGroupId) >=
    req.count,
  partySpecies: (data, state, req) =>
    countFighters(data, state.party, (m) => m.speciesId === req.speciesId) >= 1,
  partySpeciesLine: (data, state, req) =>
    countFighters(data, state.party, (m) =>
      evolutionLineOf(data, m.speciesId).includes(req.speciesId)
    ) >= req.count,
  item: (_data, state, req) => getItemCount(state.inventory, req.itemId) >= req.count
}

/** Điều kiện vào có đạt không (gọi luật theo đúng loại của điều kiện). */
export function isZoneRequirementMet(
  data: GameData,
  state: GameState,
  req: ZoneRequirement
): boolean {
  // Ép kiểu: bảng theo đúng loại của req (mapped type), TypeScript không tự thu hẹp theo key.
  const check = ZONE_REQUIREMENTS[req.type] as (
    data: GameData,
    state: GameState,
    req: ZoneRequirement
  ) => boolean
  return check(data, state, req)
}

/** Mọi điều kiện vào phải đạt; điều kiện đầu tiên chưa đạt báo zoneRequirementUnmet. */
export function assertZoneRequirements(data: GameData, state: GameState, zone: ZoneDef): void {
  const index = zone.requirements.findIndex((req) => !isZoneRequirementMet(data, state, req))
  if (index < 0) return
  throw new ActionError('zoneRequirementUnmet', {
    zoneId: zone.id,
    index,
    requirementType: zone.requirements[index].type
  })
}

/** Hiểm địa đang khóa (sau lượt vào trước) thì zoneClosed kèm ngày mở lại. */
export function assertZoneOpen(state: GameState, zoneId: string): void {
  const reopenDay = state.zones.reopenDay[zoneId]
  if (reopenDay !== undefined && dayOf(state.time) < reopenDay) {
    throw new ActionError('zoneClosed', { zoneId, reopenDay })
  }
}

/** Lượt vào mới: tầng sức mạnh = tầng cao nhất + floorOffset (≥ 1), số bước đều trong khoảng. */
export function rollZoneVisit(
  data: GameData,
  rng: RngState,
  { zoneId, highestFloor }: { zoneId: string; highestFloor: number }
): [ZoneVisit, RngState] {
  const config = data.config.zones
  const [steps, next] = nextInt(rng, config.steps.min, config.steps.max)
  const floor = Math.max(1, highestFloor + config.floorOffset)
  return [{ zoneId, floor, steps, stepsTaken: 0 }, next]
}

/** Tầng sức mạnh và map của lượt vào: đủ để sinh quái như một tầng thường. */
export function zoneSite(
  data: GameData,
  state: Pick<GameState, 'options' | 'time'>,
  visit: ZoneVisit
): FloorSite {
  const zone = data.zones[visit.zoneId]
  if (!zone) throw new Error(`Lượt vào hiểm địa không hợp lệ "${visit.zoneId}"`)
  return {
    floor: visit.floor,
    biome: zone.map,
    aging: state.options.lifespanEnabled,
    time: state.time
  }
}

/**
 * Lượt vào kết thúc (xong, thua, rời): hiểm địa khóa cooldownDays ngày tính từ hôm nay. Cổng thế giới
 * không khóa: tiến độ khám phá ghi lại vào cổng (cổng đã đóng thì thôi).
 */
export function closeZoneVisit(
  data: GameData,
  state: Pick<GameState, 'zones' | 'time'>
): ZoneState {
  const visit = state.zones.visit
  if (!visit) return state.zones
  if (visit.portalId !== undefined) {
    const portals = state.zones.portals.map((portal) =>
      portal.id === visit.portalId ? { ...portal, stepsTaken: visit.stepsTaken } : portal
    )
    return { ...state.zones, visit: null, portals }
  }
  const reopenDay = dayOf(state.time) + data.config.zones.cooldownDays
  return {
    ...state.zones,
    visit: null,
    reopenDay: { ...state.zones.reopenDay, [visit.zoneId]: reopenDay }
  }
}
