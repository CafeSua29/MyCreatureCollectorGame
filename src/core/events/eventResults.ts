// Áp kết quả event (docs/rules/events.md): mỗi loại kết quả một hàm (EVENT_RESULT_APPLIERS, cùng
// khóa với EVENT_RESULT_CHECKS ở gameData/validateEvents.ts). Thêm loại kết quả = thêm id vào
// EVENT_RESULT_TYPES + một hàm kiểm tra + một hàm áp. Phần thưởng scale theo tầng của bối cảnh.

import { hasBagRoom, hasPartyRoom, hasRosterRoom } from '../registries'
import {
  addEquipment,
  addItems,
  equipmentInstanceId,
  isItemOffered,
  rollEquipment,
  rollRarity
} from '../inventory'
import {
  conflictingStatus,
  isFainted,
  isStatusImmune,
  markLogEntries,
  noteMarkChanges,
  rollPartMarkGain,
  type MarkResult,
  rollStatusDuration,
  startHistory,
  withStatus
} from '../monster'
import { createBiomeBossEgg, createSpeciesEgg, type EggSite } from '../progression'
import { BIG_ZERO, nextInt, pickWeighted, toBig, type RngState } from '../shared'
import { floorLevelRange, generateWildMonster } from '../world'
import { openEventBattle, type EventBattleKind } from '../battle'
import {
  dayOf,
  type EventLootItem,
  type Egg,
  type EncounterEntry,
  type EventResultDef,
  type EventResultType,
  type Monster,
  type NormalRarity,
  type TempShopPool,
  type WeightedItem
} from '../model'
import { logResult, updateEvents, type EventContext } from './context'
import { TEMP_SHOP_ROLLERS } from './tempShops'

type Params = Record<string, unknown>
type Applier = (ctx: EventContext, params: Params) => void

/** Chỗ nhận trứng của bối cảnh. */
const eggSite = (ctx: EventContext): EggSite => ({
  biome: ctx.site.biome,
  floor: ctx.floor,
  aging: ctx.state.options.lifespanEnabled,
  day: dayOf(ctx.state.time)
})

/** Quái mới về tay người chơi vào đội (còn chỗ) hoặc kho. */
function addOwnedMonster(ctx: EventContext, monster: Monster): 'party' | 'storage' {
  const { state, data } = ctx
  if (hasPartyRoom(data, state.party, monster)) {
    ctx.state = { ...state, party: [...state.party, monster] }
    return 'party'
  }
  ctx.state = { ...state, storage: [...state.storage, monster] }
  return 'storage'
}

const giveItems: Applier = (ctx, params) => {
  const { items, rolls } = params as { items: EventLootItem[]; rolls: number }
  const entries = items.filter(
    (entry) => entry.weight > 0 && isItemOffered(ctx.data.items[entry.itemId], ctx.state.options)
  )
  if (entries.length === 0) return
  let { rng, inventory } = ctx.state
  for (let i = 0; i < rolls; i++) {
    let entry: EventLootItem
    ;[entry, rng] = pickWeighted(rng, entries, (candidate) => candidate.weight)
    let count: number
    ;[count, rng] = nextInt(rng, entry.min, entry.max)
    inventory = addItems(inventory, entry.itemId, count)
    logResult(ctx, { type: 'itemGained', itemId: entry.itemId, count })
  }
  ctx.state = { ...ctx.state, rng, inventory }
}

const giveMoney: Applier = (ctx, params) => {
  const { battles } = params as { battles: number }
  const unit = toBig(ctx.data.config.rewards.moneyPerLevel).times(
    floorLevelRange(ctx.data, ctx.floor).max
  )
  const amount = unit.times(battles).floor()
  ctx.state = { ...ctx.state, money: ctx.state.money.plus(amount) }
  logResult(ctx, { type: 'moneyGained', amount })
}

const loseMoneyPercent: Applier = (ctx, params) => {
  const { percent } = params as { percent: number }
  const amount = ctx.state.money.times(percent).div(100).floor()
  ctx.state = { ...ctx.state, money: ctx.state.money.minus(amount) }
  logResult(ctx, { type: 'moneyLost', amount })
}

/** Trang bị theo danh sách rơi của map, bậc theo bảng (có hệ số tầng). */
const giveEquipment: Applier = (ctx, params) => {
  const { count, rarityWeights } = params as {
    count: number
    rarityWeights: Partial<Record<NormalRarity, number>>
  }
  const candidates = (ctx.site.biome.equipmentDrops ?? []).filter((entry) => entry.weight > 0)
  if (candidates.length === 0) return
  let { rng, inventory, nextItemId } = ctx.state
  for (let i = 0; i < count; i++) {
    let entry: WeightedItem
    ;[entry, rng] = pickWeighted(rng, candidates, (candidate) => candidate.weight)
    let rarity: NormalRarity
    ;[rarity, rng] = rollRarity(ctx.data, rng, rarityWeights, ctx.floor)
    const id = equipmentInstanceId(nextItemId++)
    const [instance, next] = rollEquipment(ctx.data, rng, { itemId: entry.itemId, rarity, id })
    rng = next
    // Túi trang bị đầy: món mất, ghi log (docs/rules/capacity.md).
    if (!hasBagRoom(ctx.data, { ...ctx.state, inventory })) {
      logResult(ctx, { type: 'equipmentLost', itemId: entry.itemId, rarity })
      continue
    }
    inventory = addEquipment(inventory, instance)
    logResult(ctx, { type: 'equipmentGained', instanceId: id, itemId: entry.itemId, rarity })
  }
  ctx.state = { ...ctx.state, rng, inventory, nextItemId }
}

