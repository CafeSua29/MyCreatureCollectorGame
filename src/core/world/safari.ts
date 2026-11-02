// Khu bảo tồn (docs/rules/safari-zone.md): vào ở thị trấn tốn phí, nhận Bóng Bảo Tồn và lượt gặp;
// mỗi lần gặp không có trận, người chơi ném bóng / mồi / đá hoặc bỏ đi, quái có tỉ lệ chạy mỗi lượt.
// Hết lượt gặp / hết bóng / tự rời thì ra khu (cả lượt tốn clock.hours.safari, tính ở reducer).

import { recordQuestEvent } from '../quests'
import { autoLockCaught, getBaseSpecies, startHistory } from '../monster'
import { getItemCount, removeItems } from '../inventory'
import {
  charmEffect,
  criticalCaptureMultiplier,
  isFavoriteItem,
  hasPartyRoom,
  canReceiveMonster,
  capacityOf,
  hasRosterRoom,
  countCaught,
  mealMultiplier,
  tamerBonusMultiplier,
  recordCaughtResearch,
  researchMultiplier
} from '../registries'
import { ActionError, rollPercent, toBig, type Decimal, type RngState } from '../shared'
import { partnerMultiplier } from '../tamer'
import {
  dayOf,
  type GameAction,
  type GameData,
  type GameState,
  type Monster,
  type SafariEncounter,
  type SafariEvent,
  type SafariLure,
  type SafariLureEffect,
  type SafariVisit
} from '../model'
import { catchChance, rollCapture, withCatchPity } from './capture'
import { rollMonster, rollSpawnAge } from './encounter'
import { floorGeneMultiplier, floorLevelRange } from './floors'
import { refreshSafariRoster } from './safariRoster'
import { assertNoInstance } from './field'

/** Action làm được khi đang trong khu (mọi action khác bị chặn bằng `inSafari`). */
const SAFARI_ACTIONS: ReadonlySet<GameAction['type']> = new Set<GameAction['type']>([
  'throwSafariBall',
  'throwSafariBait',
  'throwSafariRock',
  'skipSafariEncounter',
  'leaveSafari'
])

/** Ném ActionError nếu action không làm được lúc này vì khu bảo tồn. */
export function assertSafariAllows(state: GameState, action: GameAction): void {
  if (state.safari.visit && !SAFARI_ACTIONS.has(action.type)) throw new ActionError('inSafari')
}

/** Phí vào khu = entryFeeBase × highestFloor. */
export const safariEntryFee = (data: GameData, state: Pick<GameState, 'highestFloor'>): Decimal =>
  toBig(data.config.safari.entryFeeBase).times(state.highestFloor)

/** Hệ số mồi / đá đang có (1 / 1 nếu không có); mồi đúng khẩu vị không giảm tỉ lệ bắt. */
function lureMultipliers(
  data: GameData,
  lure: SafariLureEffect | null
): { catchMultiplier: number; fleeMultiplier: number } {
  if (!lure) return { catchMultiplier: 1, fleeMultiplier: 1 }
  const config = data.config.safari.lures[lure.kind]
  return {
    catchMultiplier: lure.favorite ? Math.max(1, config.catchMultiplier) : config.catchMultiplier,
    fleeMultiplier: config.fleeMultiplier
  }
}

/**
 * Tỉ lệ bắt (%) khi ném Bóng Bảo Tồn vào quái đang gặp: công thức bắt chung (HP đầy), hệ số Bóng
 * Bảo Tồn × mồi / đá, kỹ năng đồng hành, món ăn linh thực, rồi bắt trượt theo số lần đã thoát.
 */
