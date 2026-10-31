// Điểm vào duy nhất cho mọi action: gameReducer(data, state, action) => newState.

import { abandonQuest, acceptQuest, claimQuest } from '../quests'
import {
  challengeArena,
  challengeBoss,
  challengeGym,
  challengeTournament,
  enterTournament,
  forfeitTournament,
  abandonTrial,
  enterZone,
  exploreZone,
  gather,
  leaveZone,
  challengeTower,
  challengeTrial,
  enterTrial,
  flee,
  leaveBattle,
  replaceFainted,
  startTribulation,
  submitTurn,
  challengeBeastKing,
  defendTown,
  acceptRecruit,
  declineRecruit
} from '../battle'
import {
  assertEventAllows,
  buyEventItem,
  chooseEventOption,
  explore,
  newEventState,
  retreatBeastTide,
  settleEventBattle,
  startWildEncounter,
  travelWithEvents
} from '../events'
import { createRng, malformedAction, toBig, type BigValue } from '../shared'
import {
  advanceTime,
  breed,
  recallExpedition,
  startExpedition,
  buyPlot,
  craft,
  eatDish,
  forgeSoulRelic,
  harvest,
  incubateSoul,
  learnRecipe,
  plantSeed,
  chooseEvolution,
  hoursUntilWake,
  petMonster,
  setGameOption,
  defaultGameOptions
} from '../progression'
import {
  applyBait,
  applyItem,
  assertSafariAllows,
  enterSafari,
  healParty,
  leaveSafari,
  newSafariState,
  newZoneState,
  rest,
  skipSafariEncounter,
  throwSafariBait,
  throwSafariBall,
  throwSafariRock
} from '../world'
import { createInventory, discardItem } from '../inventory'
import { buyCharm, buyItem, sellItem } from '../shop'
import { bindContract, newTamerState, tamerBreakthrough } from '../tamer'
import {
  fuse,
  implant,
  infuseEgg,
  newLabState,
  rebirthMonster,
  sacrifice,
  warmEggsAtRest
} from '../progression'
import { applySkillBook, learnPendingSkill, relearnSkill, skipPendingSkill } from '../monster'
import {
  equipItem,
  moveToParty,
  moveToStorage,
  releaseMonster,
  renameMonster,
  reorderParty,
  swapWithStorage,
  unequipItem,
  changeTeraElement,
  learnFormation,
  setFormation,
  setHumanForm,
  atavize,
  extractTrait,
  expandCapacity,
  injectTrait,
  newCapacityState,
  setTactic,
  takeHumanForm,
  upgradeSoulLevel,
  allocateTalent,
  bindBond,
  claimDexReward,
  claimRegionalDexReward,
  dissolveContract,
  newDexState,
  syncDex,
  formContract,
  enhanceEquipment,
  rerollEquipmentAffixes,
  salvageEquipment,
  castEquipment,
  imbueEquipment
} from '../roster'
import type { GameAction, GameData, GameState, GatheringMethod, Location, Monster } from '../model'

/** Tăng mỗi khi đổi cấu trúc GameState, kèm hàm migrate cho save cũ. */
export const SAVE_VERSION = 81

export function createGameState(options: {
  seed: number
  party?: Monster[]
  /** Nhận number cho tiện (test); lưu thành Decimal. */
  money?: BigValue
  nextMonsterId?: number
  /** Mặc định: thị trấn. */
  location?: Location
  /**
   * Map của các tầng đã mở (phần tử N − 1 = tầng N); bắt buộc vì core không tự biết biome nào.
   * highestFloor = độ dài danh sách. Test dùng makeGameState (@core/testing) để có mặc định.
   */
  floorBiomeIds: readonly string[]
  /** Đồng hồ game (giờ); mặc định 0. */
  time?: number
  /** Bật thọ nguyên; mặc định tắt. Quái trong party phải có cờ aging khớp. */
  lifespanEnabled?: boolean
  /** Bật chết thật (docs/rules/options.md); mặc định tắt. */
  permadeathEnabled?: boolean
  /** Cảnh giới ngự thú sư (mặc định 0); quái trong party được khế ước theo cảnh giới này. */
  tamerRealm?: number
  /** Số ô linh điền (mặc định DEFAULT_GARDEN_PLOTS; game mới lấy config.alchemy.initialPlots). */
  gardenPlots?: number
}): GameState {
  const realm = options.tamerRealm ?? 0
  const party = (options.party ?? []).map((monster) => bindContract(monster, realm))
  return {
    version: SAVE_VERSION,
    location: options.location ?? { type: 'town' },
    highestFloor: options.floorBiomeIds.length,
    floorBiomeIds: [...options.floorBiomeIds],
    rng: createRng(options.seed),
    money: toBig(options.money ?? 0),
    party,
    storage: [],
    eggs: [],
    inventory: createInventory(),
    shop: { stock: [] },
    market: { saturation: {} },
    nextMonsterId: options.nextMonsterId ?? party.length + 1,
    nextItemId: 1,
    teraOrbCharged: true,
    time: options.time ?? 0,
    options: defaultGameOptions({
      lifespanEnabled: options.lifespanEnabled ?? false,
      permadeathEnabled: options.permadeathEnabled ?? false
    }),
    dayEvents: [],
    tamer: newTamerState(realm),
    formations: { known: [], active: null },
    alchemy: newAlchemyState(),
    smithing: newSmithingState(),
    cooking: newCookingState(),
    quests: { board: [], active: [], nextQuestId: 1 },
    expeditions: { board: [], refreshDay: 0, active: [], nextId: 1 },
    trainers: newTrainerState(),
    trial: null,
    tower: { highest: 0 },
    events: newEventState(),
    recruit: { bait: null },
    safari: newSafariState(),
    lab: newLabState(),
    capacity: newCapacityState(),
    zones: newZoneState(),
    gathering: newGatheringState(),
    dex: newDexState(),
    garden: {
      plots: Array.from({ length: options.gardenPlots ?? DEFAULT_GARDEN_PLOTS }, () => null)
    },
    battle: null
  }
}

