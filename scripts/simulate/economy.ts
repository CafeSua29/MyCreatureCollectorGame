// Kinh tế và việc nhỏ của "người chơi" trong chơi liên tục (mục "Kinh tế" ở simulation-features.md):
// bán đồ dư ở cửa hàng (giá thị trường động), mua món dùng được ở cửa hàng tạm của event (thương
// nhân, chợ đen), cho ăn vật phẩm thân mật, cầm đá Mega khi có Vòng Mega, cầm Z-Crystal khi có
// Vòng Z, mua ô linh điền khi rẻ, mở rộng kho quái / túi trang bị khi gần đầy.
// Mọi việc đi qua action thật.

import {
  CAPACITY_KINDS,
  EQUIPMENT_RARITIES,
  capacityExpandCost,
  capacityView,
  STAT_NAMES,
  ActionError,
  assertCanContract,
  computeStats,
  contractChance,
  contractOutcome,
  dayOf,
  dexOwnedPercent,
  equipmentSlotCount,
  gameReducer,
  isShopOpen,
  heldZCrystals,
  itemBuyPrice,
  megaStonesOf,
  nextPlotPrice,
  pickZCrystalFor,
  tempShopPrice,
  type GameAction,
  type GameData,
  type GameState,
  type HeldItem,
  type Item,
  type Monster
} from '@core'
import { shopStock, simAct } from './events'
import { isDeityCurrency } from './deities'

/** Giả định của "người chơi" (không phải luật game). */
export const ECONOMY_POLICY = {
  /** Giữ tối đa số này mỗi loại nguyên liệu (material), dư thì bán. */
  materialKeep: 20,
  /** Chỉ mua ở cửa hàng tạm món có giá ≤ phần này của tiền. */
  tempShopSpendFraction: 0.3,
  /** Số tối đa mỗi món gộp chồng mua ở cửa hàng tạm. */
  tempShopMaxCount: 3,
  /** Trang bị ở cửa hàng tạm: mua từ bậc này trở lên. */
  tempShopMinRarity: 'epic',
  /** Mua ô linh điền khi giá ≤ phần này của tiền. */
  plotSpendFraction: 0.2,
  /** Mở rộng kho quái / túi trang bị khi còn ≤ số chỗ này và giá ≤ capacitySpendFraction tiền. */
  capacityMargin: 5,
  capacitySpendFraction: 0.2,
  /** Khế ước quái đội mẫu chưa khế ước khi tỉ lệ thành công ≥ số này (%), tránh phản phệ / bỏ trốn. */
  minContractChance: 60
} as const

export interface EconomyCount {
  /** Số món đã bán / tiền thu được (cộng dồn kiểu number cho bảng). */
  itemsSold: number
  tempShopBought: number
  affinityItemsUsed: number
  megaStonesHeld: number
  /** Số lần quái đội mẫu cầm Z-Crystal (holdZCrystals, z-moves.md). */
  zCrystalsHeld: number
  /** Số đồ cầm tăng bậc chí mạng đã mua và cầm (holdCritItems, equipment.md). */
  critItemsHeld: number
  plotsBought: number
  /** Số lần kết bản mệnh thú (bindBondWhenPossible). */
  bondsBound: number
  /** Khế ước (contractTeamWhenPossible): thành công, thất bại, quái bỏ trốn. */
  contracts: number
  contractFails: number
  contractEscapes: number
  /** Mốc Bộ sưu tập đã nhận (claimDexRewardsWhenPossible). */
  dexRewards: number
  /** NPC tinh thể trait (traitCrystals.ts): trait xấu đã gỡ, lần inject, tinh thể mua để inject. */
  traitsExtracted: number
  traitsInjected: number
  crystalsBought: number
  /** Quái phụ đã hiến tế (sacrifice.ts). */
  sacrifices: number
  /** Cấy ghép (implant.ts): lần thành công, thất bại; tỉ trọng cấy ghép trong bước gốc (%, lần đo cuối). */
  implants: number
  implantFails: number
  /** Lần cấy là huyết thanh hiệu ứng (gồm cả thất bại). */
  implantEffects: number
  implantSharePercent: number
  /** Sức chứa (expandCapacityWhenFull): lần mở rộng; chỗ dùng cao nhất thấy ở thị trấn. */
  capacityExpansions: number
  storagePeak: number
  bagPeak: number
  /** Thần linh (deities.ts): nén hương đã dâng, món đổi bằng tín vật, bậc ân sủng cao nhất lúc mở tầng. */
  incense: number
  deityBuys: number
  favorRank: number
}