export function safariCatchChance(
  data: GameData,
  state: Pick<GameState, 'party' | 'cooking' | 'titles' | 'tamer' | 'sect' | 'research'>,
  encounter: SafariEncounter
): number {
  const ball = {
    catchMultiplier:
      data.config.safari.ballCatchMultiplier * lureMultipliers(data, encounter.lure).catchMultiplier
  }
  const chance = catchChance(data, encounter.monster, ball, {
    playerMultiplier:
      partnerMultiplier(data, state.party, 'catchRatePercent') *
      mealMultiplier(data, state.cooking.meal, 'catchRatePercent') *
      tamerBonusMultiplier(data, state, 'catchRatePercent') *
      researchMultiplier(data, state.research, encounter.monster.speciesId, 'catchRatePercent')
  })
  return withCatchPity(data, chance, encounter.misses)
}

/** Tỉ lệ (%) quái đang gặp chạy mất sau lượt này: theo độ hiếm của loài × mồi / đá, kẹp 0–100. */
export function safariFleeChance(data: GameData, encounter: SafariEncounter): number {
  const { fleeBase, fleeRarity } = data.config.safari
  const catchRate = getBaseSpecies(data, encounter.monster)?.catchRate ?? 0
  const base = fleeBase + fleeRarity * (1 - catchRate / 100)
  const chance = base * lureMultipliers(data, encounter.lure).fleeMultiplier
  return Math.min(100, Math.max(0, chance))
}

function requireVisit(state: GameState): SafariVisit {
  if (!state.safari.visit) throw new ActionError('notInSafari')
  return state.safari.visit
}

/** State đang làm dở của một action trong khu: state, lượt vào khu (null = đã ra), log. */
interface SafariDraft {
  state: GameState
  visit: SafariVisit | null
  log: SafariEvent[]
}

const finish = ({ state, visit, log }: SafariDraft): GameState => ({
  ...state,
  safari: { ...state.safari, visit, log }
})

/** Quái mới cho lượt gặp: loài đều trong danh sách, level / gen như quái hoang của highestFloor. */
function rollSafariMonster(data: GameData, state: GameState): [Monster, RngState, number] {
  const levels = floorLevelRange(data, state.highestFloor)
  const spec = {
    encounters: state.safari.roster.map((speciesId) => ({ speciesId, weight: 1 })),
    levelMin: levels.min,
    levelMax: levels.max,
    geneMultiplier: floorGeneMultiplier(data, state.highestFloor),
    // Bùa shiny (docs/rules/dex.md mục "Bùa") và danh hiệu nhân tỉ lệ như quái hoang.
    shinyChance:
      data.config.shiny.wildChance *
      charmEffect(data, state.inventory, 'shinyChanceMultiplier') *
      tamerBonusMultiplier(data, state, 'shinyChancePercent'),
    speciesShinyMultiplier: (speciesId: string) =>
      researchMultiplier(data, state.research, speciesId, 'shinyChancePercent'),
    aging: state.options.lifespanEnabled
  }
  const id = `m${state.nextMonsterId}`
  let [monster, rng] = rollMonster(data, state.rng, spec, id)
  ;[monster, rng] = rollSpawnAge(data, rng, monster, data.config.lifespan.spawnAgePercent.wild)
  return [monster, rng, state.nextMonsterId + 1]
}

/** Lượt vào khu không kể quái đang gặp. */
type VisitCounters = Omit<SafariVisit, 'encounter'>

/** Gặp quái kế, hoặc ra khu khi hết lượt gặp / hết bóng. */
function nextEncounter(data: GameData, draft: SafariDraft, visit: VisitCounters): SafariDraft {
  if (visit.encountersLeft <= 0 || visit.balls <= 0) {
    return {
      ...draft,
      visit: null,
      log: [...draft.log, { type: 'visitEnded', caught: visit.caught }]
    }
  }
  const [monster, rng, nextMonsterId] = rollSafariMonster(data, draft.state)
  const event: SafariEvent = {
    type: 'encounter',
    monsterId: monster.id,
    speciesId: monster.speciesId
  }
  return {
    state: { ...draft.state, rng, nextMonsterId },
    visit: {
      ...visit,
      encountersLeft: visit.encountersLeft - 1,
      encounter: { monster, misses: 0, lure: null }
    },
    log: [...draft.log, event]
  }
}