/** Ngự thú sư NPC lúc bắt đầu: chưa có đạo quán, bậc đấu trường 0, chưa dự giải (trainers.md). */
export const newTrainerState = (): GameState['trainers'] => ({
  gyms: [],
  arenaRank: 0,
  tournament: { lastPeriod: -1, round: null }
})

/** Số ô linh điền của createGameState khi không ghi (bằng config.alchemy.initialPlots của dữ liệu thật). */
export const DEFAULT_GARDEN_PLOTS = 2

/** Luyện đan lúc bắt đầu: cấp 1, chưa học đan phương (docs/rules/alchemy.md). */
export const newAlchemyState = (): GameState['alchemy'] => ({
  level: 1,
  exp: toBig(0),
  knownRecipes: [],
  lastCraft: null
})

/** Luyện khí lúc bắt đầu: cấp 1 (docs/rules/alchemy.md). */
export const newSmithingState = (): GameState['smithing'] => ({
  level: 1,
  exp: toBig(0),
  lastCraft: null
})

/** Nấu ăn lúc bắt đầu: cấp 1, chưa ăn món nào (docs/rules/cooking.md). */
export const newCookingState = (): GameState['cooking'] => ({
  level: 1,
  exp: toBig(0),
  lastCraft: null,
  meal: null
})

/** Việc tốn giờ chỉ làm thời gian trôi khi nó thật sự đổi state (không lỗi, không "đứng yên"). */
function withTime(data: GameData, before: GameState, after: GameState, hours: number): GameState {
  return after === before ? after : advanceTime(data, after, hours)
}

/**
 * Rời trận đã kết thúc: kết quả sau trận của trận event (docs/rules/events.md), rồi trận tốn giờ theo
 * loại trận (mục "Đồng hồ game").
 */
function leaveBattleWithTime(data: GameData, state: GameState): GameState {
  const left = settleEventBattle(data, state, leaveBattle(state))
  const { hours } = data.config.clock
  return advanceTime(data, left, state.battle?.isBoss ? hours.bossBattle : hours.wildBattle)
}

/** Chọn lựa chọn event: tốn giờ nếu không mở trận (trận tính giờ lúc rời trận). */
function chooseEventWithTime(data: GameData, state: GameState, optionId: string): GameState {
  const chosen = chooseEventOption(data, state, optionId)
  return chosen.battle ? chosen : advanceTime(data, chosen, data.config.clock.hours.event)
}

export function gameReducer(data: GameData, state: GameState, action: GameAction): GameState {
  // Event đang chờ / thú triều chặn action trước khi xử lý (docs/rules/events.md); trong khu bảo
  // tồn chỉ làm action của khu (docs/rules/safari-zone.md).
  assertEventAllows(state, action)
  assertSafariAllows(state, action)
  // Bộ sưu tập ghi sau mọi action: một chỗ cho mọi cách gặp / có quái (docs/rules/dex.md). Action
  // không đổi gì giữ nguyên state (không ghi Dex).
  const next = dispatchAction(data, state, action)
  return next === state ? state : syncDex(data, next)
}

/**
 * Khám phá hiểm địa (docs/rules/zones.md): bước không mở trận tốn clock.hours.zoneStep; bước mở trận
 * tính giờ lúc rời trận như trận thường.
 */
function exploreZoneWithTime(data: GameData, state: GameState): GameState {
  const explored = exploreZone(data, state)
  return explored.battle ? explored : advanceTime(data, explored, data.config.clock.hours.zoneStep)
}

