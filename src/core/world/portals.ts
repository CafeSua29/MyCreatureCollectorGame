// Cổng thế giới (docs/rules/zones.md mục "Cổng thế giới", theo Portal của Portals of Phereon): hiểm địa
// có thời hạn. Mỗi ngày có thể mở cổng mới từ một mẫu cổng (hiểm địa có `portal`); cổng có độ hung
// hiểm và tổ quái (mọc thêm mỗi ngày, làm quái mạnh hơn), giữ tiến độ khám phá qua các lượt vào, tới
// ngày đóng thì biến mất trừ khi được gia cố. Đóng cổng bằng cách hạ boss canh giữ: mở cổng kế tiếp
// hung hiểm hơn và cho chọn tinh chất (essences.md).

import {
  ActionError,
  nextInt,
  pick,
  rollPercent,
  spendMoney,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import {
  dayOf,
  type DayEvent,
  type GameData,
  type GameState,
  type PortalWorld,
  type ZoneState,
  type ZoneVisit
} from '../model'

/** Mẫu cổng thế giới (hiểm địa có `portal`), theo thứ tự trong zones.json. */
export const portalTemplateIds = (data: GameData): string[] =>
  Object.values(data.zones)
    .filter((zone) => zone.portal === true)
    .map((zone) => zone.id)

/** Cổng đang mở theo id; không có thì portalNotFound. */
export function requirePortal(state: GameState, portalId: string): PortalWorld {
  const portal = state.zones.portals.find((entry) => entry.id === portalId)
  if (!portal) throw new ActionError('portalNotFound', { portalId })
  return portal
}

/** Tạo một cổng mới từ mẫu ngẫu nhiên (không có mẫu nào thì giữ nguyên). */
export function spawnPortal(
  data: GameData,
  rng: RngState,
  { zones, day, hostility }: { zones: ZoneState; day: number; hostility: number }
): [ZoneState, RngState, PortalWorld | null] {
  const templates = portalTemplateIds(data)
  if (templates.length === 0) return [zones, rng, null]
  const config = data.config.zones.portals
  let zoneId: string
  ;[zoneId, rng] = pick(rng, templates)
  let steps: number
  ;[steps, rng] = nextInt(rng, config.steps.min, config.steps.max)
  const portal: PortalWorld = {
    id: `portal-${zones.nextPortalId}`,
    zoneId,
    hostility,
    steps,
    stepsTaken: 0,
    hives: config.startHives,
    closesDay: day + config.durationDays,
    stabilizations: 0
  }
  return [
    { ...zones, portals: [...zones.portals, portal], nextPortalId: zones.nextPortalId + 1 },
    rng,
    portal
  ]
}

/** Tầng sức mạnh của cổng: tầng cao nhất + floorOffset + độ hung hiểm và tổ quái (≥ 1). */
export function portalFloor(data: GameData, portal: PortalWorld, highestFloor: number): number {
  const { zones } = data.config
  const bonus =
    portal.hostility * zones.portals.floorsPerHostility + portal.hives * zones.portals.floorsPerHive
  return Math.max(1, highestFloor + zones.floorOffset + bonus)
}

/** Lượt vào một cổng: tiếp tục từ số bước đã đi của cổng. */
export function portalVisit(data: GameData, state: GameState, portal: PortalWorld): ZoneVisit {
  if (dayOf(state.time) >= portal.closesDay) {
    throw new ActionError('portalClosed', { portalId: portal.id })
  }
  return {
    zoneId: portal.zoneId,
    floor: portalFloor(data, portal, state.highestFloor),
    steps: portal.steps,
    stepsTaken: portal.stepsTaken,
    portalId: portal.id
  }
}

/** Giá gia cố một cổng lần tới: stabilizeCost × hostility × (số lần đã gia cố + 1). */
export function portalStabilizeCost(data: GameData, portal: PortalWorld): Decimal {
  const { stabilizeCost } = data.config.zones.portals
  return toBig(stabilizeCost).times(portal.hostility * (portal.stabilizations + 1))
}

/** Gia cố cổng (ngoài trận): trả tiền, cổng mở thêm stabilizeDays ngày. */
export function stabilizePortal(data: GameData, state: GameState, portalId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const portal = requirePortal(state, portalId)
  const paid = spendMoney(state, portalStabilizeCost(data, portal))
  const { stabilizeDays } = data.config.zones.portals
  const portals = state.zones.portals.map((entry) =>
    entry.id === portalId
      ? {
          ...entry,
          closesDay: entry.closesDay + stabilizeDays,
          stabilizations: entry.stabilizations + 1
        }
      : entry
  )
  return { ...paid, zones: { ...paid.zones, portals } }
}

/** Phá một tổ quái của cổng (thắng bước tổ quái). */
export function destroyPortalHive(zones: ZoneState, portalId: string): ZoneState {
  return {
    ...zones,
    portals: zones.portals.map((portal) =>
      portal.id === portalId ? { ...portal, hives: Math.max(0, portal.hives - 1) } : portal
    )
  }
}

/** Đóng cổng đã hạ boss canh giữ: bỏ cổng, mở cổng kế tiếp hung hiểm hơn một bậc. */
export function conquerPortal(
  data: GameData,
  rng: RngState,
  { zones, portalId, day }: { zones: ZoneState; portalId: string; day: number }
): [ZoneState, RngState] {
  const portal = zones.portals.find((entry) => entry.id === portalId)
  if (!portal) return [zones, rng]
  const remaining = { ...zones, portals: zones.portals.filter((entry) => entry.id !== portalId) }
  const [next, after] = spawnPortal(data, rng, {
    zones: remaining,
    day,
    hostility: portal.hostility + 1
  })
  return [next, after]
}

/**
 * Việc theo ngày (DAILY_TASKS): tổ quái mọc thêm, cổng tới ngày đóng biến mất (trừ cổng đang có lượt
 * vào: đóng khi lượt vào kết thúc ở ngày sau), rồi tung mở cổng mới khi còn dưới maxOpen.
 */
export function portalDailyTask(
  data: GameData,
  state: GameState,
  events: DayEvent[],
  day: number
): GameState {
  const config = data.config.zones.portals
  const activeId = state.zones.visit?.portalId
  const kept: PortalWorld[] = []
  for (const portal of state.zones.portals) {
    if (day >= portal.closesDay && portal.id !== activeId) {
      events.push({ type: 'portalClosed', portalId: portal.id, zoneId: portal.zoneId })
      continue
    }
    kept.push({ ...portal, hives: Math.min(config.maxHives, portal.hives + config.hivesPerDay) })
  }
  let zones: ZoneState = { ...state.zones, portals: kept }
  let rng = state.rng
  if (kept.length < config.maxOpen) {
    let opened: boolean
    ;[opened, rng] = rollPercent(rng, config.spawnChance)
    if (opened) {
      let portal: PortalWorld | null
      ;[zones, rng, portal] = spawnPortal(data, rng, { zones, day, hostility: 1 })
      if (portal) events.push({ type: 'portalOpened', portalId: portal.id, zoneId: portal.zoneId })
    }
  }
  return { ...state, rng, zones }
}
