// Trao đổi với NPC ở thị trấn (docs/rules/trades.md): bảng đề nghị làm mới theo ngày (việc theo ngày
// `trades`), yêu cầu theo registry TRADE_WANTS, thứ NPC đưa (quái sinh sẵn hoặc vật phẩm), action
// acceptTrade. Như trao đổi trong game của Pokémon: quái nhận về mang tên NPC là chủ cũ, được thêm EXP.

import { addItems, itemStorage } from '../inventory'
import {
  assertOverflowConfirmed,
  raceMatches,
  returnEquipmentWithinCapacity,
  speciesRankIndex,
  speciesRankOf
} from '../registries'
import { assertNotBusy, assertNotLocked, startHistory } from '../monster'
import { assertNotBond } from '../tamer'
import { assertNoTournament, floorLevelRange, floorSite, generateTradeMonster } from '../world'
import { ActionError, nextInt, pick, pickWeighted, type RngState } from '../shared'
import {
  BATTLE_FORM_KINDS,
  dayOf,
  TRADE_WANT_KINDS,
  type DayEvent,
  type EncounterEntry,
  type GameData,
  type GameState,
  type Monster,
  type NormalSpecies,
  type TradeGive,
  type TradeOffer,
  type TradeState,
  type TradeWant,
  type TradeWantKind
} from '../model'

/** Bảng trống, làm mới ở lần qua ngày đầu tiên (game mới / test). */
export const newTradeState = (): TradeState => ({ offers: [], refreshDay: 0, nextOfferId: 1 })

/** Đầu vào tung yêu cầu: một loài hoang của một map đã mở (để yêu cầu luôn làm được) và level tối thiểu. */
interface WantRollContext {
  species: NormalSpecies
  minLevel: number
  rng: RngState
}

interface TradeWantHandler {
  roll(ctx: WantRollContext): [TradeWant, RngState]
  matches(data: GameData, want: TradeWant, monster: Monster): boolean
  /** Id trong yêu cầu có thật (kiểm tra save). */
  isValid(data: GameData, want: TradeWant): boolean
}

export const TRADE_WANTS: Readonly<Record<TradeWantKind, TradeWantHandler>> = {
  // Đúng loài (như Pokémon: NPC muốn một loài bắt được gần đó).
  species: {
    roll: ({ species, minLevel, rng }) => [
      { kind: 'species', speciesId: species.id, minLevel },
      rng
    ],
    matches: (_data, want, monster) =>
      want.kind === 'species' && monster.speciesId === want.speciesId,
    isValid: (data, want) => want.kind === 'species' && Object.hasOwn(data.species, want.speciesId)
  },
  // Race của loài đó (khớp cả nhóm race qua raceMatches).
  race: {
    roll: ({ species, minLevel, rng }) => [{ kind: 'race', raceId: species.raceId, minLevel }, rng],
    matches: (data, want, monster) =>
      want.kind === 'race' && raceMatches(data, monster.raceId, want.raceId),
    isValid: (data, want) => want.kind === 'race' && Object.hasOwn(data.races, want.raceId)
  },
  // Một hệ của loài đó.
  element: {
    roll({ species, minLevel, rng }) {
      let elementId: string
      ;[elementId, rng] = pick(rng, species.elementIds)
      return [{ kind: 'element', elementId, minLevel }, rng]
    },
    matches: (_data, want, monster) =>
      want.kind === 'element' && monster.elementIds.includes(want.elementId),
    isValid: (data, want) => want.kind === 'element' && Object.hasOwn(data.elements, want.elementId)
  }
}

/** Quái có đúng yêu cầu của đề nghị không (loại yêu cầu + level tối thiểu). */
export const meetsTradeWant = (data: GameData, want: TradeWant, monster: Monster): boolean =>
  monster.level >= want.minLevel && TRADE_WANTS[want.kind].matches(data, want, monster)

const speciesPoolCache = new WeakMap<GameData, readonly EncounterEntry[]>()

/**
 * Loài NPC đưa: mọi loài thường trừ dạng chỉ có trong trận (quái sở hữu không ở dạng đó), kể cả loài
 * không gặp ở map nào; trọng số theo phẩm cấp loài (giveRankWeights; vượt danh sách lấy số cuối).
 */
