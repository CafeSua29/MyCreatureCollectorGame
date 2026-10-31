// Bộ sưu tập (docs/rules/dex.md): ghi loài đã gặp / đã sở hữu sau mỗi action (một chỗ duy nhất thay
// cho việc gọi ở mọi cách có quái), nhận thưởng theo mốc.

import { ActionError, toBig } from '../shared'
import { addItems } from '../inventory'
import {
  dexNumber,
  dexOwnedPercent,
  isDexSpecies,
  regionalDexProgress,
  speciesBodyPlan,
  speciesSize,
  speciesWeightKg,
  type MonsterSize
} from '../registries'
import { speciesInfoText } from '../gameData'
import type { DexState, GameData, GameState, LanguageCode, Monster } from '../model'

// Câu hỏi về Dex cho UI / mô phỏng (core dùng thẳng registries).
export {
  collectionStatPercent,
  criticalCaptureMultiplier,
  dexNumber,
  dexOwnedPercent,
  dexTotal,
  isDexSpecies,
  regionalDexProgress,
  regionalDexSpecies
} from '../registries'

/** Dex lúc bắt đầu (game mới / test): chưa gặp, chưa có gì. */
export const newDexState = (): DexState => ({
  seen: [],
  owned: [],
  shinyOwned: [],
  claimedMilestones: [],
  claimedRegions: [],
  hitParts: {}
})

/** Tập id của danh sách (cache theo mảng: state không đổi mảng cũ nên cache luôn đúng). */
const setCache = new WeakMap<readonly string[], Set<string>>()

function setOf(list: readonly string[]): Set<string> {
  let set = setCache.get(list)
  if (!set) {
    set = new Set(list)
    setCache.set(list, set)
  }
  return set
}

/** Loài của quái tính vào Dex: loài hiện tại và loài gốc (quái fuse tính theo loài gốc). */
function dexSpeciesOf(data: GameData, monster: Monster): string[] {
  const ids = [monster.speciesId, monster.baseSpeciesId]
  return ids.filter((id, i) => ids.indexOf(id) === i && isDexSpecies(data.species[id]))
}

/** Thêm id chưa có vào danh sách; trả mảng cũ nếu không có gì mới (giữ cache). */
function withNew(list: string[], ids: readonly string[]): string[] {
  const known = setOf(list)
  const fresh = ids.filter((id, i) => !known.has(id) && ids.indexOf(id) === i)
  return fresh.length === 0 ? list : [...list, ...fresh]
}

/**
 * Ghi Dex theo state hiện tại: quái trong đội / kho là đã sở hữu (và đã gặp; quái shiny ghi thêm
 * shiny đã có); quái địch trong trận, quái đang gặp ở khu bảo tồn là đã gặp. Gọi sau mọi action
 * (gameReducer); không đổi thì trả state cũ.
 */
export function syncDex(data: GameData, state: GameState): GameState {
  const ownedMonsters = [...state.party, ...state.storage]
  const owned = ownedMonsters.flatMap((m) => dexSpeciesOf(data, m))
  const shiny = ownedMonsters.filter((m) => m.shinyStacks > 0).flatMap((m) => dexSpeciesOf(data, m))
  const met = [
    ...(state.battle?.enemies ?? []),
    ...(state.safari.visit ? [state.safari.visit.encounter.monster] : [])
  ].flatMap((m) => dexSpeciesOf(data, m))
  const nextOwned = withNew(state.dex.owned, owned)
  const nextSeen = withNew(state.dex.seen, [...owned, ...met])
  const nextShiny = withNew(state.dex.shinyOwned, shiny)
  if (
    nextOwned === state.dex.owned &&
    nextSeen === state.dex.seen &&
    nextShiny === state.dex.shinyOwned
  ) {
    return state
  }
  return {
    ...state,
    dex: { ...state.dex, owned: nextOwned, seen: nextSeen, shinyOwned: nextShiny }
  }
}

/** Cộng tiền × highestFloor và vật phẩm của một phần thưởng Dex. */
function grantReward(
  state: GameState,
  reward: { moneyPerFloor: number; items: Record<string, number> }
): Pick<GameState, 'money' | 'inventory'> {
  let inventory = state.inventory
  for (const [itemId, count] of Object.entries(reward.items)) {
    inventory = addItems(inventory, itemId, count)
  }
  return {
    money: state.money.plus(toBig(reward.moneyPerFloor).times(state.highestFloor)),
    inventory
  }
}

