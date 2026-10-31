// "Người chơi" dùng NPC tinh thể trait ở thị trấn (mục "Tinh thể trait" ở simulation-features.md,
// docs/rules/trait-crystals.md): gỡ trait xấu của đội mẫu (extract rồi bán tinh thể), rồi inject
// tinh thể trait tốt có trong túi, rồi mua tinh thể trait tốt ở cửa hàng để inject; mọi lần chỉ làm
// khi tổng giá ≤ spendFraction tiền. Chỉ inject khi gộp cấp hoặc còn ô trống, không inject tinh thể
// loại trừ với trait đang có (sẽ bỏ cả hai).

import {
  crystalExtractCost,
  crystalInjectCost,
  itemBuyPrice,
  toBig,
  usedTraitSlots,
  type Decimal,
  type GameData,
  type GameState,
  type Monster,
  type StackableItemRef
} from '@core'
import { shopStock, simAct } from './events'

export const TRAIT_CRYSTAL_POLICY = {
  /** Chỉ extract / inject / mua tinh thể khi tổng giá ≤ phần này của tiền. */
  spendFraction: 0.2
} as const

export interface TraitCrystalCount {
  extracted: number
  injected: number
  bought: number
}

type CrystalRef = Extract<StackableItemRef, { storage: 'crystal' }>

const isGoodTrait = (data: GameData, traitId: string): boolean =>
  data.traits[traitId].kind === 'positive' || data.traits[traitId].kind === 'rare'

const affordable = (state: GameState, cost: Decimal): boolean =>
  cost.lte(state.money.times(TRAIT_CRYSTAL_POLICY.spendFraction))

/** Cấp trait sau khi inject tinh thể lên quái; null = không inject (loại trừ hoặc hết ô). */
function levelAfterInject(data: GameData, monster: Monster, crystal: CrystalRef): number | null {
  const existing = monster.traits.find((trait) => trait.id === crystal.traitId)
  if (existing) {
    const after = existing.level + crystal.level
    return Number.isSafeInteger(after) ? after : null
  }
  const group = data.traits[crystal.traitId].exclusiveGroup
  const clash = monster.traits.some(
    (trait) => group !== undefined && data.traits[trait.id].exclusiveGroup === group
  )
  if (clash || usedTraitSlots(data, monster) >= monster.traitSlots) return null
  return crystal.level
}

/** Quái đội mẫu (trong đội, rảnh) đầu tiên inject được tinh thể, kèm giá inject. */
function injectTarget(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  crystal: CrystalRef
): { monsterId: string; cost: Decimal } | null {
  for (const monster of state.party) {
    if (!teamIds.has(monster.id) || monster.assignment !== null) continue
    const level = levelAfterInject(data, monster, crystal)
    if (level !== null) {
      return { monsterId: monster.id, cost: crystalInjectCost(data, crystal.traitId, level) }
    }
  }
  return null
}

/** Gỡ trait xấu của đội mẫu: extract rồi bán tinh thể ngay. */
function removeNegativeTraits(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  count: TraitCrystalCount
): GameState {
  for (const monster of state.party) {
    if (!teamIds.has(monster.id) || monster.assignment !== null) continue
    for (const trait of monster.traits) {
      if (data.traits[trait.id].kind !== 'negative') continue
      if (!affordable(state, crystalExtractCost(data, trait.id, trait.level))) continue
      state = simAct(data, state, {
        type: 'extractTrait',
        monsterId: monster.id,
        traitId: trait.id
      })
      const item: CrystalRef = { storage: 'crystal', traitId: trait.id, level: trait.level }
      state = simAct(data, state, { type: 'sellItem', item, count: 1 })
      count.extracted++
    }
  }
  return state
}

/** Quái đội mẫu nhận tinh thể khi đủ tiền cho giá inject + extraCost (giá mua); null = bỏ qua. */
function affordableTarget(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>,
  { crystal, extraCost }: { crystal: CrystalRef; extraCost: Decimal }
): string | null {
  const target = injectTarget(data, state, teamIds, crystal)
  if (!target || !affordable(state, target.cost.plus(extraCost))) return null
  return target.monsterId
}

/**
 * Ở thị trấn: gỡ trait xấu, inject tinh thể tốt trong túi (cấp cao trước), mua tinh thể tốt ở cửa
 * hàng rồi inject. Trả state mới và số lần đã làm.
 */
export function tuneTeamTraits(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; count: TraitCrystalCount } {
  const count: TraitCrystalCount = { extracted: 0, injected: 0, bought: 0 }
  if (state.location.type !== 'town' || state.battle) return { state, count }
  state = removeNegativeTraits(data, state, teamIds, count)
  const owned = state.inventory.crystals
    .filter((stack) => isGoodTrait(data, stack.traitId))
    .flatMap((stack) => Array.from({ length: stack.count }, () => stack))
    .sort((a, b) => b.level - a.level)
  for (const stack of owned) {
    const crystal: CrystalRef = { storage: 'crystal', traitId: stack.traitId, level: stack.level }
    const monsterId = affordableTarget(data, state, teamIds, { crystal, extraCost: toBig(0) })
    if (!monsterId) continue
    state = simAct(data, state, { type: 'injectTrait', monsterId, item: crystal })
    count.injected++
  }
  for (const entry of shopStock(state)) {
    if (entry.storage !== 'crystal' || !isGoodTrait(data, entry.traitId)) continue
    const crystal: CrystalRef = { storage: 'crystal', traitId: entry.traitId, level: entry.level }
    const price = itemBuyPrice(data, crystal, state.highestFloor)
    const monsterId = affordableTarget(data, state, teamIds, { crystal, extraCost: price })
    if (!monsterId) continue
    state = simAct(data, state, { type: 'buyItem', item: crystal, count: 1 })
    state = simAct(data, state, { type: 'injectTrait', monsterId, item: crystal })
    count.bought++
    count.injected++
  }
  return { state, count }
}
