// Đấu giá hành ở thị trấn (docs/rules/auction.md): mỗi phiên vài lô hiếm (registry AUCTION_LOTS),
// người chơi đặt giá kín cạnh tranh với giá trần NPC ẩn, tiền bị giữ tới khi phiên đóng; ký gửi đồ
// để NPC mua. Phiên đóng / mở ở việc theo ngày `auction`.

import {
  addByRef,
  addEquipment,
  assertCanLeaveBag,
  equipmentInstanceId,
  isSkillBookUsefulForParty,
  itemBasePrice,
  itemSellPrice,
  parseItemRef,
  removeByRef,
  requireItemCount,
  rollEquipment,
  rollRarity,
  takeEquipment,
  uniquePoolOf
} from '../inventory'
import {
  assertBagRoom,
  bagFreeSlots,
  hasBagRoom,
  speciesRankIndex,
  speciesRankOf
} from '../registries'
import {
  addMarketSale,
  blackMarketSkillIds,
  marketSellTotal,
  normalEquipmentItems,
  offeredBlackMarketItems
} from '../shop'
import { assertNoTournament } from '../world'
import {
  ActionError,
  isValidBig,
  nextInt,
  pick,
  pickWeighted,
  rollPercent,
  spendMoney,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import {
  AUCTION_LOT_KINDS,
  dayOf,
  type AuctionConsignment,
  type AuctionGood,
  type AuctionLot,
  type AuctionLotKind,
  type AuctionReceived,
  type AuctionState,
  type DayEvent,
  type Egg,
  type EquipmentItem,
  type GameData,
  type GameState,
  type ItemEntry,
  type ItemRef,
  type NormalRarity
} from '../model'
import { createSpeciesEgg } from './eggs'

/** Chưa có phiên nào: phiên đầu mở ở lần qua ngày đầu tiên (game mới / test). */
export const newAuctionState = (): AuctionState => ({
  lots: [],
  closeDay: 0,
  consignments: [],
  held: [],
  nextId: 1
})

const auctionId = (n: number): string => `a${n}`

/** Bản nháp khi tung lô: RNG và bộ đếm id món / quái (chỉ sống trong một lần mở phiên). */
interface LotDraft {
  rng: RngState
  nextItemId: number
  nextMonsterId: number
}

interface AuctionLotHandler {
  /** Có hàng để ra không (loại không có hàng thì không tung, không tốn RNG). */
  isAvailable(data: GameData, state: GameState): boolean
  /** Tung thứ bán trong lô (chỉ gọi khi isAvailable); cập nhật bản nháp. */
  roll(data: GameData, state: GameState, draft: LotDraft): AuctionGood
}

/** Món unique theo loài boss: tính một lần cho mỗi bộ dữ liệu (Dex có thể rất dài). */
const uniqueBySpeciesCache = new WeakMap<GameData, ReadonlyMap<string, EquipmentItem[]>>()

function uniqueBySpecies(data: GameData): ReadonlyMap<string, EquipmentItem[]> {
  const cached = uniqueBySpeciesCache.get(data)
  if (cached) return cached
  const map = new Map<string, EquipmentItem[]>()
  for (const item of Object.values(data.items)) {
    const bossSpeciesId = item.category === 'equipment' ? item.unique?.bossSpeciesId : undefined
    if (bossSpeciesId && !map.has(bossSpeciesId)) {
      map.set(bossSpeciesId, uniquePoolOf(data, bossSpeciesId))
    }
  }
  uniqueBySpeciesCache.set(data, map)
  return map
}

/** Món unique của các loài boss đã gặp (Dex). */
function seenUniqueItems(data: GameData, state: GameState): EquipmentItem[] {
  const bySpecies = uniqueBySpecies(data)
  return state.dex.seen.flatMap((speciesId) => bySpecies.get(speciesId) ?? [])
}

/** Loài trứng: mọi loài trong bảng gặp của các map đã mở, trọng số theo catchRate. */
function eggSpeciesPool(data: GameData, state: GameState): { speciesId: string; weight: number }[] {
  const power = data.config.auction.eggCatchRatePower
  const weights = new Map<string, number>()
  for (const biomeId of new Set(state.floorBiomeIds)) {
    for (const encounter of data.biomes[biomeId]?.encounters ?? []) {
      const species = data.species[encounter.speciesId]
      if (species?.kind !== 'normal' || weights.has(species.id)) continue
      // catchRate 0 với số mũ âm ra vô hạn: kẹp tối thiểu 1.
      weights.set(species.id, Math.max(1, species.catchRate) ** power)
    }
  }
  return [...weights].flatMap(([speciesId, weight]) => (weight > 0 ? [{ speciesId, weight }] : []))
}

function rollEquipmentGood(
  data: GameData,
  draft: LotDraft,
  {
    item,
    rarity,
    minRollPercent
  }: { item: EquipmentItem; rarity: NormalRarity | 'unique'; minRollPercent: number }
): AuctionGood {
  const [instance, rng] = rollEquipment(data, draft.rng, {
    itemId: item.id,
    rarity,
    id: equipmentInstanceId(draft.nextItemId++),
    minRollPercent
  })
  draft.rng = rng
  return { kind: 'item', entry: { storage: 'instance', instance }, count: 1 }
}

export const AUCTION_LOTS: Readonly<Record<AuctionLotKind, AuctionLotHandler>> = {
  // Trang bị thường bậc cao (bảng bậc riêng, hệ số tầng như đồ rơi), dòng ở phần trên của khoảng.
  equipment: {
    isAvailable: (data) => normalEquipmentItems(data).length > 0,
    roll(data, state, draft) {
      const config = data.config.auction
      let item: EquipmentItem
      ;[item, draft.rng] = pick(draft.rng, normalEquipmentItems(data))
      let rarity: NormalRarity
      ;[rarity, draft.rng] = rollRarity(
        data,
        draft.rng,
        config.equipmentRarityWeights,
        state.highestFloor
      )
      return rollEquipmentGood(data, draft, {
        item,
        rarity,
        minRollPercent: config.equipmentMinRollPercent
      })
    }
  },
  // Trang bị unique của boss đã gặp.
  unique: {
    isAvailable: (data, state) => seenUniqueItems(data, state).length > 0,
    roll(data, state, draft) {
      let item: EquipmentItem
      ;[item, draft.rng] = pick(draft.rng, seenUniqueItems(data, state))
      return rollEquipmentGood(data, draft, {
        item,
        rarity: 'unique',
        minRollPercent: data.config.auction.equipmentMinRollPercent
      })
    }
  },
  // Trứng loài khó bắt của map đã mở, như trứng thám hiểm (gen theo tầng cao nhất).
  egg: {
    isAvailable: (data, state) => eggSpeciesPool(data, state).length > 0,
    roll(data, state, draft) {
      let entry: { speciesId: string; weight: number }
      ;[entry, draft.rng] = pickWeighted(draft.rng, eggSpeciesPool(data, state), (e) => e.weight)
      let egg: Egg
      ;[egg, draft.rng] = createSpeciesEgg(data, draft.rng, {
        speciesId: entry.speciesId,
        id: `m${draft.nextMonsterId++}`,
        origin: { kind: 'auction' },
        floor: state.highestFloor,
        aging: state.options.lifespanEnabled,
        day: dayOf(state.time)
      })
      return { kind: 'egg', egg }
    }
  },
  // Sách skill mạnh như chợ đen (sách quái trong đội dùng được hay ra hơn), có tỉ lệ Chân kinh.
  book: {
    isAvailable: (data) => blackMarketSkillIds(data).length > 0,
    roll(data, state, draft) {
      const { partyMultiplier } = data.config.skillBook
      const weightOf = (id: string): number =>
        isSkillBookUsefulForParty(data, state.party, id) ? partyMultiplier : 1
      let skillId: string
      ;[skillId, draft.rng] = pickWeighted(draft.rng, blackMarketSkillIds(data), weightOf)
      let reusable: boolean
      ;[reusable, draft.rng] = rollPercent(draft.rng, data.config.auction.bookReusableChance)
      return { kind: 'item', entry: { storage: 'book', skillId, reusable }, count: 1 }
    }
  },
  // Vật phẩm hiếm như hàng chợ đen (trọng số theo giá), vài cái.
  item: {
    isAvailable: (data, state) => offeredBlackMarketItems(data, state).length > 0,
    roll(data, state, draft) {
      const { min, max } = data.config.auction.itemCount
      let offer: { itemId: string; weight: number }
      ;[offer, draft.rng] = pickWeighted(
        draft.rng,
        offeredBlackMarketItems(data, state),
        (entry) => entry.weight
      )
      let count: number
      ;[count, draft.rng] = nextInt(draft.rng, min, max)
      return { kind: 'item', entry: { storage: 'stack', itemId: offer.itemId }, count }
    }
  }
}

/**
 * Giá trị một lô ở tầng cao nhất: item = giá gốc × số cái; trứng = eggValuePerFloor × tầng × hệ số
 * phẩm cấp của loài trong trứng.
 */
export function auctionGoodValue(data: GameData, state: GameState, good: AuctionGood): Decimal {
  if (good.kind === 'item') {
    return itemBasePrice(data, good.entry, state.highestFloor).times(good.count)
  }
  const config = data.config.auction
  const species = data.species[good.egg.monster.speciesId]
  const multipliers = config.eggRankMultipliers
  const rank =
    species?.kind === 'normal' ? speciesRankIndex(data, speciesRankOf(data, species).id) : 0
  const multiplier = multipliers[Math.min(Math.max(0, rank), multipliers.length - 1)] ?? 1
  return toBig(config.eggValuePerFloor).times(state.highestFloor).times(multiplier).floor()
}

/** Giá ít nhất 1 (lô không bao giờ miễn phí). */
const atLeastOne = (price: Decimal): Decimal => (price.lt(1) ? toBig(1) : price)

/** Tung một lô: loại theo lotWeights trong các loại có hàng; giá khởi điểm, giá trần NPC. */
function rollLot(data: GameData, state: GameState, draft: LotDraft, id: string): AuctionLot | null {
  const config = data.config.auction
  const kinds = AUCTION_LOT_KINDS.filter(
    (kind) => config.lotWeights[kind] > 0 && AUCTION_LOTS[kind].isAvailable(data, state)
  )
  if (kinds.length === 0) return null
  let kind: AuctionLotKind
  ;[kind, draft.rng] = pickWeighted(draft.rng, kinds, (k) => config.lotWeights[k])
  const good = AUCTION_LOTS[kind].roll(data, state, draft)
  const value = auctionGoodValue(data, state, good)
  const startPrice = atLeastOne(value.times(config.startPercent).div(100).floor())
  let percent: number
  ;[percent, draft.rng] = nextInt(draft.rng, config.npcMinPercent, config.npcMaxPercent)
  const npcPrice = startPrice.times(percent).div(100).floor()
  return { id, kind, good, startPrice, npcPrice, bid: null }
}

/** Mở phiên mới tới ngày `day` + sessionDays: số lô trong lotCount. */
export function openAuctionSession(data: GameData, state: GameState, day: number): GameState {
  const config = data.config.auction
  const [count, rng] = nextInt(state.rng, config.lotCount.min, config.lotCount.max)
  const draft: LotDraft = { rng, nextItemId: state.nextItemId, nextMonsterId: state.nextMonsterId }
  let { nextId } = state.auction
  const lots: AuctionLot[] = []
  for (let i = 0; i < count; i++) {
    const lot = rollLot(data, state, draft, auctionId(nextId))
    if (!lot) break
    nextId++
    lots.push(lot)
  }
  return {
    ...state,
    rng: draft.rng,
    nextItemId: draft.nextItemId,
    nextMonsterId: draft.nextMonsterId,
    auction: { ...state.auction, lots, closeDay: day + config.sessionDays, nextId }
  }
}

/** Món về túi; món trang bị mà túi đầy thì giữ hộ ở đấu giá hành. */
function deliverEntry(
  data: GameData,
  state: GameState,
  { entry, count }: { entry: ItemEntry; count: number }
): [GameState, AuctionReceived] {
  if (entry.storage !== 'instance') {
    const received: AuctionReceived = { kind: 'item', item: entry, count, held: false }
    return [{ ...state, inventory: addByRef(state.inventory, entry, count) }, received]
  }
  const item: ItemRef = { storage: 'instance', instanceId: entry.instance.id }
  if (hasBagRoom(data, state)) {
    const inventory = addEquipment(state.inventory, entry.instance)
    return [
      { ...state, inventory },
      { kind: 'item', item, count: 1, held: false }
    ]
  }
  const auction = { ...state.auction, held: [...state.auction.held, entry.instance] }
  return [
    { ...state, auction },
    { kind: 'item', item, count: 1, held: true }
  ]
}

function deliverGood(
  data: GameData,
  state: GameState,
  good: AuctionGood
): [GameState, AuctionReceived] {
  if (good.kind === 'egg') {
    return [
      { ...state, eggs: [...state.eggs, good.egg] },
      { kind: 'egg', eggId: good.egg.id }
    ]
  }
  return deliverEntry(data, state, good)
}

/** Thắng lô khi giá đặt ≥ giá trần NPC (trả đúng giá đã đặt); thua thì hoàn tiền. */
function settleLot(
  data: GameData,
  state: GameState,
  lot: AuctionLot,
  events: DayEvent[]
): GameState {
  if (!lot.bid) return state
  if (lot.bid.lt(lot.npcPrice)) {
    events.push({ type: 'auctionLost', lotId: lot.id, npcPrice: lot.npcPrice })
    return { ...state, money: state.money.plus(lot.bid) }
  }
  const [next, received] = deliverGood(data, state, lot.good)
  events.push({ type: 'auctionWon', lotId: lot.id, price: lot.bid, received })
  return next
}

/** Giá bán ở cửa hàng lúc này (item gộp được theo giá thị trường động) của đồ ký gửi. */
function consignmentShopValue(
  data: GameData,
  state: GameState,
  consignment: AuctionConsignment
): Decimal {
  const { entry, count } = consignment
  return entry.storage === 'instance'
    ? itemSellPrice(data, entry, state.highestFloor)
    : marketSellTotal(data, state, entry, count)
}

const entryRef = (entry: ItemEntry): ItemRef =>
  entry.storage === 'instance' ? { storage: 'instance', instanceId: entry.instance.id } : entry

/**
 * Đồ ký gửi: NPC trả giá bán ở cửa hàng × % trong [consignMinPercent, consignMaxPercent]; ≥ giá sàn
 * (và > 0) thì bán, nhận tiền trừ phí feePercent, tính vào độ bão hòa thị trường như bán ở cửa hàng;
 * không thì trả đồ về.
 */
function settleConsignment(
  data: GameData,
  state: GameState,
  consignment: AuctionConsignment,
  events: DayEvent[]
): GameState {
  const config = data.config.auction
  const [percent, rng] = nextInt(state.rng, config.consignMinPercent, config.consignMaxPercent)
  const npcPrice = consignmentShopValue(data, state, consignment).times(percent).div(100).floor()
  const { id: consignmentId, entry, count } = consignment
  if (npcPrice.gt(0) && npcPrice.gte(consignment.reservePrice)) {
    const earned = npcPrice
      .times(100 - config.feePercent)
      .div(100)
      .floor()
    const sold = entry.storage === 'instance' ? state : addMarketSale(state, entry, count)
    events.push({ type: 'consignmentSold', consignmentId, item: entryRef(entry), count, earned })
    return { ...sold, rng, money: state.money.plus(earned) }
  }
  const [next, received] = deliverEntry(data, { ...state, rng }, consignment)
  events.push({ type: 'consignmentReturned', consignmentId, npcPrice, received })
  return next
}

/** Đóng phiên: xử lý lô đã đặt giá rồi đồ ký gửi theo thứ tự; phiên trống. */
export function closeAuctionSession(
  data: GameData,
  state: GameState,
  events: DayEvent[]
): GameState {
  const { lots, consignments } = state.auction
  let next: GameState = { ...state, auction: { ...state.auction, lots: [], consignments: [] } }
  for (const lot of lots) next = settleLot(data, next, lot, events)
  for (const consignment of consignments) next = settleConsignment(data, next, consignment, events)
  return next
}

/** Việc theo ngày (DAILY_TASKS): tới ngày đóng thì đóng phiên cũ, mở phiên mới. */
export function auctionDailyTask(
  data: GameData,
  state: GameState,
  events: DayEvent[],
  day: number
): GameState {
  if (day < state.auction.closeDay) return state
  return openAuctionSession(data, closeAuctionSession(data, state, events), day)
}

/** Đấu giá hành: ngoài trận, ở thị trấn, không đang giải đấu / tông chiến. */
function requireAuctionHouse(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  assertNoTournament(state)
}

function findLot(state: GameState, lotId: string): AuctionLot {
  const lot = state.auction.lots.find((entry) => entry.id === lotId)
  if (!lot) throw new ActionError('auctionLotNotFound', { lotId: String(lotId) })
  return lot
}

const replaceLot = (state: GameState, lot: AuctionLot): GameState => ({
  ...state,
  auction: {
    ...state.auction,
    lots: state.auction.lots.map((entry) => (entry.id === lot.id ? lot : entry))
  }
})

/**
 * Đặt giá kín cho lô (hoặc đổi giá đã đặt): số nguyên ≥ giá khởi điểm; giá cũ hoàn lại trước, giá mới
 * bị giữ (trừ khỏi tiền) tới khi phiên đóng.
 */
export function placeAuctionBid(
  _data: GameData,
  state: GameState,
  { lotId, amount }: { lotId: string; amount: unknown }
): GameState {
  requireAuctionHouse(state)
  const lot = findLot(state, lotId)
  if (!isValidBig(amount) || !amount.isInteger() || amount.lt(lot.startPrice)) {
    throw new ActionError('auctionBidTooLow', { lotId, minimum: lot.startPrice })
  }
  const refunded = lot.bid ? { ...state, money: state.money.plus(lot.bid) } : state
  return replaceLot(spendMoney(refunded, amount), { ...lot, bid: amount })
}

/** Rút giá đã đặt: hoàn tiền. */
export function cancelAuctionBid(state: GameState, lotId: string): GameState {
  requireAuctionHouse(state)
  const lot = findLot(state, lotId)
  if (!lot.bid) throw new ActionError('auctionNoBid', { lotId })
  return replaceLot({ ...state, money: state.money.plus(lot.bid) }, { ...lot, bid: null })
}

/**
 * Ký gửi count món trong túi (rời được túi) với giá sàn nguyên ≥ 0: đồ rời túi tới khi phiên đang mở
 * đóng.
 */
export function consignItem(
  data: GameData,
  state: GameState,
  { item, count, reservePrice }: { item: unknown; count: unknown; reservePrice: unknown }
): GameState {
  requireAuctionHouse(state)
  const ref = parseItemRef(data, item)
  assertCanLeaveBag(data, ref)
  requireItemCount(count)
  if (!isValidBig(reservePrice) || !reservePrice.isInteger() || reservePrice.lt(0)) {
    throw new ActionError('auctionInvalidReserve')
  }
  const inventory = removeByRef(state.inventory, ref, count)
  const entry: ItemEntry =
    ref.storage === 'instance'
      ? { storage: 'instance', instance: takeEquipment(state.inventory, ref.instanceId)[0] }
      : ref
  const { nextId } = state.auction
  const consignment: AuctionConsignment = { id: auctionId(nextId), entry, count, reservePrice }
  return {
    ...state,
    inventory,
    auction: {
      ...state.auction,
      consignments: [...state.auction.consignments, consignment],
      nextId: nextId + 1
    }
  }
}

/** Rút đồ ký gửi về túi trước khi phiên đóng (món trang bị cần chỗ trong túi). */
export function withdrawConsignment(
  data: GameData,
  state: GameState,
  consignmentId: string
): GameState {
  requireAuctionHouse(state)
  const consignment = state.auction.consignments.find((entry) => entry.id === consignmentId)
  if (!consignment) {
    throw new ActionError('auctionConsignmentNotFound', { consignmentId: String(consignmentId) })
  }
  const { entry, count } = consignment
  if (entry.storage === 'instance') assertBagRoom(data, state)
  const inventory =
    entry.storage === 'instance'
      ? addEquipment(state.inventory, entry.instance)
      : addByRef(state.inventory, entry, count)
  const consignments = state.auction.consignments.filter((other) => other !== consignment)
  return { ...state, inventory, auction: { ...state.auction, consignments } }
}

/** Nhận món trang bị đang giữ hộ, theo thứ tự, tới khi túi đầy. */
export function claimAuctionHeld(data: GameData, state: GameState): GameState {
  requireAuctionHouse(state)
  const { held } = state.auction
  if (held.length === 0) throw new ActionError('auctionNothingHeld')
  assertBagRoom(data, state)
  const taken = held.slice(0, bagFreeSlots(data, state))
  const inventory = taken.reduce(addEquipment, state.inventory)
  return {
    ...state,
    inventory,
    auction: { ...state.auction, held: held.slice(taken.length) }
  }
}

/** Lô cho UI: không có giá trần NPC (chỉ lộ trong log khi thua). */
export const visibleAuctionLots = (state: GameState): Omit<AuctionLot, 'npcPrice'>[] =>
  state.auction.lots.map(({ npcPrice: _npcPrice, ...lot }) => lot)
