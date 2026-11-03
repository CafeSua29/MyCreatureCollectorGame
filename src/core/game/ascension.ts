// Phi thăng và thiên mệnh (docs/rules/ascension.md): prestige toàn game. Đặt ở game/ vì chạm gần hết
// hệ thống. Reset chỉ đổi đúng các trường liệt kê ở đây nên phần state mới mặc định được giữ.

import { newEventState } from '../events'
import { refillQuestBoard } from '../quests'
import {
  ActionError,
  BIG_ZERO,
  createRng,
  malformedAction,
  nextUint32,
  pickWeighted,
  toBig,
  type RngState
} from '../shared'
import { addBooks, addByRef, addEquipment, canLeaveBag } from '../inventory'
import { newDwellingState, requireTown } from '../progression'
import {
  ascensionEssenceReward,
  ascensionKeptMoney,
  ascensionStartFloor,
  bestAwakeningTotal,
  destinyChoiceCount,
  destinySlotCount,
  gameDataFor,
  hasStorageRoom,
  partySlotsUsed,
  rankedNodeBlocker,
  rankedNodeError,
  talentRankCost
} from '../registries'
import { resetMonsterLevel } from '../monster'
import { enterTown } from '../shop'
import {
  assertNoInstance,
  assertNoTournament,
  isGymFloor,
  newInstabilityState,
  rollFloorBiome,
  rollGym
} from '../world'
import {
  appendLog,
  bestFloorReached,
  bestRealmReached,
  type DestinyDef,
  type GameAction,
  type GameData,
  type GameState,
  type Gym,
  type Inventory,
  type Monster
} from '../model'

/** Việc vẫn làm được khi đang chờ chọn thiên mệnh: chọn, và tiêu Tiên nguyên vừa nhận. */
const ALLOWED_WHILE_CHOOSING: ReadonlySet<GameAction['type']> = new Set<GameAction['type']>([
  'chooseDestinies',
  'buyAscensionUpgrade'
])

/** Ném ActionError nếu đang chờ chọn thiên mệnh mà action không được phép. */
export function assertDestinyChosen(state: GameState, action: GameAction): void {
  if (state.ascension.destinyChoices !== null && !ALLOWED_WHILE_CHOOSING.has(action.type)) {
    throw new ActionError('destinyChoicePending')
  }
}

/** Tung `count` thiên mệnh khác nhau theo trọng số độ hiếm (hết thiên mệnh thì ít hơn). */
function rollDestinyChoices(data: GameData, rng: RngState, count: number): [string[], RngState] {
  const { rarityWeights } = data.config.ascension.destiny
  const pool = Object.values(data.destinies)
  const choices: string[] = []
  let next = rng
  while (choices.length < count) {
    const candidates = pool.filter((destiny) => !choices.includes(destiny.id))
    if (candidates.length === 0) break
    let destiny: DestinyDef
    ;[destiny, next] = pickWeighted(next, candidates, (entry) => rarityWeights[entry.rarity])
    choices.push(destiny.id)
  }
  return [choices, next]
}

/** Hằng trộn vào seed game để lựa chọn thiên mệnh lúc tạo game không tốn RNG của game. */
const DESTINY_SEED_SALT = 0x51ed270b

/** Lựa chọn thiên mệnh ở màn Game mới: tất định theo seed, một ô (chưa có nâng cấp). */
export function rollNewGameDestinies(data: GameData, seed: number): string[] {
  const rng = createRng(nextUint32(createRng((seed ^ DESTINY_SEED_SALT) >>> 0))[0])
  return rollDestinyChoices(data, rng, destinyChoiceCount(data, 1))[0]
}

/** Kiểm tra danh sách chọn: mảng id không trùng, thuộc `choices`, không quá `slots`. */
export function checkDestinyPicks(
  picks: unknown,
  { choices, slots }: { choices: readonly string[]; slots: number }
): string[] {
  if (!Array.isArray(picks) || picks.some((id) => typeof id !== 'string')) {
    throw malformedAction('destinyIds phải là danh sách id')
  }
  const ids = picks as string[] // Đã kiểm tra mọi phần tử là chuỗi ở trên.
  if (new Set(ids).size !== ids.length) throw malformedAction('destinyIds bị trùng')
  const invalid = ids.find((id) => !choices.includes(id))
  if (invalid !== undefined) throw new ActionError('notDestinyChoice', { destinyId: invalid })
  if (ids.length > slots) throw new ActionError('tooManyDestinies', { max: slots })
  return ids
}

