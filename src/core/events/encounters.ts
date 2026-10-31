// Gặp và giải quyết event (docs/rules/events.md): startWildBattle / explore ở tầng (bước chuỗi đến
// hạn, event khám phá, không thì trận quái hoang), vào thị trấn (thú triều, event thị trấn), chọn
// lựa chọn của event đang chờ, kết quả sau trận event.

import { ActionError, pickWeighted, rollPercent, type RngState } from '../shared'
import {
  dayPhaseOf,
  eventModifierMultiplier,
  moonPhaseOf,
  seasonOf,
  tickModifierList
} from '../registries'
import { getItemCount, removeItems } from '../inventory'
import { floorSite, travel, type FloorSite } from '../world'
import { activateBeastTideIfDue } from '../progression'
import { partnerMultiplier } from '../tamer'
import { requireBattleStart, startWildBattle } from '../battle'
import type {
  ActiveChain,
  EventDef,
  EventGroup,
  EventLogEntry,
  EventOutcomeDef,
  EventResultDef,
  GameData,
  GameState,
  Location,
  PendingEvent
} from '../model'
import { applyResults } from './eventResults'
import type { EventContext } from './context'

/** Event của nhóm có trọng số > 0 (có thể tung được). */
const rollableEvents = (data: GameData, group: EventGroup): EventDef[] =>
  Object.values(data.events).filter((event) => event.group === group && event.weight > 0)

/** Danh sách giới hạn bỏ trống (mọi giá trị) hoặc có giá trị này. */
const allows = <T>(list: readonly T[] | undefined, value: T): boolean =>
  list === undefined || list.includes(value)

/**
 * Event có xuất hiện được ở chỗ này: đủ tầng, đúng map, đúng thời khắc / mùa / tuần trăng (nếu event
 * giới hạn; docs/rules/calendar.md).
 */
function isEventEligible(data: GameData, event: EventDef, site: FloorSite): boolean {
  if (event.minFloor > site.floor || !allows(event.biomeIds, site.biome.id)) return false
  const { time } = site
  // Ngoài lịch (tháp): chỉ event không giới hạn lịch.
  if (time === null) {
    return [event.dayPhases, event.seasons, event.moonPhases].every((list) => list === undefined)
  }
  return (
    allows(event.dayPhases, dayPhaseOf(data, time)) &&
    allows(event.seasons, seasonOf(data, time)) &&
    allows(event.moonPhases, moonPhaseOf(time))
  )
}

/** Hệ số tỉ lệ gặp event: kỹ năng đồng hành × modifier đang có. */
const eventChanceMultiplier = (data: GameData, state: GameState): number =>
  partnerMultiplier(data, state.party, 'eventChancePercent') *
  eventModifierMultiplier(data, state.events.modifiers, 'eventChancePercent')

/**
 * Tung event của nhóm: tỉ lệ `chance` % (× hệ số người chơi, kẹp 100), rồi event theo trọng số trong
 * các event xuất hiện được. Không có event nào xuất hiện được thì không tốn RNG.
 */
function rollEvent(
  data: GameData,
  state: GameState,
  { group, chance, site }: { group: EventGroup; chance: number; site: FloorSite }
): [EventDef | null, RngState] {
  const eligible = rollableEvents(data, group).filter((event) => isEventEligible(data, event, site))
  if (eligible.length === 0) return [null, state.rng]
  const [met, rng] = rollPercent(
    state.rng,
    Math.min(100, chance * eventChanceMultiplier(data, state))
  )
  if (!met) return [null, rng]
  return pickWeighted(rng, eligible, (event) => event.weight)
}

/** Bước chuỗi đến hạn ở chỗ này: hết số trận chờ, tầng ≥ tầng mở chuỗi, bước xuất hiện được. */
function dueChain(data: GameData, state: GameState, site: FloorSite): ActiveChain | undefined {
  return state.events.chains.find(
    (chain) =>
      chain.battlesLeft === 0 &&
      chain.floor <= site.floor &&
      isEventEligible(data, data.events[chain.eventId], site)
  )
}

/** Event xuất hiện: chờ người chơi chọn (mọi action khác bị chặn), log kết quả cũ được xóa. */
function presentEvent(state: GameState, pending: PendingEvent): GameState {
  return { ...state, events: { ...state.events, pending, log: [] } }
}