export const newEconomyCount = (): EconomyCount => ({
  itemsSold: 0,
  tempShopBought: 0,
  affinityItemsUsed: 0,
  megaStonesHeld: 0,
  zCrystalsHeld: 0,
  critItemsHeld: 0,
  plotsBought: 0,
  bondsBound: 0,
  contracts: 0,
  contractFails: 0,
  contractEscapes: 0,
  dexRewards: 0,
  traitsExtracted: 0,
  traitsInjected: 0,
  crystalsBought: 0,
  sacrifices: 0,
  implants: 0,
  implantFails: 0,
  implantEffects: 0,
  implantSharePercent: 0,
  capacityExpansions: 0,
  storagePeak: 0,
  bagPeak: 0,
  incense: 0,
  deityBuys: 0,
  favorRank: 0
})

type Act = (data: GameData, state: GameState, action: GameAction) => GameState

/** Hiệu ứng (loại) của một vật phẩm tiêu hao. */
const effectTypes = (item: Item): string[] =>
  item.category === 'consumable' ? item.effects.map((effect) => effect.type) : []

/**
 * Ở thị trấn (cửa hàng mở): bán mọi trang bị còn trong túi (tự lắp đã lấy món tốt nhất), bán nguyên
 * liệu dư quá materialKeep mỗi loại. Giá theo thị trường động (bán nhiều thì giá tụt).
 */
export function sellSurplus(data: GameData, state: GameState, count: EconomyCount): GameState {
  if (state.location.type !== 'town' || state.battle || !isShopOpen(state)) return state
  for (const instance of state.inventory.equipment) {
    state = simAct(data, state, {
      type: 'sellItem',
      item: { storage: 'instance', instanceId: instance.id },
      count: 1
    })
    count.itemsSold++
  }
  for (const [itemId, have] of Object.entries(state.inventory.stacks)) {
    const item = data.items[itemId]
    const extra = have - ECONOMY_POLICY.materialKeep
    if (item?.category !== 'material' || extra <= 0) continue
    if (isForgeStone(data, itemId) || isDeityCurrency(data, itemId)) continue
    state = simAct(data, state, {
      type: 'sellItem',
      item: { storage: 'stack', itemId },
      count: extra
    })
    count.itemsSold += extra
  }
  return state
}

/** Đá của Thợ rèn: giữ hết để cường hóa (forge.ts), không bán. */
const isForgeStone = (data: GameData, itemId: string): boolean =>
  itemId === data.config.forge.enhanceStoneItemId ||
  itemId === data.config.forge.refiningStoneItemId

/** Món gộp chồng mô phỏng biết dùng: bóng, bùa fuse, kẹo / thuốc / thân mật, Bí Cảnh Lệnh, trận đồ, đan phương. */
function isUsefulStack(data: GameData, item: Item): boolean {
  switch (item.category) {
    case 'ball':
    case 'fusionAid':
    case 'formationScroll':
    case 'recipeScroll':
      return true
    case 'material':
      return (
        item.id === data.config.trials.tokenItemId ||
        item.id === data.config.rebirth.pillItemId ||
        isDeityCurrency(data, item.id)
      )
    case 'consumable':
      return effectTypes(item).some((type) =>
        ['addExp', 'levelUp', 'healPercent', 'revive', 'addAffinity'].includes(type)
      )
    default:
      return false
  }
}

/**
 * Cửa hàng tạm của event ở chỗ đang đứng: mua món dùng được (isUsefulStack, tối đa
 * tempShopMaxCount mỗi món) và trang bị từ tempShopMinRarity, giá ≤ tempShopSpendFraction tiền.
 * Gọi ngay sau khi giải quyết event (act = gameReducer).
 */