/** Vào khu ở thị trấn: trả phí, làm mới danh sách loài nếu tới ngày, gặp quái đầu tiên. */
export function enterSafari(data: GameData, state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  assertNoInstance(state)
  // Đội đủ và kho đầy: không vào khu, không mất phí (docs/rules/capacity.md).
  if (!canReceiveMonster(data, state)) {
    throw new ActionError('rosterFull', { capacity: capacityOf(data, state, 'storage') })
  }
  const fee = safariEntryFee(data, state)
  if (state.money.lt(fee)) throw new ActionError('notEnoughMoney', { need: fee, have: state.money })
  const refreshed = refreshSafariRoster(data, state, dayOf(state.time))
  if (refreshed.safari.roster.length === 0) throw new ActionError('safariUnavailable')
  const { balls, encounters } = data.config.safari
  const visit: VisitCounters = { encountersLeft: encounters, balls, caught: 0 }
  const paid = { ...refreshed, money: refreshed.money.minus(fee) }
  return finish(nextEncounter(data, { state: paid, visit: null, log: [] }, visit))
}

/** Quái bắt được: lý lịch `safari`, thân mật khởi đầu như bắt bóng (chưa khế ước); vào đội hoặc kho. */
function takeCaught(data: GameData, draft: SafariDraft, monster: Monster): SafariDraft {
  const { state } = draft
  const met = { day: dayOf(state.time), floor: null, level: monster.level }
  const caught = startHistory(
    autoLockCaught({ ...monster, affinity: data.config.affinity.start.caught }),
    { kind: 'safari' },
    met
  )
  const destination = hasPartyRoom(data, state.party, monster) ? 'party' : 'storage'
  const quests = recordQuestEvent(data, state.quests, {
    type: 'caught',
    raceId: monster.raceId,
    elementIds: monster.elementIds
  })
  return {
    ...draft,
    state: {
      ...state,
      quests,
      stats: countCaught(state.stats, [caught]),
      research: recordCaughtResearch(data, state.research, [caught]),
      party: destination === 'party' ? [...state.party, caught] : state.party,
      storage: destination === 'storage' ? [...state.storage, caught] : state.storage
    },
    log: [...draft.log, { type: 'caught', monsterId: caught.id, destination }]
  }
}

/**
 * Cuối lượt quái chưa bị bắt: tung tỉ lệ chạy (đã tính mồi / đá vừa ném), mồi / đá bớt một lượt.
 * Chạy mất hoặc hết bóng thì sang lượt gặp kế / ra khu.
 */
function endTurn(data: GameData, draft: SafariDraft, visit: SafariVisit): SafariDraft {
  const { encounter } = visit
  const [fled, rng] = rollPercent(draft.state.rng, safariFleeChance(data, encounter))
  const next = { ...draft, state: { ...draft.state, rng } }
  if (fled) {
    const log = [...next.log, { type: 'fled' as const, monsterId: encounter.monster.id }]
    return nextEncounter(data, { ...next, log }, visit)
  }
  if (visit.balls <= 0) return nextEncounter(data, next, visit)
  const lure = encounter.lure
  const ticked = lure && lure.turnsLeft > 1 ? { ...lure, turnsLeft: lure.turnsLeft - 1 } : null
  return { ...next, visit: { ...visit, encounter: { ...encounter, lure: ticked } } }
}