export function tradeSpeciesPool(data: GameData): readonly EncounterEntry[] {
  const cached = speciesPoolCache.get(data)
  if (cached) return cached
  const weights = data.config.trades.giveRankWeights
  const pool = Object.values(data.species).flatMap((species) => {
    if (species.kind !== 'normal') return []
    if (BATTLE_FORM_KINDS.includes(species.formKind ?? 'alternate')) return []
    const rank = speciesRankIndex(data, speciesRankOf(data, species).id)
    const weight = weights[Math.min(Math.max(0, rank), weights.length - 1)] ?? 0
    return weight > 0 ? [{ speciesId: species.id, weight }] : []
  })
  speciesPoolCache.set(data, pool)
  return pool
}

const itemPoolCache = new WeakMap<GameData, readonly { itemId: string; weight: number }[]>()

/** Vật phẩm NPC đưa: mọi vật phẩm gộp chồng có giá > 0, trọng số = giá^itemWeightPower. */
export function tradeItemPool(data: GameData): readonly { itemId: string; weight: number }[] {
  const cached = itemPoolCache.get(data)
  if (cached) return cached
  const pool = Object.values(data.items).flatMap((item) => {
    if (itemStorage(item.category) !== 'stack' || !('price' in item) || item.price <= 0) return []
    return [{ itemId: item.id, weight: item.price ** data.config.trades.itemWeightPower }]
  })
  itemPoolCache.set(data, pool)
  return pool
}

/** Thứ NPC đưa: quái sinh sẵn theo tầng cao nhất hoặc vật phẩm theo trọng số. */
function rollGive(
  data: GameData,
  state: GameState,
  { rng, monsterId }: { rng: RngState; monsterId: string }
): [TradeGive | null, RngState] {
  const config = data.config.trades
  const kinds = (['monster', 'item'] as const).filter((kind) => config.giveWeights[kind] > 0)
  if (kinds.length === 0) return [null, rng]
  let kind: TradeGive['kind']
  ;[kind, rng] = pickWeighted(rng, kinds, (k) => config.giveWeights[k])
  if (kind === 'item') {
    const items = tradeItemPool(data)
    if (items.length === 0) return [null, rng]
    let reward: (typeof items)[number]
    ;[reward, rng] = pickWeighted(rng, items, (entry) => entry.weight)
    return [{ kind: 'item', itemId: reward.itemId, count: 1 }, rng]
  }
  const encounters = tradeSpeciesPool(data)
  if (encounters.length === 0) return [null, rng]
  let monster: Monster
  ;[monster, rng] = generateTradeMonster(data, rng, {
    site: floorSite(data, state, state.highestFloor),
    encounters,
    id: monsterId,
    levelOffset: config.giveLevelOffset,
    geneMultiplier: config.giveGeneMultiplier,
    shinyMultiplier: config.giveShinyMultiplier
  })
  return [{ kind: 'monster', monster }, rng]
}

/** Một đề nghị: NPC, yêu cầu từ một loài hoang của một map đã mở, thứ đưa; null = không ra được. */
function rollOffer(
  data: GameData,
  state: GameState,
  rng: RngState
): [Omit<TradeOffer, 'id'> | null, RngState] {
  const config = data.config.trades
  let biomeId: string
  ;[biomeId, rng] = pick(rng, state.floorBiomeIds)
  const encounters = data.biomes[biomeId]?.encounters ?? []
  const kinds = TRADE_WANT_KINDS.filter((kind) => config.wantWeights[kind] > 0)
  if (encounters.length === 0 || kinds.length === 0) return [null, rng]
  let encounter: EncounterEntry
  ;[encounter, rng] = pickWeighted(rng, encounters, (e) => e.weight)
  const species = data.species[encounter.speciesId]
  // Bảng gặp chỉ có loài thường (kiểm tra dữ liệu); phòng dữ liệu lạ thì không ra đề nghị.
  if (species?.kind !== 'normal') return [null, rng]
  let kind: TradeWantKind
  ;[kind, rng] = pickWeighted(rng, kinds, (k) => config.wantWeights[k])
  const floorMin = floorLevelRange(data, state.highestFloor).min
  const minLevel = Math.max(1, Math.ceil((floorMin * config.wantLevelPercent) / 100))
  let want: TradeWant
  ;[want, rng] = TRADE_WANTS[kind].roll({ species, minLevel, rng })
  let npcNameId: string
  ;[npcNameId, rng] = pick(rng, Object.keys(data.npcNames))
  let give: TradeGive | null
  ;[give, rng] = rollGive(data, state, { rng, monsterId: `m${state.nextMonsterId}` })
  return [give ? { npcNameId, want, give } : null, rng]
}

