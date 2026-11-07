// Action ngoài trận của Rogue Fusion và các cách tạo Bootleg của gốc (docs/rules/rogue-fusion.md):
// Ritual Candle (hiến quái), Hacking Glove (Cyber Material), đổi Fused Material, quà Bootleg của nhà
// Bootleg và của bảng nhiệm vụ.

import { ActionError, malformedAction, pick, type RngState } from '../shared'
import { dayOf, type GameData, type GameState, type Monster, type RogueFusionState } from '../model'
import { addItems, removeItems } from '../inventory'
import {
  capacityOf,
  floorGeneMultiplier,
  hasPartyRoom,
  hasRosterRoom,
  starterSlotPool
} from '../registries'
import { rollBootleg, startHistory, withBootleg } from '../monster'
import { rollMonster } from '../world'
import { releaseMonster } from './rosterActions'
import { locateOwned } from './owned'

/** Rogue Fusion lúc bắt đầu: chưa có điềm báo, chưa nhận quà; `starterAlternatives` lúc tạo game. */
export const newRogueFusionState = (starterAlternatives: string[] = []): RogueFusionState => ({
  omen: { candle: null, hack: false },
  houseGiftClaimed: false,
  questGiftClaimed: false,
  starterAlternatives
})

function requireNoBattle(state: GameState): void {
  if (state.battle) throw new ActionError('inBattle')
}

function requireTown(state: GameState): void {
  requireNoBattle(state)
  if (state.location.type !== 'town') throw new ActionError('notInTown')
}

/**
 * Ritual Candle (ngoài trận): hiến một quái của ta (thả như `releaseMonster`: khóa, bản mệnh, đồ về
 * túi); Rogue Fusion kế tiếp chắc chắn có thành phần Bootleg cùng loài hoặc cùng hệ quái đã hiến.
 */
export function lightRitualCandle(
  data: GameData,
  state: GameState,
  { monsterId, discardOverflow }: { monsterId: string; discardOverflow?: boolean }
): GameState {
  requireNoBattle(state)
  const candleId = data.config.rogueFusion.ritualCandleItemId
  if (state.rogueFusion.omen.candle) throw new ActionError('omenActive', { omen: 'candle' })
  const { monster } = locateOwned(state, monsterId)
  const paid = { ...state, inventory: removeItems(state.inventory, candleId, 1) }
  const released = releaseMonster(data, paid, { monsterId, discardOverflow })
  const candle = { speciesId: monster.baseSpeciesId, elementId: monster.elementIds[0] ?? null }
  return {
    ...released,
    rogueFusion: { ...released.rogueFusion, omen: { ...released.rogueFusion.omen, candle } }
  }
}

/**
 * Hacking Glove (ngoài trận): tốn 1 Cyber Material, Rogue Fusion kế tiếp có một thành phần thành
 * Bootleg hệ ngẫu nhiên (đè Ritual Candle, nến vẫn giữ cho lần sau).
 */
export function hackRogueFusion(data: GameData, state: GameState): GameState {
  requireNoBattle(state)
  const { hackingGloveItemId, cyberMaterialItemId } = data.config.rogueFusion
  if ((state.inventory.stacks[hackingGloveItemId] ?? 0) === 0) {
    throw new ActionError('notEnoughItem', { itemId: hackingGloveItemId, have: 0, need: 1 })
  }
  if (state.rogueFusion.omen.hack) throw new ActionError('omenActive', { omen: 'hack' })
  return {
    ...state,
    inventory: removeItems(state.inventory, cyberMaterialItemId, 1),
    rogueFusion: { ...state.rogueFusion, omen: { ...state.rogueFusion.omen, hack: true } }
  }
}

/** Đổi Fused Material lấy vật phẩm ở thị trấn (như Ranger Wilma của gốc). */
export function exchangeFusedMaterial(
  data: GameData,
  state: GameState,
  { itemId, count }: { itemId: string; count: number }
): GameState {
  requireTown(state)
  if (!Number.isSafeInteger(count) || count < 1)
    throw malformedAction('count phải là số nguyên ≥ 1')
  const offer = data.config.rogueFusion.exchange.find((entry) => entry.itemId === itemId)
  if (!offer) throw new ActionError('notExchangeable', { itemId })
  const cost = offer.cost * count
  if (!Number.isSafeInteger(cost)) throw malformedAction('count quá lớn')
  const spent = removeItems(state.inventory, data.config.rogueFusion.fusedMaterialItemId, cost)
  return { ...state, inventory: addItems(spent, itemId, count) }
}