/**
 * Event khám phá thay cho trận (một lần gặp trên tầng: modifier theo trận bớt 1). Bước chuỗi đến
 * hạn rời danh sách chuỗi ngay lúc xuất hiện (đi tiếp bằng advanceChain).
 */
function presentFloorEvent(
  state: GameState,
  { event, floor, chain }: { event: EventDef; floor: number; chain: ActiveChain | null }
): GameState {
  const events = {
    ...state.events,
    modifiers: tickModifierList(state.events.modifiers),
    chains: state.events.chains.filter((entry) => entry !== chain)
  }
  return presentEvent(
    { ...state, events },
    { eventId: event.id, floor, chainId: chain?.chainId ?? null }
  )
}

/**
 * Gặp ở tầng (startWildBattle với tỉ lệ wildBattleChance, explore với exploreChance): bước chuỗi
 * đến hạn, không thì event khám phá theo tỉ lệ, không nữa thì trận quái hoang như startWildBattle.
 * Cửa hàng tạm cũ mất khi đi tiếp.
 */
function encounterOnFloor(data: GameData, state: GameState, chance: number): GameState {
  const site = requireBattleStart(data, state)
  const cleared = { ...state, events: { ...state.events, tempShop: null } }
  const chain = dueChain(data, cleared, site)
  if (chain) {
    const event = data.events[chain.eventId]
    return presentFloorEvent(cleared, { event, floor: site.floor, chain })
  }
  const [event, rng] = rollEvent(data, cleared, { group: 'explore', chance, site })
  const rolled = { ...cleared, rng }
  if (event) return presentFloorEvent(rolled, { event, floor: site.floor, chain: null })
  return startWildBattle(data, rolled)
}

/** Đánh quái hoang ở tầng: có wildBattleChance % gặp event khám phá thay cho trận. */
export function startWildEncounter(data: GameData, state: GameState): GameState {
  return encounterOnFloor(data, state, data.config.events.wildBattleChance)
}

/** Khám phá ở tầng (không tốn tiền): exploreChance % gặp event, còn lại trận quái hoang. */
export function explore(data: GameData, state: GameState): GameState {
  return encounterOnFloor(data, state, data.config.events.exploreChance)
}

/**
 * Đi lại kèm event: rời thị trấn thì modifier "tới khi rời thị trấn" và cửa hàng tạm mất; vào thị
 * trấn từ tầng thì thú triều đã tới ngày bắt đầu, không thì townChance % gặp event thị trấn (tung
 * sau khi cửa hàng random lại hàng).
 */
export function travelWithEvents(data: GameData, state: GameState, to: Location): GameState {
  const moved = travel(data, state, to)
  if (moved === state) return state
  const events = { ...moved.events, tempShop: null }
  if (state.location.type === 'town') {
    const modifiers = events.modifiers.filter((active) => active.battlesLeft !== null)
    return { ...moved, events: { ...events, modifiers } }
  }
  if (moved.location.type !== 'town') return { ...moved, events }
  const arrived = { ...moved, events }
  const tided = activateBeastTideIfDue(data, arrived)
  const tide = tided.events.beastTide
  if (tided !== arrived && tide?.phase === 'active') {
    const log: EventLogEntry[] = [{ type: 'beastTideArrived', waves: tide.waves }]
    return { ...tided, events: { ...tided.events, log } }
  }
  if (rollableEvents(data, 'town').length === 0) return arrived
  const site = floorSite(data, arrived, arrived.highestFloor)
  const chance = data.config.events.townChance
  const [event, rng] = rollEvent(data, arrived, { group: 'town', chance, site })
  const rolled = { ...arrived, rng }
  if (!event) return rolled
  return presentEvent(rolled, { eventId: event.id, floor: null, chainId: null })
}

/** Bối cảnh áp kết quả ở chỗ của event (tầng; thị trấn: tầng cao nhất). */
function contextFor(
  data: GameData,
  state: GameState,
  { eventId, floor, chainId, optionId }: PendingEvent & { optionId: string }
): EventContext {
  const scaleFloor = floor ?? state.highestFloor
  return {
    data,
    state,
    log: [],
    eventId,
    floor: scaleFloor,
    site: floorSite(data, state, scaleFloor),
    chainId,
    position: { optionId, outcomeIndex: 0, resultIndex: 0 }
  }
}