/**
 * Trứng: `wild` = loài theo bảng gặp của map (dạng đầu tiên), `boss` = một boss của map (map không
 * có boss thì không có trứng).
 */
const giveEgg: Applier = (ctx, params) => {
  const { source } = params as { source: 'wild' | 'boss' }
  const options = {
    ...eggSite(ctx),
    id: `m${ctx.state.nextMonsterId}`,
    origin: { kind: 'event' as const, eventId: ctx.eventId }
  }
  let egg: Egg | null
  let rng: RngState
  if (source === 'boss') [egg, rng] = createBiomeBossEgg(ctx.data, ctx.state.rng, options)
  else {
    let encounter: EncounterEntry
    ;[encounter, rng] = pickWeighted(ctx.state.rng, ctx.site.biome.encounters, (e) => e.weight)
    ;[egg, rng] = createSpeciesEgg(ctx.data, rng, { ...options, speciesId: encounter.speciesId })
  }
  ctx.state = { ...ctx.state, rng }
  if (!egg) return
  ctx.state = {
    ...ctx.state,
    eggs: [...ctx.state.eggs, egg],
    nextMonsterId: ctx.state.nextMonsterId + 1
  }
  logResult(ctx, { type: 'eggGained', eggId: egg.id })
}

/** Một quái hoang thường của map đi theo người chơi (chưa khế ước, thân mật như quái bắt được). */
const giveMonster: Applier = (ctx) => {
  const { data, state } = ctx
  // Quà không phải quái địch: theo Randomizer, không theo độ khó (docs/rules/challenge-modes.md).
  const { difficulty: _difficulty, ...site } = ctx.site
  const [wild, rng] = generateWildMonster(data, state.rng, site, `m${state.nextMonsterId}`)
  const monster = startHistory(
    { ...wild, affinity: data.config.affinity.start.caught },
    { kind: 'event', eventId: ctx.eventId },
    {
      day: dayOf(state.time),
      floor: ctx.state.location.type === 'floor' ? ctx.floor : null,
      level: wild.level
    }
  )
  ctx.state = { ...state, rng, nextMonsterId: state.nextMonsterId + 1 }
  // Đội đủ và kho đầy: không nhận được, ghi log (docs/rules/capacity.md).
  if (!hasRosterRoom(data, ctx.state, { newcomer: monster })) {
    logResult(ctx, { type: 'monsterRefused', speciesId: monster.speciesId })
    return
  }
  const destination = addOwnedMonster(ctx, monster)
  logResult(ctx, { type: 'monsterJoined', monsterId: monster.id, destination })
}

const healParty: Applier = (ctx) => {
  const party = ctx.state.party.map((monster) => ({
    ...monster,
    damageTaken: BIG_ZERO,
    statuses: []
  }))
  ctx.state = { ...ctx.state, party }
  logResult(ctx, { type: 'partyHealed' })
}

/** `count` quái còn sống đầu đội dính trạng thái (miễn / đang có trạng thái cùng nhóm thì không). */
const applyStatus: Applier = (ctx, params) => {
  const { statusId, count } = params as { statusId: string; count: number }
  const { data } = ctx
  let { rng } = ctx.state
  let left = count
  const party = ctx.state.party.map((monster) => {
    if (left <= 0 || isFainted(data, monster)) return monster
    left--
    if (isStatusImmune(data, monster, statusId) || conflictingStatus(data, monster, statusId)) {
      logResult(ctx, { type: 'statusImmune', monsterId: monster.id, statusId })
      return monster
    }
    let turns: number | null
    ;[turns, rng] = rollStatusDuration(data, rng, statusId)
    logResult(ctx, { type: 'statusApplied', monsterId: monster.id, statusId })
    return { ...monster, statuses: withStatus(monster.statuses, statusId, turns) }
  })
  ctx.state = { ...ctx.state, rng, party }
}

/**
 * Mỗi quái còn sống trong `count` quái đầu đội tung `chance` % một đột biến ngẫu nhiên (ăn / uống
 * thứ lạ như Mewgenics; docs/rules/marks.md); log và lý lịch.
 */
const mutateParty: Applier = (ctx, params) => {
  const { count, chance } = params as { count: number; chance: number }
  const { data } = ctx
  let { rng } = ctx.state
  let left = count
  const day = dayOf(ctx.state.time)
  const origin = { source: 'event', floor: ctx.floor >= 1 ? ctx.floor : null } as const
  const party = ctx.state.party.map((monster) => {
    if (left <= 0 || isFainted(data, monster)) return monster
    left--
    let result: MarkResult
    ;[result, rng] = rollPartMarkGain(data, rng, { monster, kind: 'mutation', chance, origin })
    for (const entry of markLogEntries(monster.id, result.changes)) logResult(ctx, entry)
    return noteMarkChanges(data, result.monster, result.changes, day)
  })
  ctx.state = { ...ctx.state, rng, party }
}