/**
 * Nhận thưởng mốc `milestoneId` (ngoài trận): đủ % loài đã sở hữu, chưa nhận. Tiền = moneyPerFloor ×
 * highestFloor, vật phẩm theo mốc.
 */
export function claimDexReward(data: GameData, state: GameState, milestoneId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  const milestone = data.config.dex.milestones.find((m) => m.id === milestoneId)
  if (!milestone) throw new ActionError('dexMilestoneNotFound', { milestoneId })
  if (state.dex.claimedMilestones.includes(milestoneId)) {
    throw new ActionError('dexRewardClaimed', { milestoneId })
  }
  const percent = dexOwnedPercent(data, state.dex)
  if (percent < milestone.percent) {
    throw new ActionError('dexMilestoneNotReached', {
      milestoneId,
      need: milestone.percent,
      have: percent
    })
  }
  return {
    ...state,
    ...grantReward(state, milestone),
    dex: { ...state.dex, claimedMilestones: [...state.dex.claimedMilestones, milestoneId] }
  }
}

/**
 * Nhận thưởng hoàn thành Dex của map `biomeId` (ngoài trận, như hoàn thành Pokédex vùng): đã sở hữu
 * mọi loài của map, chưa nhận. Thưởng chung `config.dex.regionalReward`.
 */
export function claimRegionalDexReward(
  data: GameData,
  state: GameState,
  biomeId: string
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (!Object.hasOwn(data.biomes, biomeId)) throw new ActionError('dexRegionNotFound', { biomeId })
  if (state.dex.claimedRegions.includes(biomeId)) {
    throw new ActionError('dexRegionClaimed', { biomeId })
  }
  const { owned, total } = regionalDexProgress(data, state.dex, biomeId)
  if (owned < total) throw new ActionError('dexRegionIncomplete', { biomeId, owned, total })
  return {
    ...state,
    ...grantReward(state, data.config.dex.regionalReward),
    dex: { ...state.dex, claimedRegions: [...state.dex.claimedRegions, biomeId] }
  }
}

/** Một mục của trang Bộ sưu tập (như trang loài của Pokédex). */
export interface DexEntry {
  speciesId: string
  number: number
  seen: boolean
  owned: boolean
  shinyOwned: boolean
  /** Phân loại / mô tả theo ngôn ngữ (dự phòng ngôn ngữ khác); chưa có nguồn = null. */
  category: string | null
  flavor: string | null
  weightKg: number
  /** Kích cỡ suy ra từ cân nặng (docs/rules/monster-size.md). */
  size: MonsterSize
  /** Chiều cao thật (m); chưa có số = null. */
  heightM: number | null
  /** Bộ phận của loài (luôn thấy được; docs/rules/hit-locations.md). */
  bodyParts: readonly string[]
  /** Bộ phận đã đánh trúng (đã biết có phải điểm yếu không), theo thứ tự bộ phận. */
  revealedParts: readonly string[]
  /** Điểm yếu đã khám phá (⊆ revealedParts); điểm yếu chưa đánh trúng không hiện. */
  knownWeakPoints: readonly string[]
}

/** Mục Dex của loài `speciesId` (loài thuộc Dex; không thì null). */
export function dexEntry(
  data: GameData,
  dex: DexState,
  speciesId: string,
  language: LanguageCode
): DexEntry | null {
  const species = data.species[speciesId]
  const number = dexNumber(data, speciesId)
  if (species?.kind !== 'normal' || number === null) return null
  const plan = speciesBodyPlan(data, species)
  const hit = dex.hitParts[speciesId] ?? []
  const revealedParts = plan.parts.filter((id) => hit.includes(id))
  return {
    speciesId,
    number,
    seen: setOf(dex.seen).has(speciesId),
    owned: setOf(dex.owned).has(speciesId),
    shinyOwned: setOf(dex.shinyOwned).has(speciesId),
    category: speciesInfoText(data, language, 'category', speciesId),
    flavor: speciesInfoText(data, language, 'flavor', speciesId),
    weightKg: speciesWeightKg(data, species),
    size: speciesSize(data, species),
    heightM: species.heightM ?? null,
    bodyParts: plan.parts,
    revealedParts,
    knownWeakPoints: revealedParts.filter((id) => plan.weakPoints.includes(id))
  }
}