/** Ra lại cả bảng: số đề nghị trong offerCount, quái NPC đưa giữ id trong bộ đếm nextMonsterId. */
export function rollTradeOffers(data: GameData, state: GameState, day: number): GameState {
  const config = data.config.trades
  let { nextMonsterId } = state
  let { nextOfferId } = state.trades
  const [count, afterCount] = nextInt(state.rng, config.offerCount.min, config.offerCount.max)
  let rng = afterCount
  const offers: TradeOffer[] = []
  for (let i = 0; i < count; i++) {
    let offer: Omit<TradeOffer, 'id'> | null
    ;[offer, rng] = rollOffer(data, { ...state, nextMonsterId }, rng)
    if (!offer) continue
    if (offer.give.kind === 'monster') nextMonsterId++
    offers.push({ id: `t${nextOfferId++}`, ...offer })
  }
  return {
    ...state,
    rng,
    nextMonsterId,
    trades: { offers, refreshDay: day + config.refreshDays, nextOfferId }
  }
}

/** Việc theo ngày (DAILY_TASKS): tới ngày làm mới thì ra lại bảng (thay đề nghị cũ). */
export function tradesDailyTask(
  data: GameData,
  state: GameState,
  _events: DayEvent[],
  day: number
): GameState {
  return day < state.trades.refreshDay ? state : rollTradeOffers(data, state, day)
}

/**
 * Nhận đề nghị `offerId`, đưa quái `monsterId` (đội hoặc kho; không phải bản mệnh, không đang bận,
 * đúng yêu cầu). Quái NPC đưa thế chỗ quái đưa đi (cùng ô đội / kho), lý lịch nguồn gốc `trade`;
 * vật phẩm thì vào túi (đội không được trống). Trang bị của quái đưa đi về túi như thả quái.
 */
export function acceptTrade(
  data: GameData,
  state: GameState,
  {
    offerId,
    monsterId,
    discardOverflow
  }: { offerId: string; monsterId: string; discardOverflow?: boolean }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  assertNoTournament(state)
  const offer = state.trades.offers.find((entry) => entry.id === offerId)
  if (!offer) throw new ActionError('tradeNotFound', { offerId: String(offerId) })
  const inParty = state.party.some((m) => m.id === monsterId)
  const monster = [...state.party, ...state.storage].find((m) => m.id === monsterId)
  if (!monster) throw new ActionError('monsterNotOwned', { monsterId: String(monsterId) })
  assertNotBond(monster)
  assertNotLocked(monster)
  assertNotBusy(monster)
  if (!meetsTradeWant(data, offer.want, monster)) {
    throw new ActionError('tradeWantNotMet', { offerId, monsterId })
  }
  if (offer.give.kind === 'item' && inParty && state.party.length <= 1) {
    throw new ActionError('partyWouldBeEmpty')
  }
  assertOverflowConfirmed(data, state, { monsters: [monster], discardOverflow })
  const inventory = returnEquipmentWithinCapacity(data, state, state.inventory, monster)
  const trades = {
    ...state.trades,
    offers: state.trades.offers.filter((entry) => entry.id !== offerId)
  }
  if (offer.give.kind === 'item') {
    return {
      ...state,
      party: state.party.filter((m) => m.id !== monsterId),
      storage: state.storage.filter((m) => m.id !== monsterId),
      inventory: addItems(inventory, offer.give.itemId, offer.give.count),
      trades
    }
  }
  const received = startHistory(
    { ...offer.give.monster, affinity: data.config.affinity.start.caught },
    { kind: 'trade', npcNameId: offer.npcNameId },
    { day: dayOf(state.time), floor: null, level: offer.give.monster.level }
  )
  const swap = (m: Monster): Monster => (m.id === monsterId ? received : m)
  return {
    ...state,
    party: state.party.map(swap),
    storage: state.storage.map(swap),
    inventory,
    trades
  }
}

/** Quái nhận qua trao đổi được + expBonusPercent % EXP (hệ số EXP theo nguồn gốc). */
export const tradeExpMultiplier = (data: GameData, monster: Monster): number =>
  monster.history?.origin.kind === 'trade' ? 1 + data.config.trades.expBonusPercent / 100 : 1