/** Thêm modifier; đang có thì làm mới thời hạn. */
const addModifier: Applier = (ctx, params) => {
  const { modifierId } = params as { modifierId: string }
  const { duration } = ctx.data.eventModifiers[modifierId]
  const battlesLeft = duration.kind === 'battles' ? duration.count : null
  const others = ctx.state.events.modifiers.filter((active) => active.modifierId !== modifierId)
  updateEvents(ctx, { modifiers: [...others, { modifierId, battlesLeft }] })
  logResult(ctx, { type: 'modifierAdded', modifierId, battlesLeft })
}

const openTempShop: Applier = (ctx, params) => {
  const { pool, priceMultiplier, ...rest } = params as {
    pool: TempShopPool
    priceMultiplier: number
  } & Params
  const rolled = TEMP_SHOP_ROLLERS[pool]({
    data: ctx.data,
    state: ctx.state,
    rng: ctx.state.rng,
    nextItemId: ctx.state.nextItemId,
    floor: ctx.floor,
    params: rest
  })
  const floor = ctx.state.location.type === 'floor' ? ctx.state.location.floor : null
  ctx.state = { ...ctx.state, rng: rolled.rng, nextItemId: rolled.nextItemId }
  updateEvents(ctx, { tempShop: { stock: rolled.stock, priceMultiplier, floor } })
  logResult(ctx, { type: 'tempShopOpened', entries: rolled.stock.length })
}

/** Mở chuỗi (đang chạy chuỗi đó thì không mở lại); đếm trận thắng ở tầng ≥ tầng hiện tại. */
const startChain: Applier = (ctx, params) => {
  const { chainId, eventId, battles } = params as {
    chainId: string
    eventId: string
    battles: number
  }
  if (ctx.state.events.chains.some((chain) => chain.chainId === chainId)) return
  const chain = { chainId, eventId, battlesLeft: battles, floor: ctx.floor }
  updateEvents(ctx, { chains: [...ctx.state.events.chains, chain] })
  logResult(ctx, { type: 'chainStarted', chainId, eventId, battlesLeft: battles })
}

/** Chuỗi của event đi tiếp tới bước `eventId` (bước hiện tại đã rời danh sách lúc xuất hiện). */
const advanceChain: Applier = (ctx, params) => {
  const { eventId, battles } = params as { eventId: string; battles: number }
  const { chainId } = ctx
  if (chainId === null) return
  const chain = { chainId, eventId, battlesLeft: battles, floor: ctx.floor }
  updateEvents(ctx, { chains: [...ctx.state.events.chains, chain] })
  logResult(ctx, { type: 'chainAdvanced', chainId, eventId, battlesLeft: battles })
}

/**
 * Mở trận event (kết quả cuối của lựa chọn). Không còn quái đánh được thì coi như thua: áp kết quả
 * onLoss, không mở trận.
 */
const startBattle: Applier = (ctx, params) => {
  const spec = params as {
    kind: EventBattleKind
    count?: number
    strength?: number
    enemyHpPercent?: number
    levelOffset?: number
    noFlee: boolean
    moneyMultiplier?: number
    onLoss?: EventResultDef[]
  }
  if (!ctx.state.party.some((monster) => !isFainted(ctx.data, monster))) {
    applyResults(ctx, spec.onLoss ?? [])
    return
  }
  updateEvents(ctx, {
    battle: { eventId: ctx.eventId, chainId: ctx.chainId, ...ctx.position }
  })
  ctx.state = openEventBattle(ctx.data, ctx.state, {
    site: ctx.site,
    kind: spec.kind,
    count: spec.count ?? 1,
    strength: spec.strength ?? 1,
    enemyHpPercent: spec.enemyHpPercent ?? 100,
    levelOffset: spec.levelOffset ?? 0,
    special: {
      kind: 'event',
      eventId: ctx.eventId,
      noFlee: spec.noFlee,
      moneyMultiplier: spec.moneyMultiplier ?? 1
    }
  })
  logResult(ctx, { type: 'battleStarted' })
}

export const EVENT_RESULT_APPLIERS: Readonly<Record<EventResultType, Applier>> = {
  giveItems,
  giveMoney,
  loseMoneyPercent,
  giveEquipment,
  giveEgg,
  giveMonster,
  healParty,
  applyStatus,
  mutateParty,
  addModifier,
  openTempShop,
  startChain,
  advanceChain,
  startBattle
}

/** Áp lần lượt các kết quả (vị trí ghi vào ctx.position để trận event tra lại sau trận). */
export function applyResults(ctx: EventContext, results: readonly EventResultDef[]): void {
  results.forEach((result, resultIndex) => {
    ctx.position = { ...ctx.position, resultIndex }
    EVENT_RESULT_APPLIERS[result.type](ctx, result.params)
  })
}