/** Kết quả sau trận của kết quả startBattle. */
interface BattleResultParams {
  onWin?: EventResultDef[]
  onLoss?: EventResultDef[]
}

/** Kết quả của trận event còn đang chờ áp (tra theo vị trí lúc mở trận). */
function battleResultParams(
  data: GameData,
  ref: NonNullable<GameState['events']['battle']>
): BattleResultParams {
  const option = data.events[ref.eventId].options.find((entry) => entry.id === ref.optionId)
  const result = option?.outcomes[ref.outcomeIndex]?.results[ref.resultIndex]
  // Ép kiểu: params của startBattle đã kiểm tra ở validateEvents.
  return (result?.params ?? {}) as BattleResultParams
}

/**
 * Chọn lựa chọn của event đang chờ: trả vật phẩm của lựa chọn, tung một kết quả theo trọng số rồi
 * áp lần lượt (có thể mở trận). Event hết chờ ngay, log kết quả thay bằng của lần này.
 */
export function chooseEventOption(data: GameData, state: GameState, optionId: unknown): GameState {
  const pending = state.events.pending
  if (!pending) throw new ActionError('noPendingEvent')
  const event = data.events[pending.eventId]
  const option = event.options.find((entry) => entry.id === optionId)
  if (!option) {
    throw new ActionError('eventOptionUnknown', {
      eventId: event.id,
      optionId: String(optionId)
    })
  }
  let inventory = state.inventory
  for (const { itemId, count } of option.costItems ?? []) {
    const have = getItemCount(inventory, itemId)
    if (have < count) throw new ActionError('notEnoughItem', { itemId, have, need: count })
    inventory = removeItems(inventory, itemId, count)
  }
  const base = { ...state, inventory, events: { ...state.events, pending: null } }
  const [outcome, rng] = pickWeighted(base.rng, option.outcomes, (entry) => entry.weight)
  const ctx = contextFor(data, { ...base, rng }, { ...pending, optionId: option.id })
  ctx.position = { ...ctx.position, outcomeIndex: option.outcomes.indexOf(outcome) }
  ctx.log.push({ type: 'eventResolved', eventId: event.id, optionId: option.id })
  for (const { itemId, count } of option.costItems ?? []) {
    ctx.log.push({ type: 'itemSpent', itemId, count })
  }
  applyOutcome(ctx, outcome)
  return { ...ctx.state, events: { ...ctx.state.events, log: ctx.log } }
}

/** Áp một kết quả của lựa chọn; bước chuỗi không đi tiếp (và không mở trận) thì chuỗi kết thúc. */
function applyOutcome(ctx: EventContext, outcome: EventOutcomeDef): void {
  applyResults(ctx, outcome.results)
  const { chainId } = ctx
  if (chainId === null) return
  const continues =
    ctx.state.events.chains.some((chain) => chain.chainId === chainId) ||
    ctx.state.events.battle !== null
  if (!continues) ctx.log.push({ type: 'chainEnded', chainId })
}

/**
 * Sau trận event (lúc rời trận): thắng áp onWin, thua / chạy áp onLoss của kết quả startBattle;
 * bước chuỗi không đi tiếp thì chuỗi kết thúc. Trận khác: giữ nguyên.
 */
export function settleEventBattle(data: GameData, before: GameState, after: GameState): GameState {
  const ref = after.events.battle
  if (!ref || before.battle?.special?.kind !== 'event') return after
  const params = battleResultParams(data, ref)
  const won = before.battle.outcome === 'won'
  const ctx = contextFor(
    data,
    { ...after, events: { ...after.events, battle: null } },
    {
      eventId: ref.eventId,
      floor: before.battle.floor,
      chainId: ref.chainId,
      optionId: ref.optionId
    }
  )
  applyOutcome(ctx, { weight: 1, results: (won ? params.onWin : params.onLoss) ?? [] })
  return { ...ctx.state, events: { ...ctx.state.events, log: ctx.log } }
}