export function buyFromTempShop(
  data: GameData,
  state: GameState,
  count: EconomyCount,
  act: Act = gameReducer
): GameState {
  const shop = state.events.tempShop
  const here = state.location.type === 'floor' ? state.location.floor : null
  if (!shop || shop.floor !== here || state.battle) return state
  const minRarity = EQUIPMENT_RARITIES.indexOf(ECONOMY_POLICY.tempShopMinRarity)
  for (const { entry, remaining } of shop.stock) {
    let item: GameAction | null = null
    if (entry.storage === 'instance') {
      if (EQUIPMENT_RARITIES.indexOf(entry.instance.rarity) < minRarity) continue
      item = {
        type: 'buyEventItem',
        item: { storage: 'instance', instanceId: entry.instance.id },
        count: 1
      }
    } else if (entry.storage === 'stack' && isUsefulStack(data, data.items[entry.itemId])) {
      const want = Math.min(
        remaining ?? ECONOMY_POLICY.tempShopMaxCount,
        ECONOMY_POLICY.tempShopMaxCount
      )
      item = { type: 'buyEventItem', item: entry, count: want }
    }
    if (!item || item.type !== 'buyEventItem') continue
    const price = tempShopPrice(data, state, { entry, priceMultiplier: shop.priceMultiplier })
    if (price.times(item.count).gt(state.money.times(ECONOMY_POLICY.tempShopSpendFraction)))
      continue
    state = act(data, state, item)
    count.tempShopBought += item.count
  }
  return state
}

/** Vật phẩm thân mật (hiệu ứng addAffinity) trong túi, ít điểm trước. */
function affinityItems(data: GameData, state: GameState): string[] {
  return Object.entries(state.inventory.stacks)
    .filter(([id, have]) => have > 0 && effectTypes(data.items[id]).includes('addAffinity'))
    .map(([id]) => id)
}

/** Cho quái đội mẫu chưa đầy thân mật ăn vật phẩm thân mật trong túi (quái thấp nhất trước). */
export function feedAffinityItems(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  count: EconomyCount
): GameState {
  const { max } = data.config.affinity
  for (const itemId of affinityItems(data, state)) {
    for (let tries = 0; tries < 20; tries++) {
      if ((state.inventory.stacks[itemId] ?? 0) <= 0) break
      const lowest = state.party
        .filter((m) => teamIds.has(m.id) && m.affinity < max && m.assignment === null)
        .sort((a, b) => a.affinity - b.affinity)[0]
      if (!lowest) return state
      state = simAct(data, state, { type: 'useItem', itemId, monsterId: lowest.id })
      count.affinityItemsUsed++
    }
  }
  return state
}

/** Ô có trang bị kém nhất (giá gốc thấp nhất, bậc thấp nhất) để nhường chỗ cho đá Mega. */
/** Ô trang bị (món riêng) bậc thấp nhất của quái; null = không có món riêng. */
export function weakestGearSlot(monster: Monster): number | null {
  let worst: { index: number; rank: number } | null = null
  monster.equipment.forEach((entry, index) => {
    if (entry.storage !== 'instance') return
    const rank = EQUIPMENT_RARITIES.indexOf(entry.instance.rarity)
    if (!worst || rank < worst.rank) worst = { index, rank }
  })
  return worst === null ? null : (worst as { index: number }).index
}

/**
 * Có vật phẩm chìa khóa của đá Mega (Vòng Mega) thì quái đội mẫu cầm đá Mega của loài nó có trong túi
 * (thay trang bị kém nhất nếu hết ô), để AI Mega trong trận.
 */
export function holdMegaStones(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  count: EconomyCount
): GameState {
  for (const monster of state.party) {
    if (!teamIds.has(monster.id)) continue
    const stone = megaStonesOf(data, monster.speciesId).find(
      (item) =>
        (state.inventory.stacks[item.id] ?? 0) > 0 &&
        (item.requiresKeyItemId === undefined ||
          (state.inventory.stacks[item.requiresKeyItemId] ?? 0) > 0)
    )
    if (!stone) continue
    if (monster.equipment.some((e) => e.storage === 'stack' && e.itemId === stone.id)) continue
    if (monster.equipment.length >= equipmentSlotCount(data, state)) {
      // Hết ô: tháo trang bị kém nhất rồi cầm đá.
      const slot = weakestGearSlot(monster)
      if (slot === null) continue
      state = simAct(data, state, { type: 'unequipItem', monsterId: monster.id, slotIndex: slot })
    }
    state = simAct(data, state, {
      type: 'equipItem',
      monsterId: monster.id,
      item: { storage: 'stack', itemId: stone.id }
    })
    count.megaStonesHeld++
  }
  return state
}