/**
 * Câu cá / khai thác (docs/rules/gathering.md): lần không mở trận tốn clock.hours theo cách thu thập;
 * lần mở trận tính giờ lúc rời trận như trận thường.
 */
function gatherWithTime(
  data: GameData,
  state: GameState,
  { method, lureItemId }: { method: GatheringMethod; lureItemId?: unknown }
): GameState {
  const gathered = gather(data, state, { method, lureItemId })
  return gathered.battle ? gathered : advanceTime(data, gathered, data.config.clock.hours[method])
}

/** Câu cá / khai thác lúc bắt đầu: chưa có kết quả nào. */
export const newGatheringState = (): GameState['gathering'] => ({ lastResult: null })

/** Action trong khu bảo tồn: ra khu (lượt vào khu kết thúc) thì cả lượt tốn clock.hours.safari. */
function withSafariTime(data: GameData, before: GameState, after: GameState): GameState {
  const ended = before.safari.visit !== null && after.safari.visit === null
  return ended ? advanceTime(data, after, data.config.clock.hours.safari) : after
}

function dispatchAction(data: GameData, state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'startWildBattle':
      return startWildEncounter(data, state)
    case 'explore':
      return explore(data, state)
    case 'chooseEventOption':
      return chooseEventWithTime(data, state, action.optionId)
    case 'buyEventItem':
      return buyEventItem(data, state, action.item, action.count)
    case 'defendTown':
      return defendTown(data, state)
    case 'challengeBeastKing':
      return challengeBeastKing(data, state)
    case 'retreatBeastTide':
      return retreatBeastTide(data, state)
    case 'startTribulation':
      return startTribulation(data, state, action.monsterId)
    case 'setTactic':
      return setTactic(state, action.monsterId, action.tactic)
    case 'startExpedition':
      return startExpedition(data, state, action)
    case 'recallExpedition':
      return recallExpedition(state, action.expeditionActiveId)
    case 'acceptQuest':
      return acceptQuest(data, state, action.questId)
    case 'abandonQuest':
      return abandonQuest(state, action.questId)
    case 'claimQuest':
      return claimQuest(state, action.questId)
    case 'craft':
      return craft(data, state, action)
    case 'learnRecipe':
      return learnRecipe(data, state, action.itemId)
    case 'plantSeed':
      return plantSeed(data, state, action)
    case 'harvest':
      return harvest(data, state, action.plotIndex)
    case 'buyPlot':
      return buyPlot(data, state)
    case 'incubateSoul':
      return incubateSoul(data, state, action.soulId)
    case 'forgeSoulRelic':
      return forgeSoulRelic(data, state, action.soulId)
    case 'takeHumanForm':
      return takeHumanForm(data, state, action.monsterId)
    case 'setHumanForm':
      return setHumanForm(data, state, action)
    case 'atavize':
      return atavize(data, state, action)
    case 'challengeBoss':
      return challengeBoss(data, state)
    case 'challengeGym':
      return challengeGym(data, state)
    case 'enterTournament':
      return enterTournament(data, state)
    case 'challengeTournament':
      return challengeTournament(data, state)
    case 'forfeitTournament':
      return forfeitTournament(state)
    case 'challengeArena':
      return challengeArena(data, state)
    case 'enterTrial':
      return enterTrial(data, state)
    case 'challengeTrial':
      return challengeTrial(data, state)
    case 'abandonTrial':
      return abandonTrial(state)
    case 'challengeTower':
      return challengeTower(data, state)
    case 'enterZone':
      return enterZone(data, state, action.zoneId)
    case 'exploreZone':
      return exploreZoneWithTime(data, state)
    case 'fish':
      return gatherWithTime(data, state, { method: 'fishing', lureItemId: action.lureItemId })
    case 'mine':
      return gatherWithTime(data, state, { method: 'mining' })
    case 'leaveZone':
      return leaveZone(data, state)
    case 'submitTurn':
      return submitTurn(data, state, action.commands, action.tamer)
    case 'flee':
      return flee(data, state)
    case 'replaceFainted':
      return replaceFainted(data, state, action.replacements)
    case 'leaveBattle':
      return leaveBattleWithTime(data, state)
    case 'acceptRecruit':
      return acceptRecruit(data, state)
    case 'declineRecruit':
      return declineRecruit(state)
    case 'useBait':
      return applyBait(data, state, action.itemId)
    case 'eatDish':
      return eatDish(data, state, action.itemId)
    case 'claimDexReward':
      return claimDexReward(data, state, action.milestoneId)
    case 'claimRegionalDexReward':
      return claimRegionalDexReward(data, state, action.biomeId)
    case 'enterSafari':
      return enterSafari(data, state)
    case 'throwSafariBall':
      return withSafariTime(data, state, throwSafariBall(data, state))
    case 'throwSafariBait':
      return withSafariTime(data, state, throwSafariBait(data, state, action.itemId))
    case 'throwSafariRock':
      return withSafariTime(data, state, throwSafariRock(data, state))
    case 'skipSafariEncounter':
      return withSafariTime(data, state, skipSafariEncounter(data, state))
    case 'leaveSafari':
      return withSafariTime(data, state, leaveSafari(state))
    case 'rest':
      // Nghỉ là ngủ tới sáng hôm sau; bùa kiểu Ôn Dưỡng Lò ấp trứng trong lúc nghỉ.
      return advanceTime(
        data,
        warmEggsAtRest(data, rest(data, state)),
        hoursUntilWake(data, state.time)
      )
    case 'travel':
      return withTime(
        data,
        state,
        travelWithEvents(data, state, action.to),
        data.config.clock.hours.travel
      )
    case 'healParty':
      return advanceTime(data, healParty(data, state), data.config.clock.hours.healParty)
    case 'setGameOption':
      return setGameOption(data, state, action.option, action.enabled)
    case 'chooseEvolution':
      return chooseEvolution(data, state, action.monsterId, action.speciesId)
    case 'learnPendingSkill':
      return learnPendingSkill(data, state, action.monsterId, action.skillId, action.forgetSkillId)
    case 'skipPendingSkill':
      return skipPendingSkill(state, action.monsterId, action.skillId)
    case 'breed':
      return breed(data, state, action.fatherId, action.motherId)
    case 'fuse':
      return fuse(data, state, action)
    case 'sacrifice':
      return sacrifice(data, state, action)
    case 'rebirthMonster':
      return rebirthMonster(data, state, action.monsterId)
    case 'implant':
      return implant(data, state, action)
    case 'expandCapacity':
      return expandCapacity(data, state, action.kind)
    case 'infuseEgg':
      return infuseEgg(data, state, action)
    case 'buyCharm':
      return buyCharm(data, state, action.itemId)
    case 'relearnSkill':
      return relearnSkill(data, state, action.monsterId, action.skillId, action.forgetSkillId)
    case 'useSkillBook':
      return applySkillBook(data, state, action.monsterId, action.item)
    case 'useItem':
      return applyItem(data, state, action)
    case 'discardItem':
      return discardItem(data, state, action.item, action.count)
    case 'sellItem':
      return sellItem(data, state, action.item, action.count)
    case 'buyItem':
      return buyItem(data, state, action.item, action.count)
    case 'moveToStorage':
      return moveToStorage(data, state, action.monsterId)
    case 'moveToParty':
      return moveToParty(data, state, action.monsterId)
    case 'swapWithStorage':
      return swapWithStorage(data, state, action.partyMonsterId, action.storageMonsterId)
    case 'reorderParty':
      return reorderParty(state, action.monsterIds)
    case 'releaseMonster':
      return releaseMonster(data, state, action)
    case 'equipItem':
      return equipItem(data, state, action.monsterId, action.item)
    case 'unequipItem':
      return unequipItem(data, state, action.monsterId, action.slotIndex)
    case 'enhanceEquipment':
      return enhanceEquipment(data, state, action.instanceId)
    case 'rerollEquipmentAffixes':
      return rerollEquipmentAffixes(data, state, action)
    case 'salvageEquipment':
      return salvageEquipment(data, state, action.instanceIds)
    case 'castEquipment':
      return castEquipment(data, state, action)
    case 'imbueEquipment':
      return imbueEquipment(data, state, action)
    case 'extractTrait':
      return extractTrait(data, state, action)
    case 'injectTrait':
      return injectTrait(data, state, action)
    case 'changeTeraElement':
      return changeTeraElement(data, state, action.monsterId, action.elementId)
    case 'upgradeSoulLevel':
      return upgradeSoulLevel(data, state, action.monsterId, action.stat)
    case 'allocateTalent':
      return allocateTalent(data, state, action.monsterId, action.nodeId)
    case 'renameMonster':
      return renameMonster(data, state, action.monsterId, action.nickname)
    case 'bindBond':
      return bindBond(data, state, action.monsterId)
    case 'formContract':
      return formContract(data, state, action.monsterId)
    case 'dissolveContract':
      return dissolveContract(data, state, action.monsterId)
    case 'tamerBreakthrough':
      return tamerBreakthrough(data, state)
    case 'petMonster':
      return petMonster(state, action.monsterId)
    case 'learnFormation':
      return learnFormation(data, state, action.itemId)
    case 'setFormation':
      return setFormation(state, action.formationId)
    default: {
      // Thêm loại action mà quên xử lý thì TypeScript báo lỗi ở đây. Không dùng assertNever vì
      // action từ renderer có thể sai lúc chạy: phải ném ActionError để state giữ nguyên.
      const unhandled: never = action
      throw malformedAction(`action lạ: ${String((unhandled as { type: unknown }).type)}`)
    }
  }
}