/** Ném một Bóng Bảo Tồn vào quái đang gặp. */
export function throwSafariBall(data: GameData, state: GameState): GameState {
  const visit = requireVisit(state)
  const { encounter } = visit
  const monsterId = encounter.monster.id
  // Hết chỗ giữa chừng: không ném bóng (vẫn ném mồi / đá, bỏ đi, rời khu được; capacity.md).
  if (!hasRosterRoom(data, state, { newcomer: encounter.monster })) {
    throw new ActionError('rosterFull', { capacity: capacityOf(data, state, 'storage') })
  }
  const chance = safariCatchChance(data, state, encounter)
  const { caught, critical, shakes, rng } = rollCapture(data, state.rng, {
    chance,
    criticalMultiplier: criticalCaptureMultiplier(data, state.dex)
  })
  const thrown: SafariVisit = { ...visit, balls: visit.balls - 1 }
  const draft: SafariDraft = {
    state: { ...state, rng },
    visit: thrown,
    log: [{ type: 'throwBall', monsterId, chance, critical, shakes }]
  }
  if (caught) {
    const taken = takeCaught(data, draft, encounter.monster)
    return finish(nextEncounter(data, taken, { ...thrown, caught: thrown.caught + 1 }))
  }
  const missed: SafariVisit = {
    ...thrown,
    encounter: { ...encounter, misses: encounter.misses + 1 }
  }
  const log = [...draft.log, { type: 'breakFree' as const, monsterId }]
  return finish(endTurn(data, { ...draft, visit: missed, log }, missed))
}

/** Ném mồi / đá: hiệu ứng mới thay hiệu ứng cũ, có tác dụng từ chính lượt này. */
function throwLure(
  data: GameData,
  state: GameState,
  { kind, itemId, favorite }: { kind: SafariLure; itemId: string | null; favorite: boolean }
): GameState {
  const visit = requireVisit(state)
  const { encounter } = visit
  const lure: SafariLureEffect = { kind, turnsLeft: data.config.safari.lures[kind].turns, favorite }
  const lured: SafariVisit = { ...visit, encounter: { ...encounter, lure } }
  const event: SafariEvent = {
    type: 'lure',
    monsterId: encounter.monster.id,
    kind,
    itemId,
    favorite
  }
  return finish(endTurn(data, { state, visit: lured, log: [event] }, lured))
}

/**
 * Ném mồi: `itemId` = mồi dụ trong túi (mất một; đúng khẩu vị quái thì không giảm tỉ lệ bắt), bỏ
 * trống = mồi thường miễn phí.
 */
export function throwSafariBait(data: GameData, state: GameState, itemId?: string): GameState {
  const visit = requireVisit(state)
  if (itemId === undefined)
    return throwLure(data, state, { kind: 'bait', itemId: null, favorite: false })
  const item = data.items[itemId]
  if (!item) throw new ActionError('unknownItem', { itemId })
  if (item.category !== 'bait') throw new ActionError('notBait', { itemId })
  const have = getItemCount(state.inventory, itemId)
  if (have < 1) throw new ActionError('notEnoughItem', { itemId, have, need: 1 })
  const favorite = isFavoriteItem(data, item, visit.encounter.monster)
  const paid = { ...state, inventory: removeItems(state.inventory, itemId, 1) }
  return throwLure(data, paid, { kind: 'bait', itemId, favorite })
}

/** Ném đá: tăng tỉ lệ bắt, tăng tỉ lệ chạy. */
export const throwSafariRock = (data: GameData, state: GameState): GameState =>
  throwLure(data, state, { kind: 'rock', itemId: null, favorite: false })

/** Bỏ quái đang gặp, sang lượt gặp kế (hết lượt gặp thì ra khu). */
export function skipSafariEncounter(data: GameData, state: GameState): GameState {
  const visit = requireVisit(state)
  const event: SafariEvent = { type: 'skipped', monsterId: visit.encounter.monster.id }
  return finish(nextEncounter(data, { state, visit, log: [event] }, visit))
}

/** Rời khu ngay: mất lượt gặp và bóng còn lại. */
export function leaveSafari(state: GameState): GameState {
  const visit = requireVisit(state)
  return finish({ state, visit: null, log: [{ type: 'visitEnded', caught: visit.caught }] })
}