/**
 * Có Vòng Z: quái đội mẫu chưa cầm Z-Crystal cầm crystal hợp skill có trong túi (pickZCrystalFor;
 * thay trang bị kém nhất nếu hết ô), để AI dùng Z-Move trong trận (docs/rules/z-moves.md).
 */
export function holdZCrystals(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  count: EconomyCount
): GameState {
  if ((state.inventory.stacks[data.config.transform.zMove.keyItemId] ?? 0) === 0) return state
  for (const monster of state.party) {
    if (!teamIds.has(monster.id) || heldZCrystals(data, monster).length > 0) continue
    const crystal = pickZCrystalFor(data, monster, {
      isAvailable: (item) => (state.inventory.stacks[item.id] ?? 0) > 0
    })
    if (!crystal) continue
    if (monster.equipment.length >= equipmentSlotCount(data, state)) {
      const slot = weakestGearSlot(monster)
      if (slot === null) continue
      state = simAct(data, state, { type: 'unequipItem', monsterId: monster.id, slotIndex: slot })
    }
    state = simAct(data, state, {
      type: 'equipItem',
      monsterId: monster.id,
      item: { storage: 'stack', itemId: crystal.id }
    })
    count.zCrystalsHeld++
  }
  return state
}

/** Bậc chí mạng của đồ cầm không tiêu hao với quái này (0 = không phải đồ chí mạng / sai loài). */
function critStagesOf(item: Item | undefined, monster: Monster): number {
  if (item?.category !== 'held' || !item.persistent) return 0
  if (item.speciesIds && !item.speciesIds.includes(monster.baseSpeciesId)) return 0
  return item.hooks.reduce(
    (sum, hook) =>
      hook.type === 'critStage' ? sum + (hook.params as { stages: number }).stages : sum,
    0
  )
}

/**
 * Ở thị trấn: quái đội mẫu chưa cầm đồ cầm tăng bậc chí mạng (Razor Claw, Leek...) mua món tốt nhất
 * cửa hàng đang bán cho nó và cầm vào ô trống (không thay trang bị).
 */
export function holdCritItems(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  count: EconomyCount
): GameState {
  if (state.location.type !== 'town' || state.battle) return state
  for (const monster of state.party) {
    if (!teamIds.has(monster.id)) continue
    const holding = monster.equipment.some(
      (e) => e.storage === 'stack' && critStagesOf(data.items[e.itemId], monster) > 0
    )
    if (holding || monster.equipment.length >= equipmentSlotCount(data, state)) continue
    const best = shopStock(state)
      .flatMap((entry) => (entry.storage === 'stack' ? [data.items[entry.itemId]] : []))
      .filter((item): item is HeldItem => critStagesOf(item, monster) > 0)
      .sort((a, b) => critStagesOf(b, monster) - critStagesOf(a, monster))[0]
    if (!best) continue
    const item = { storage: 'stack', itemId: best.id } as const
    if (state.money.lt(itemBuyPrice(data, item, state.highestFloor))) continue
    state = simAct(data, state, { type: 'buyItem', item, count: 1 })
    state = simAct(data, state, { type: 'equipItem', monsterId: monster.id, item })
    count.critItemsHeld++
  }
  return state
}

/**
 * Ở thị trấn: chưa có bản mệnh thú (hoặc bản mệnh đã chết) thì kết với quái đội mẫu có tổng chỉ số
 * cao nhất trong các quái đủ thân mật, rảnh (docs/rules/tamer.md mục "Bản mệnh thú"). Không đổi bản
 * mệnh khi đã có (đổi tốn tiền và thân mật).
 */
