// Câu cá và khai thác trên tầng (docs/rules/gathering.md): cần map có chỗ câu / mỏ và dụng cụ (bùa
// cấp cần câu / cuốc); tung trận (quái của map hợp cách thu thập) hoặc / và bảng vật phẩm theo cấp
// dụng cụ.
// Trận là trận đặc biệt 'gathering' (SPECIAL_BATTLE_RULES); thời gian tính ở reducer.

import { ActionError, malformedAction, rollPercent, type RngState } from '../shared'
import { addItems, getItemCount, removeItems, rollChestItems } from '../inventory'
import {
  GATHERING_METHOD_RULES,
  gatheringEncounters,
  gatheringItems,
  gatheringTierConfig,
  gatheringToolTier
} from '../registries'
import { generateGatheringEncounter } from '../world'
import type {
  FishingLureItem,
  GameData,
  GameState,
  GatheringEncounter,
  GatheringMethod,
  ItemReward
} from '../model'
import type { FloorSite } from '../world'
import { openBattle } from './openBattle'
import { requireBattleStart } from './battleActions'

/** Trọng số sau cấp dụng cụ: weight ^ số mũ (< 1 thì loài / món hiếm dễ ra hơn). */
const withRarity = <T extends { weight: number }>(entries: readonly T[], exponent: number): T[] =>
  entries.map((entry) => ({ ...entry, weight: entry.weight > 0 ? entry.weight ** exponent : 0 }))

/** Mồi câu dùng cho lần câu này (đã kiểm tra loại và số lượng); null = không dùng. */
function requireLure(
  data: GameData,
  state: GameState,
  { method, lureItemId }: { method: GatheringMethod; lureItemId: unknown }
): FishingLureItem | null {
  if (lureItemId === undefined) return null
  if (typeof lureItemId !== 'string') throw malformedAction('lureItemId phải là chuỗi')
  if (!GATHERING_METHOD_RULES[method].usesLure) {
    throw malformedAction(`${method} không dùng mồi câu`)
  }
  const item = data.items[lureItemId]
  if (!item) throw new ActionError('unknownItem', { itemId: lureItemId })
  if (item.category !== 'fishingLure')
    throw new ActionError('notFishingLure', { itemId: lureItemId })
  const have = getItemCount(state.inventory, lureItemId)
  if (have < 1) throw new ActionError('notEnoughItem', { itemId: lureItemId, have, need: 1 })
  return item
}

/** Tung bảng vật phẩm của cách thu thập ở map này theo cấp dụng cụ. */
function rollGatheringItems(
  data: GameData,
  rng: RngState,
  {
    site,
    method,
    tier,
    exponent,
    options
  }: {
    site: FloorSite
    method: GatheringMethod
    tier: number
    exponent: number
    options: GameState['options']
  }
): [ItemReward[], RngState] {
  const entries = withRarity(gatheringItems(data, { biome: site.biome, method, tier }), exponent)
  const rolls = gatheringTierConfig(data, method, tier).itemRolls
  return rollChestItems(data, rng, { entries, rolls, options })
}

/**
 * Câu cá / khai thác một lần ở tầng đang đứng (ngoài trận, còn quái đánh được): map có chỗ thu thập
 * của cách đó (gatheringUnavailable), có dụng cụ (gatheringToolMissing), mồi câu (nếu có) mất một
 * cái. Tung battleChance: câu cá ra trận thì không có vật phẩm; khai thác luôn đào ra vật phẩm rồi
 * mới bị phục kích. Trận: một quái của map hợp cách thu thập (gatheringEncounters), level theo cấp
 * dụng cụ.
 */
export function gather(
  data: GameData,
  state: GameState,
  { method, lureItemId }: { method: GatheringMethod; lureItemId?: unknown }
): GameState {
  const site = requireBattleStart(data, state)
  if (!site.biome.gathering?.[method]) {
    throw new ActionError('gatheringUnavailable', { method, biomeId: site.biome.id })
  }
  const tier = gatheringToolTier(data, state.inventory, method)
  if (tier < 1) throw new ActionError('gatheringToolMissing', { method })
  const lure = requireLure(data, state, { method, lureItemId })

  const rule = GATHERING_METHOD_RULES[method]
  const tierConfig = gatheringTierConfig(data, method, tier)
  const exponent = tierConfig.rarityExponent * (lure?.rarityFactor ?? 1)
  const [hasBattle, rolled] = rollPercent(state.rng, data.config.gathering[method].battleChance)
  let rng = rolled
  let items: ItemReward[] = []
  if (!hasBattle || rule.itemsWithBattle) {
    ;[items, rng] = rollGatheringItems(data, rng, {
      site,
      method,
      tier,
      exponent,
      options: state.options
    })
  }
  const encounterKind: GatheringEncounter = !hasBattle ? 'none' : rule.ambush ? 'ambush' : 'bite'
  let inventory = lure ? removeItems(state.inventory, lure.id, 1) : state.inventory
  inventory = items.reduce((inv, { itemId, count }) => addItems(inv, itemId, count), inventory)
  const next: GameState = {
    ...state,
    rng,
    inventory,
    gathering: {
      lastResult: { method, tier, lureItemId: lure?.id ?? null, items, encounter: encounterKind }
    }
  }
  if (!hasBattle) return next
  const encounters = withRarity(gatheringEncounters(data, site.biome, method), exponent)
  const encounter = generateGatheringEncounter(data, rng, {
    site,
    encounters,
    levelOffset: tierConfig.levelOffset,
    nextMonsterId: state.nextMonsterId
  })
  return openBattle(data, next, {
    site,
    encounter,
    special: { kind: 'gathering', method, ambush: rule.ambush }
  })
}