/** Loài quái thường của các map đã mở (không trùng): quà nhà Bootleg. */
function openedMapSpecies(data: GameData, state: GameState): string[] {
  const ids = new Set<string>()
  for (const biomeId of state.floorBiomeIds) {
    for (const entry of data.biomes[biomeId]?.encounters ?? []) {
      if (data.species[entry.speciesId]?.kind === 'normal') ids.add(entry.speciesId)
    }
  }
  return [...ids]
}

/** Quái quà Bootleg loài `speciesId` level `level`, đã khế ước như quái nhận được, có lý lịch. */
function giftMonster(
  data: GameData,
  state: GameState,
  { speciesId, level, gift }: { speciesId: string; level: number; gift: 'house' | 'quest' }
): [Monster, RngState] {
  let [monster, rng] = rollMonster(
    data,
    state.rng,
    {
      encounters: [{ speciesId, weight: 1 }],
      levelMin: level,
      levelMax: level,
      geneMultiplier: floorGeneMultiplier(data, 1),
      shinyChance: 0,
      bootlegChance: 0,
      aging: state.options.lifespanEnabled
    },
    `m${state.nextMonsterId}`
  )
  const species = data.species[speciesId]
  if (species.kind === 'normal') {
    let elementId: string | null
    ;[elementId, rng] = rollBootleg(data, rng, { species, chance: 100 })
    monster = withBootleg(monster, elementId)
  }
  const owned = startHistory(
    { ...monster, affinity: data.config.affinity.start.caught },
    { kind: 'bootlegGift', gift },
    { day: dayOf(state.time), floor: null, level }
  )
  return [owned, rng]
}

/** Thêm quái quà vào đội (còn ô) hoặc kho; hết chỗ thì rosterFull. */
function receiveGift(data: GameData, state: GameState, monster: Monster, rng: RngState): GameState {
  if (!hasRosterRoom(data, state, { newcomer: monster })) {
    throw new ActionError('rosterFull', { capacity: capacityOf(data, state, 'storage') })
  }
  const base = { ...state, rng, nextMonsterId: state.nextMonsterId + 1 }
  return hasPartyRoom(data, state.party, monster)
    ? { ...base, party: [...state.party, monster] }
    : { ...base, storage: [...state.storage, monster] }
}

/** Nhà Bootleg ở thị trấn (gốc: Harbourtown): một lần, một quái Bootleg của các map đã mở. */
export function claimBootlegHouseGift(data: GameData, state: GameState): GameState {
  requireTown(state)
  if (state.rogueFusion.houseGiftClaimed) throw new ActionError('giftClaimed', { gift: 'house' })
  const pool = openedMapSpecies(data, state)
  if (pool.length === 0) throw new ActionError('giftUnavailable', { gift: 'house' })
  const [speciesId, afterPick] = pick(state.rng, pool)
  const [monster, rng] = giftMonster(
    data,
    { ...state, rng: afterPick },
    { speciesId, level: data.config.rogueFusion.houseGiftLevel, gift: 'house' }
  )
  const next = receiveGift(data, state, monster, rng)
  return { ...next, rogueFusion: { ...next.rogueFusion, houseGiftClaimed: true } }
}

/**
 * Quà bảng nhiệm vụ (gốc: bảng Ranger cấp 5): đủ `questGiftQuests` nhiệm vụ đã hoàn thành thì một lần
 * nhận Bootleg của loài khởi đầu không chọn (save không có thì loài khởi đầu ngẫu nhiên của các ô).
 */
export function claimQuestBootlegGift(data: GameData, state: GameState): GameState {
  requireTown(state)
  const { questGiftQuests } = data.config.rogueFusion
  if (state.rogueFusion.questGiftClaimed) throw new ActionError('giftClaimed', { gift: 'quest' })
  const have = state.stats.questsCompleted
  if (have < questGiftQuests) throw new ActionError('giftLocked', { need: questGiftQuests, have })
  const pool =
    state.rogueFusion.starterAlternatives.length > 0
      ? state.rogueFusion.starterAlternatives
      : data.config.starter.slots.flatMap((slot) => starterSlotPool(data, slot))
  if (pool.length === 0) throw new ActionError('giftUnavailable', { gift: 'quest' })
  const [speciesId, afterPick] = pick(state.rng, pool)
  const [monster, rng] = giftMonster(
    data,
    { ...state, rng: afterPick },
    { speciesId, level: data.config.starter.level, gift: 'quest' }
  )
  const next = receiveGift(data, state, monster, rng)
  return { ...next, rogueFusion: { ...next.rogueFusion, questGiftClaimed: true } }
}