export function bindBondWhenPossible(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  count: EconomyCount
): GameState {
  if (state.location.type !== 'town' || state.battle) return state
  if ([...state.party, ...state.storage].some((m) => m.bond)) return state
  const { minAffinity, rebindCooldownDays } = data.config.bond
  const { bondDay } = state.tamer
  if (bondDay !== null && dayOf(state.time) < bondDay + rebindCooldownDays) return state
  const total = (m: Monster): number => {
    const final = computeStats(data, m).final
    return STAT_NAMES.reduce((sum, stat) => sum + final[stat].toNumber(), 0)
  }
  const best = state.party
    .filter((m) => teamIds.has(m.id) && m.affinity >= minAffinity && m.assignment === null)
    .sort((a, b) => total(b) - total(a))[0]
  if (!best) return state
  count.bondsBound++
  return simAct(data, state, { type: 'bindBond', monsterId: best.id })
}

/**
 * Ở thị trấn: khế ước quái đội mẫu chưa khế ước (quái mới từ trứng / bắt; docs/rules/tamer.md mục
 * "Khế ước") khi khế ước được và tỉ lệ ≥ minContractChance. Thất bại thì ngự thú sư bị phản phệ
 * nên dừng (lần sau về thị trấn thử tiếp).
 */
export function contractTeamWhenPossible(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  count: EconomyCount
): GameState {
  if (state.location.type !== 'town' || state.battle) return state
  const candidates = [...state.party, ...state.storage].filter(
    (m) => teamIds.has(m.id) && m.contractRealm === null && m.assignment === null
  )
  for (const monster of candidates) {
    try {
      assertCanContract(data, state, monster)
    } catch (error) {
      if (error instanceof ActionError) continue
      throw error
    }
    if (contractChance(data, monster, state.tamer.realm) < ECONOMY_POLICY.minContractChance)
      continue
    const before = state
    state = simAct(data, state, { type: 'formContract', monsterId: monster.id })
    const outcome = contractOutcome(before, state, monster.id)
    if (outcome === 'success') {
      count.contracts++
      continue
    }
    count.contractFails++
    if (outcome === 'escaped') count.contractEscapes++
    return state
  }
  return state
}

/** Nhận mọi mốc Bộ sưu tập đã đủ % mà chưa nhận (docs/rules/dex.md). */
export function claimDexRewardsWhenPossible(
  data: GameData,
  state: GameState,
  count: EconomyCount
): GameState {
  if (state.battle) return state
  const percent = dexOwnedPercent(data, state.dex)
  for (const milestone of data.config.dex.milestones) {
    if (percent < milestone.percent || state.dex.claimedMilestones.includes(milestone.id)) continue
    state = simAct(data, state, { type: 'claimDexReward', milestoneId: milestone.id })
    count.dexRewards++
  }
  return state
}

/** Ở thị trấn: mua thêm ô linh điền khi giá ≤ plotSpendFraction tiền. */
export function buyPlotWhenCheap(data: GameData, state: GameState, count: EconomyCount): GameState {
  if (state.location.type !== 'town' || state.battle) return state
  const price = nextPlotPrice(data, state)
  if (price.gt(state.money.times(ECONOMY_POLICY.plotSpendFraction))) return state
  count.plotsBought++
  return simAct(data, state, { type: 'buyPlot' })
}

/**
 * Ở thị trấn: ghi chỗ dùng cao nhất của kho / túi; loại nào còn ≤ capacityMargin chỗ thì mở rộng khi
 * giá ≤ capacitySpendFraction tiền (docs/rules/capacity.md).
 */
export function expandCapacityWhenFull(
  data: GameData,
  state: GameState,
  count: EconomyCount
): GameState {
  if (state.location.type !== 'town' || state.battle) return state
  const view = capacityView(data, state)
  count.storagePeak = Math.max(count.storagePeak, view.storage.used)
  count.bagPeak = Math.max(count.bagPeak, view.bag.used)
  for (const kind of CAPACITY_KINDS) {
    const { used, capacity } = view[kind]
    if (capacity - used > ECONOMY_POLICY.capacityMargin) continue
    const cost = capacityExpandCost(data, state, kind)
    if (cost.gt(state.money.times(ECONOMY_POLICY.capacitySpendFraction))) continue
    state = simAct(data, state, { type: 'expandCapacity', kind })
    count.capacityExpansions++
  }
  return state
}