/** Về level 1 và không còn việc được giao (thám hiểm, động phủ đều bị hủy khi phi thăng). */
const ascendedMonster = (data: GameData, monster: Monster): Monster => ({
  ...resetMonsterLevel(data, monster),
  assignment: null
})

/**
 * Túi sau phi thăng: đồ ký gửi và sách trong kho động phủ về túi; chồng thường mất, trừ thứ không rời
 * túi (vật phẩm chìa khóa, bùa). Trang bị, tinh thể, sách, hồn phách, khí linh giữ.
 */
function ascendedInventory(data: GameData, state: GameState): Inventory {
  let inventory = state.dwelling.storage.books.reduce(
    (bag, { count, ...key }) => addBooks(bag, key, count),
    state.inventory
  )
  for (const { entry, count } of state.auction.consignments) {
    inventory =
      entry.storage === 'instance'
        ? addEquipment(inventory, entry.instance)
        : addByRef(inventory, entry, count)
  }
  const stacks = Object.fromEntries(
    Object.entries(inventory.stacks).filter(([itemId]) => {
      const item = Object.hasOwn(data.items, itemId) ? data.items[itemId] : undefined
      return item !== undefined && !canLeaveBag(item.category)
    })
  )
  return { ...inventory, stacks }
}

/** Map của tầng 1..floor: giữ map đã tung của các tầng này, tung thêm nếu tầng chưa từng mở lần này. */
function startFloorBiomes(
  data: GameData,
  { rng, kept, floor }: { rng: RngState; kept: readonly string[]; floor: number }
): [string[], RngState] {
  const biomes = kept.slice(0, floor)
  let next = rng
  while (biomes.length < floor) {
    let biomeId: string
    ;[biomeId, next] = rollFloorBiome(data, next)
    biomes.push(biomeId)
  }
  return [biomes, next]
}

/** Đạo quán của các tầng đã có sẵn khi bắt đầu lại ở tầng cao hơn 1. */
function startFloorGyms(data: GameData, rng: RngState, floor: number): [Gym[], RngState] {
  const gyms: Gym[] = []
  let next = rng
  for (let current = 1; current <= floor; current++) {
    if (!isGymFloor(data, current)) continue
    let gym: Gym
    ;[gym, next] = rollGym(data, next, current)
    gyms.push(gym)
  }
  return [gyms, next]
}

/** Phi thăng ở thị trấn: nhận Tiên nguyên, reset tiến trình chính, chờ chọn lại thiên mệnh. */
export function ascend(data: GameData, state: GameState): GameState {
  requireTown(state)
  assertNoTournament(state)
  assertNoInstance(state)
  const { minFloor } = data.config.ascension
  if (state.highestFloor < minFloor) {
    throw new ActionError('ascensionLocked', { minFloor, highestFloor: state.highestFloor })
  }
  const essenceGained = ascensionEssenceReward(data, state)
  const floor = ascensionStartFloor(data, state)
  const slots = destinySlotCount(data, state)
  const ascension: GameState['ascension'] = {
    ...state.ascension,
    count: state.ascension.count + 1,
    immortalEssence: state.ascension.immortalEssence.plus(essenceGained),
    totalEssenceEarned: state.ascension.totalEssenceEarned.plus(essenceGained),
    bestFloor: bestFloorReached(state),
    bestRealm: bestRealmReached(state),
    bestAwakening: bestAwakeningTotal(state),
    destinyChoices: null
  }
  const [floorBiomeIds, afterBiomes] = startFloorBiomes(data, {
    rng: state.rng,
    kept: state.floorBiomeIds,
    floor
  })
  const [gyms, afterGyms] = startFloorGyms(data, afterBiomes, floor)
  const [destinyChoices, afterChoices] = rollDestinyChoices(
    data,
    afterGyms,
    destinyChoiceCount(data, slots)
  )
  const reset: GameState = {
    ...state,
    rng: afterChoices,
    ascension: { ...ascension, destinyChoices },
    destinies: [],
    highestFloor: floor,
    floorBiomeIds,
    money: ascensionKeptMoney(data, state),
    inventory: ascendedInventory(data, state),
    party: state.party.map((monster) => ascendedMonster(data, monster)),
    storage: state.storage.map((monster) => ascendedMonster(data, monster)),
    eggs: state.eggs.map((egg) => ({ ...egg, monster: ascendedMonster(data, egg.monster) })),
    tamer: { ...state.tamer, realm: 0, exp: BIG_ZERO },
    trainers: { ...state.trainers, gyms, arenaRank: 0 },
    tower: { highest: 0 },
    instability: newInstabilityState(),
    dwelling: newDwellingState(data),
    expeditions: { ...state.expeditions, active: [] },
    // Nhiệm vụ cũ có thể đòi tầng cao hơn tầng vừa về; bảng bổ sung lại ở dưới.
    quests: { ...state.quests, board: [], active: [] },
    events: { ...newEventState(), shopClosedUntilDay: state.events.shopClosedUntilDay },
    market: { saturation: {} },
    // Giá đã đặt là tiền, tiền đã reset; đồ ký gửi đã về túi (không thành đường chuyển tiền qua lần sau).
    auction: {
      ...state.auction,
      lots: state.auction.lots.map((lot) => ({ ...lot, bid: null })),
      consignments: []
    },
    sect: { ...state.sect, contribution: 0 },
    challenge: { ...state.challenge, nuzlockeAreas: [] },
    recruit: { bait: null },
    cooking: { ...state.cooking, meal: null },
    teraOrbCharged: true
  }
  const inTown = refillQuestBoard(data, { ...reset, ...enterTown(data, reset) })
  return appendLog(inTown, {
    type: 'ascended',
    count: ascension.count,
    essenceGained,
    startFloor: floor
  })
}

/**
 * Chọn thiên mệnh sau phi thăng (rỗng = Phàm nhân). Đội không đủ ô theo thiên mệnh mới (Thiên Sát Cô
 * Tinh) thì quái cuối đội về kho; kho không đủ chỗ thì lỗi, chọn cái khác.
 */
export function chooseDestinies(data: GameData, state: GameState, picks: unknown): GameState {
  const choices = state.ascension.destinyChoices
  if (choices === null) throw new ActionError('noDestinyChoice')
  const destinies = checkDestinyPicks(picks, { choices, slots: destinySlotCount(data, state) })
  const chosen: GameState = {
    ...state,
    destinies,
    ascension: { ...state.ascension, destinyChoices: null }
  }
  const { partySize } = gameDataFor(data, chosen).config
  let next = chosen
  while (next.party.length > 1 && partySlotsUsed(data, next.party) > partySize) {
    if (!hasStorageRoom(data, next)) throw new ActionError('storageFullForParty')
    const moved = next.party[next.party.length - 1]
    next = { ...next, party: next.party.slice(0, -1), storage: [...next.storage, moved] }
  }
  return appendLog(next, { type: 'destiniesChosen', destinyIds: destinies })
}

/** Mua một cấp nâng cấp Tiên giới (ngoài trận, ở đâu cũng được). */
export function buyAscensionUpgrade(
  data: GameData,
  state: GameState,
  upgradeId: unknown
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (typeof upgradeId !== 'string' || !Object.hasOwn(data.ascensionUpgrades, upgradeId)) {
    throw new ActionError('unknownAscensionUpgrade', { upgradeId: String(upgradeId) })
  }
  const upgrade = data.ascensionUpgrades[upgradeId]
  const { upgrades, immortalEssence } = state.ascension
  const blocker = rankedNodeBlocker(upgrade, upgrades, {
    nodeId: upgradeId,
    available: immortalEssence.toNumber()
  })
  if (blocker?.kind === 'points') {
    throw new ActionError('notEnoughImmortalEssence', {
      need: toBig(blocker.need),
      have: immortalEssence
    })
  }
  if (blocker) throw rankedNodeError(upgradeId, blocker)
  const rank = upgrades[upgradeId] ?? 0
  return {
    ...state,
    ascension: {
      ...state.ascension,
      immortalEssence: immortalEssence.minus(talentRankCost(upgrade, rank)),
      upgrades: { ...upgrades, [upgradeId]: rank + 1 }
    }
  }
}

// Bên ngoài core (UI, mô phỏng) hỏi số của phi thăng và dữ liệu của game qua đây.
export {
  ascensionEssenceReward,
  ascensionKeptMoney,
  ascensionStartFloor,
  destinySlotCount,
  gameDataFor
} from '../registries'
