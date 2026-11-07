// Fuse, breeding và các cách mạnh lên khác trong chơi liên tục (mục "Fuse, breeding" ở
// simulation-features.md): "người chơi" bắt quái hoang làm nguyên liệu fuse (loài mới cho quái đội
// mẫu, cùng race / race hợp), mua bóng, fuse ở thị trấn khi đủ tỉ lệ thành công (dùng bùa có sẵn,
// mua Bùa Hộ Mệnh khi dư tiền), breeding cặp gen tốt nhất, đưa con gen tốt hơn vào đội khi nó mạnh
// hơn quái yếu nhất của đội (con lên level nhờ thám hiểm), học / chọn trận pháp, vuốt ve quái dưỡng
// dục, hồi máu bằng vật phẩm khi không hồi ở NPC được (thú triều). Mọi việc đi qua action thật.

import {
  STAT_NAMES,
  breedBlocker,
  breedCost,
  battleCatchChance,
  canSacrificeTo,
  canStarFeed,
  computeStats,
  dayOf,
  fuseSuccessChance,
  gameReducer,
  getItemCount,
  getMaxHp,
  hasPartyRoom,
  intimidateChance,
  isFainted,
  isImprintRequested,
  itemBuyPrice,
  newFusionSpecies,
  partyTeamBonuses,
  previewFusion,
  tamerSkillBlocker,
  type BallItem,
  type BattleCommand,
  type Decimal,
  type GameAction,
  type GameData,
  type GameState,
  type Monster,
  type TamerCommand
} from '@core'
import { shopStock, simAct } from './events'
import { chooseInheritance } from './lineage'

/** Giả định của "người chơi" (không phải luật game). */
export const GROWTH_POLICY = {
  /** Số quái nguyên liệu fuse tối đa giữ trong kho (đủ thì thôi bắt). */
  maxFodder: 4,
  /** Chỉ ném bóng khi tỉ lệ bắt ≥ % này. */
  minCatchChance: 10,
  /** Số bóng muốn có trong túi (mua thêm ở thị trấn). */
  ballsWanted: 10,
  /** Bắt / giữ nguyên liệu có tỉ lệ fuse (không bùa) ≥ % này (cùng race hoặc race hợp). */
  minFuseChance: 50,
  /** Fuse không Bùa Hộ Mệnh chỉ khi tỉ lệ (đã cộng bùa) ≥ % này; thấp hơn thì phải có hộ mệnh. */
  safeFuseChance: 75,
  /** Chỉ tiêu tối đa phần này của tiền cho một lần fuse / breed / mua bùa. */
  spendFraction: 0.5,
  /** Breed lại sau ít nhất số ngày này; chỉ tiêu tối đa phần này của tiền cho một lần breed. */
  breedEveryDays: 30,
  breedSpendFraction: 0.2,
  /** Con thay quái đội mẫu khi tổng chỉ số ≥ quái yếu nhất × hệ số này. */
  promoteRatio: 1.05,
  /** Hồi máu bằng vật phẩm khi máu còn dưới % này của max HP. */
  itemHealBelowPercent: 60,
  /** Thị Uy (docs/rules/recruit.md) quái làm nguyên liệu fuse được khi tỉ lệ ≥ số này (0–1). */
  minIntimidateChance: 0.5
} as const

export interface GrowthCount {
  captures: number
  ballsThrown: number
  fuses: number
  fuseFails: number
  /** Quái đội mẫu mất vì fuse thất bại không có Bùa Hộ Mệnh. */
  teamLost: number
  breeds: number
  /** Con breeding vào đội mẫu thay quái yếu nhất. */
  promotions: number
  /** Thu phục: lần xin theo, quái thu phục được, lần Thị Uy / thành công, mồi dụ đã dùng. */
  recruitOffers: number
  recruits: number
  intimidates: number
  intimidateWins: number
  baitsUsed: number
  /** Lần bỏ qua fuse theo lý do: money (giá fuse), charmNotSold / charmTooExpensive (không đủ an toàn: cửa hàng không bán bùa / bùa quá đắt), lastMember. */
  fuseSkips: Record<string, number>
}

const skip = (count: GrowthCount, reason: string): void => {
  count.fuseSkips[reason] = (count.fuseSkips[reason] ?? 0) + 1
}

export const newGrowthCount = (): GrowthCount => ({
  captures: 0,
  ballsThrown: 0,
  fuses: 0,
  fuseFails: 0,
  teamLost: 0,
  breeds: 0,
  promotions: 0,
  recruitOffers: 0,
  recruits: 0,
  intimidates: 0,
  intimidateWins: 0,
  baitsUsed: 0,
  fuseSkips: {}
})

const statTotal = (data: GameData, monster: Monster): Decimal =>
  STAT_NAMES.reduce(
    (sum, stat) => sum.plus(computeStats(data, monster).final[stat]),
    computeStats(data, monster).final.hp.times(0)
  )

const teamOf = (state: GameState, teamIds: ReadonlySet<string>): Monster[] =>
  [...state.party, ...state.storage].filter((m) => teamIds.has(m.id))

/** Quái trong kho rảnh (không thám hiểm, không trọng thương). */
const isFree = (monster: Monster): boolean =>
  monster.assignment === null && monster.injuryBattlesLeft === 0

/**
 * Quái đội mẫu mà `candidate` làm quái phụ fuse được với tỉ lệ (không bùa) ≥ minFuseChance (thường
 * là cùng race, lineage còn ngắn).
 */
function fuseTargetFor(
  data: GameData,
  team: readonly Monster[],
  candidate: Monster
): Monster | undefined {
  return team.find(
    (member) =>
      member.id !== candidate.id &&
      newFusionSpecies(member, candidate).length > 0 &&
      fuseSuccessChance(data, member, candidate) >= GROWTH_POLICY.minFuseChance
  )
}

/**
 * Quái hoang đáng lấy về: làm nguyên liệu fuse, hoặc hiến tế được cho một quái đội mẫu (cùng race,
 * cùng lineage; sacrifice.ts), hoặc ghép sao được (cùng chuỗi tiến hóa; starRank.ts) ở lần về thị trấn
 * sau.
 */
function isWantedFodder(data: GameData, team: readonly Monster[], candidate: Monster): boolean {
  if (fuseTargetFor(data, team, candidate)) return true
  return team.some(
    (member) =>
      member.id !== candidate.id &&
      (canSacrificeTo(member, candidate) || canStarFeed(data, member, candidate))
  )
}

/** Lý lịch của quái hoang về tay người chơi (bắt bóng, thu phục). */
const WILD_ORIGINS: ReadonlySet<string> = new Set(['wild', 'boss', 'recruit'])

/** Quái bắt / thu phục về trong kho, rảnh. */
const isCaughtSpare = (monster: Monster, teamIds: ReadonlySet<string>): boolean =>
  !teamIds.has(monster.id) &&
  !monster.locked &&
  isFree(monster) &&
  WILD_ORIGINS.has(monster.history?.origin.kind ?? '')

/**
 * Quái bắt về trong kho (rảnh): còn làm nguyên liệu fuse (`fuse`, tổng chỉ số cao trước) hoặc
 * không còn cho quái đội mẫu nào (`stale`: tỉ lệ tụt vì lineage dài, quái đội mẫu đổi).
 */
export function spareFodder(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { fuse: Monster[]; stale: Monster[] } {
  const team = teamOf(state, teamIds)
  const spares = state.storage.filter((m) => isCaughtSpare(m, teamIds))
  const fuse = spares
    .filter((m) => fuseTargetFor(data, team, m))
    .sort((a, b) => statTotal(data, b).cmp(statTotal(data, a)))
  return { fuse, stale: spares.filter((m) => !fuse.includes(m)) }
}

/** Thả nguyên liệu hết dùng (spareFodder), để kho có chỗ cho nguyên liệu mới. */
export function releaseStaleFodder(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): GameState {
  for (const monster of spareFodder(data, state, teamIds).stale) {
    state = simAct(data, state, { type: 'releaseMonster', monsterId: monster.id })
  }
  return state
}

/** Số quái nguyên liệu fuse đang có trong kho. */
function fodderCount(data: GameData, state: GameState, teamIds: ReadonlySet<string>): number {
  const team = teamOf(state, teamIds)
  return state.storage.filter((m) => isCaughtSpare(m, teamIds) && fuseTargetFor(data, team, m))
    .length
}

/** Bóng trong túi có tỉ lệ bắt `target` cao nhất (null nếu không có bóng). */
function bestBall(
  data: GameData,
  state: GameState,
  { target, user }: { target: Monster; user: Monster }
): { ball: BallItem; chance: number } | null {
  const battle = state.battle
  if (!battle) return null
  let best: { ball: BallItem; chance: number } | null = null
  for (const [itemId, count] of Object.entries(state.inventory.stacks)) {
    const item = data.items[itemId]
    if (count <= 0 || item?.category !== 'ball') continue
    const chance = battleCatchChance(data, { ...state, battle }, { ball: item, target, user })
    if (!best || chance > best.chance) best = { ball: item, chance }
  }
  return best
}

/**
 * Lệnh ném bóng của lượt này (thay lệnh của ô 0): quái địch làm nguyên liệu fuse được cho quái đội
 * mẫu, tỉ lệ đủ cao, kho chưa đủ nguyên liệu. Không có thì null. Trận NPC /
 * trận không bắt được: nơi gọi không hỏi.
 */
export function captureCommand(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): BattleCommand | null {
  const battle = state.battle
  if (!battle || battle.trainer || battle.trial || battle.tribulation || battle.special) return null
  if (fodderCount(data, state, teamIds) >= GROWTH_POLICY.maxFodder) return null
  const slot = battle.playerSlots.findIndex((id) => id !== null)
  if (slot < 0) return null
  const team = teamOf(state, teamIds)
  for (const id of battle.enemySlots) {
    const target = battle.enemies.find((m) => m.id === id)
    if (!target || !isWantedFodder(data, team, target)) continue
    const user = state.party.find((m) => m.id === battle.playerSlots[slot])
    if (!user) return null
    const best = bestBall(data, state, { target, user })
    if (!best || best.chance < GROWTH_POLICY.minCatchChance) continue
    return { slot, kind: 'item', itemId: best.ball.id, targetId: target.id }
  }
  return null
}

/**
 * Lệnh Thị Uy ở lượt đầu (docs/rules/recruit.md): quái hoang làm nguyên liệu fuse được cho quái đội
 * mẫu, tỉ lệ ≥ minIntimidateChance, kho chưa đủ nguyên liệu. Không có thì null (theo AI).
 */
export function intimidateCommand(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): TamerCommand | null {
  const battle = state.battle
  if (!battle || battle.turn !== 1) return null
  const skill = Object.values(data.tamerSkills).find((s) => s.target === 'wildFoe')
  if (!skill || tamerSkillBlocker(battle.tamers.player, skill) !== null) return null
  if (fodderCount(data, state, teamIds) >= GROWTH_POLICY.maxFodder) return null
  const team = teamOf(state, teamIds)
  for (const id of battle.enemySlots) {
    const target = battle.enemies.find((m) => m.id === id)
    if (!target || !isWantedFodder(data, team, target)) continue
    if (intimidateChance(data, state, target.id) < GROWTH_POLICY.minIntimidateChance) continue
    return { skillId: skill.id, targetId: target.id }
  }
  return null
}

/** Trận thắng có quái xin theo: nhận nếu làm nguyên liệu (fuse / hiến tế) và kho chưa đủ, không thì từ chối. */
export function recruitDecision(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): GameAction | null {
  const battle = state.battle
  const offer = battle?.enemies.find((m) => m.id === battle.recruitOfferId)
  if (!offer) return null
  const wanted =
    fodderCount(data, state, teamIds) < GROWTH_POLICY.maxFodder &&
    isWantedFodder(data, teamOf(state, teamIds), offer)
  return { type: wanted ? 'acceptRecruit' : 'declineRecruit' }
}

/**
 * Ở thị trấn, khi còn thiếu nguyên liệu và chưa có mồi đang dùng: dùng mồi trong túi, không có thì
 * mua mồi rẻ nhất cửa hàng đang bán (≤ spendFraction tiền) rồi dùng.
 */
export function applyBaitWhenNeeded(
  data: GameData,
  state: GameState,
  teamIds: ReadonlySet<string>
): { state: GameState; used: number } {
  if (state.recruit.bait || fodderCount(data, state, teamIds) >= GROWTH_POLICY.maxFodder) {
    return { state, used: 0 }
  }
  const isBait = (id: string): boolean => data.items[id]?.category === 'bait'
  let bagged = Object.keys(state.inventory.stacks).find(isBait)
  if (!bagged) {
    const sold = shopStock(state)
      .flatMap((entry) => (entry.storage === 'stack' && isBait(entry.itemId) ? [entry.itemId] : []))
      .sort((a, b) =>
        itemBuyPrice(data, { storage: 'stack', itemId: a }, state.highestFloor).cmp(
          itemBuyPrice(data, { storage: 'stack', itemId: b }, state.highestFloor)
        )
      )
    for (const itemId of sold) {
      const bought = buyIfCheap(data, state, itemId)
      if (bought === state) continue
      state = bought
      bagged = itemId
      break
    }
  }
  if (!bagged) return { state, used: 0 }
  return { state: simAct(data, state, { type: 'useBait', itemId: bagged }), used: 1 }
}

/** Ở thị trấn: mua bóng (loại bắt tốt nhất cửa hàng đang bán trong tầm tiền) cho đủ ballsWanted. */
export function buyBalls(data: GameData, state: GameState): GameState {
  const have = Object.entries(state.inventory.stacks)
    .filter(([id]) => data.items[id]?.category === 'ball')
    .reduce((sum, [, count]) => sum + count, 0)
  const missing = GROWTH_POLICY.ballsWanted - have
  if (missing <= 0) return state
  const balls = shopStock(state).flatMap((entry) => {
    const item = entry.storage === 'stack' ? data.items[entry.itemId] : undefined
    return item?.category === 'ball' ? [item] : []
  })
  balls.sort((a, b) => b.catchMultiplier - a.catchMultiplier)
  for (const ball of balls) {
    const ref = { storage: 'stack', itemId: ball.id } as const
    const price = itemBuyPrice(data, ref, state.highestFloor).times(missing)
    if (price.gt(state.money.times(GROWTH_POLICY.spendFraction))) continue
    return simAct(data, state, { type: 'buyItem', item: ref, count: missing })
  }
  return state
}

/** Chạy một action (simAct ở thị trấn; gameReducer khi đang trong lúc giải quyết event). */
type Act = (data: GameData, state: GameState, action: GameAction) => GameState

/** Mua một món ở cửa hàng nếu đang bán và giá ≤ spendFraction tiền; trả state (không mua được thì cũ). */
function buyIfCheap(
  data: GameData,
  state: GameState,
  itemId: string,
  act: Act = simAct
): GameState {
  const sold = shopStock(state).some((e) => e.storage === 'stack' && e.itemId === itemId)
  const ref = { storage: 'stack', itemId } as const
  if (!sold) return state
  if (
    itemBuyPrice(data, ref, state.highestFloor).gt(state.money.times(GROWTH_POLICY.spendFraction))
  ) {
    return state
  }
  return act(data, state, { type: 'buyItem', item: ref, count: 1 })
}

/** Bùa trong túi theo hiệu ứng: bùa tăng tỉ lệ mạnh nhất, Bùa Hộ Mệnh. */
function charmsInBag(data: GameData, state: GameState): { boost?: string; protect?: string } {
  let boost: { id: string; points: number } | undefined
  let protect: string | undefined
  for (const [id, count] of Object.entries(state.inventory.stacks)) {
    const item = data.items[id]
    if (count <= 0 || item?.category !== 'fusionAid') continue
    for (const effect of item.effects) {
      if (effect.type === 'fuseProtect') protect = id
      const points = (effect.params as { points?: unknown }).points
      if (effect.type === 'fuseChanceBonus' && typeof points === 'number') {
        if (!boost || points > boost.points) boost = { id, points }
      }
    }
  }
  return { ...(boost ? { boost: boost.id } : {}), ...(protect ? { protect } : {}) }
}

/** Bùa tăng tỉ lệ của dữ liệu (fusionAid có fuseChanceBonus), điểm tăng dần (rẻ trước). */
function boostCharms(data: GameData): { id: string; points: number }[] {
  return Object.values(data.items)
    .flatMap((item) => {
      if (item.category !== 'fusionAid') return []
      const effect = item.effects.find((e) => e.type === 'fuseChanceBonus')
      const points = (effect?.params as { points?: unknown } | undefined)?.points
      return typeof points === 'number' ? [{ id: item.id, points }] : []
    })
    .sort((a, b) => a.points - b.points)
}

/** Id Bùa Hộ Mệnh của dữ liệu (vật phẩm fusionAid có hiệu ứng fuseProtect). */
const protectCharmIds = (data: GameData): string[] =>
  Object.values(data.items)
    .filter((i) => i.category === 'fusionAid' && i.effects.some((e) => e.type === 'fuseProtect'))
    .map((i) => i.id)

/** Quái thay chỗ quái đội mẫu vừa mất: quái mạnh nhất trong kho (rảnh), vào đội mẫu. */
function replaceLostMember(data: GameData, state: GameState, teamIds: Set<string>): GameState {
  const best = state.storage
    .filter((m) => !teamIds.has(m.id) && isFree(m))
    .sort((a, b) => statTotal(data, b).cmp(statTotal(data, a)))[0]
  if (!best) return state
  teamIds.add(best.id)
  return hasPartyRoom(data, state.party, best)
    ? simAct(data, state, { type: 'moveToParty', monsterId: best.id })
    : state
}

/**
 * Ở thị trấn: mỗi quái đội mẫu fuse với nguyên liệu tốt nhất trong kho (½ chỉ số quái phụ lớn nhất)
 * nếu đủ tiền và tỉ lệ ≥ minFuseChance (dùng bùa tăng tỉ lệ có sẵn), hoặc có / mua được Bùa Hộ
 * Mệnh. Quái gốc mất (thất bại không hộ mệnh) thì quái mạnh nhất trong kho vào đội mẫu.
 */
export function fuseWhenPossible(
  data: GameData,
  state: GameState,
  teamIds: Set<string>,
  count: GrowthCount
): GameState {
  for (const base of teamOf(state, teamIds)) {
    const current = [...state.party, ...state.storage].find((m) => m.id === base.id)
    if (!current || !isFree(current)) continue
    // Quái phụ: nguyên liệu có tỉ lệ (không bùa) ≥ minFuseChance, tổng chỉ số cao nhất.
    const subs = state.storage
      .filter(
        (m) =>
          !teamIds.has(m.id) &&
          !m.locked &&
          isFree(m) &&
          newFusionSpecies(current, m).length > 0 &&
          fuseSuccessChance(data, current, m) >= GROWTH_POLICY.minFuseChance
      )
      .sort((a, b) => statTotal(data, b).cmp(statTotal(data, a)))
    const sub = subs[0]
    if (!sub) continue
    let charms = charmsInBag(data, state)
    let plain = previewFusion(data, current, sub, { boostItemId: charms.boost })
    if (plain.cost.gt(state.money.times(GROWTH_POLICY.spendFraction))) {
      skip(count, 'money')
      continue
    }
    // Chưa đủ an toàn: mua bùa tăng tỉ lệ rẻ nhất đủ đạt safeFuseChance, rồi mới tới Bùa Hộ Mệnh.
    if (plain.successChance < GROWTH_POLICY.safeFuseChance && !charms.protect) {
      const base = previewFusion(data, current, sub).successChance
      for (const { id, points } of boostCharms(data)) {
        if (base + points < GROWTH_POLICY.safeFuseChance) continue
        state = buyIfCheap(data, state, id)
        if (getItemCount(state.inventory, id) > 0) break
      }
      charms = charmsInBag(data, state)
      plain = previewFusion(data, current, sub, { boostItemId: charms.boost })
    }
    if (plain.successChance < GROWTH_POLICY.safeFuseChance && !charms.protect) {
      for (const id of protectCharmIds(data)) state = buyIfCheap(data, state, id)
      charms = charmsInBag(data, state)
    }
    if (plain.successChance < GROWTH_POLICY.safeFuseChance && !charms.protect) {
      // Lý do: cửa hàng không bán bùa nào đủ dùng, hay có bán mà quá đắt.
      const wanted = [...boostCharms(data).map((c) => c.id), ...protectCharmIds(data)]
      const sold = shopStock(state).some((e) => e.storage === 'stack' && wanted.includes(e.itemId))
      skip(count, sold ? 'charmTooExpensive' : 'charmNotSold')
      continue
    }
    // Thất bại không hộ mệnh mất cả hai: đội phải còn quái khác (luật partyWouldBeEmpty).
    const others = state.party.filter((m) => m.id !== current.id && m.id !== sub.id)
    const isProtected = charms.protect !== undefined && plain.successChance < 100
    if (others.length === 0 && !isProtected) {
      skip(count, 'lastMember')
      continue
    }
    const before = state
    state = simAct(data, state, {
      type: 'fuse',
      baseId: current.id,
      subId: sub.id,
      ...(charms.boost ? { boostItemId: charms.boost } : {}),
      ...(charms.protect && plain.successChance < 100 ? { protectItemId: charms.protect } : {}),
      ...chooseInheritance(data, current, sub)
    })
    const after = [...state.party, ...state.storage].find((m) => m.id === current.id)
    if (after && after.lineage.length > current.lineage.length) {
      count.fuses++
      continue
    }
    count.fuseFails++
    if (!after && before !== state) {
      count.teamLost++
      teamIds.delete(current.id)
      state = replaceLostMember(data, state, teamIds)
    }
  }
  return state
}

/**
 * Ở thị trấn, mỗi breedEveryDays ngày: breed cặp đực / cái (đội mẫu và kho, rảnh) có tổng gen cao
 * nhất breed được, đủ tiền. Con nở vào kho (đội đầy) rồi lên level nhờ thám hiểm.
 */
export function breedWhenPossible(
  data: GameData,
  state: GameState,
  { lastBreedDay, count }: { lastBreedDay: number; count: GrowthCount }
): { state: GameState; bred: boolean } {
  if (dayOf(state.time) - lastBreedDay < GROWTH_POLICY.breedEveryDays) return { state, bred: false }
  const owned = [...state.party, ...state.storage].filter((m) => isFree(m) && !isFainted(data, m))
  const geneSum = (m: Monster): Decimal =>
    STAT_NAMES.reduce((sum, stat) => sum.plus(m.genes[stat]), m.genes.hp.times(0))
  const males = owned.filter((m) => m.gender === 'male').sort((a, b) => geneSum(b).cmp(geneSum(a)))
  const females = owned
    .filter((m) => m.gender === 'female')
    .sort((a, b) => geneSum(b).cmp(geneSum(a)))
  for (const father of males) {
    for (const mother of females) {
      if (breedBlocker(data, father, mother) !== null) continue
      const budget = state.money.times(GROWTH_POLICY.breedSpendFraction)
      if (breedCost(data, father, mother).gt(budget)) continue
      count.breeds++
      return {
        state: simAct(data, state, { type: 'breed', fatherId: father.id, motherId: mother.id }),
        bred: true
      }
    }
  }
  return { state, bred: false }
}

/**
 * Con breeding (lý lịch trứng) trong kho mạnh hơn quái yếu nhất của đội mẫu (tổng chỉ số ×
 * promoteRatio) thì thay vào đội mẫu.
 */
export function promoteChildren(
  data: GameData,
  state: GameState,
  teamIds: Set<string>,
  count: GrowthCount
): GameState {
  for (const child of state.storage) {
    if (teamIds.has(child.id) || child.history?.origin.kind !== 'egg' || !isFree(child)) continue
    const team = state.party.filter((m) => teamIds.has(m.id))
    const weakest = team.sort((a, b) => statTotal(data, a).cmp(statTotal(data, b)))[0]
    if (!weakest) continue
    if (statTotal(data, child).lt(statTotal(data, weakest).times(GROWTH_POLICY.promoteRatio)))
      continue
    state = simAct(data, state, {
      type: 'swapWithStorage',
      partyMonsterId: weakest.id,
      storageMonsterId: child.id
    })
    teamIds.delete(weakest.id)
    teamIds.add(child.id)
    count.promotions++
  }
  return state
}

/** Học mọi trận đồ trong túi, rồi chọn trận pháp đã học đầu tiên mà đội đủ yêu cầu. */
export function applyFormations(data: GameData, state: GameState): GameState {
  for (const [itemId, count] of Object.entries(state.inventory.stacks)) {
    const item = data.items[itemId]
    if (count <= 0 || item?.category !== 'formationScroll') continue
    if (state.formations.known.includes(item.formationId)) continue
    state = simAct(data, state, { type: 'learnFormation', itemId })
  }
  const active = (s: GameState): boolean =>
    partyTeamBonuses(data, s).some((bonus) => bonus.kind === 'formation')
  if (state.formations.active !== null && active(state)) return state
  for (const formationId of state.formations.known) {
    if (formationId === state.formations.active) continue
    const tried = simAct(data, state, { type: 'setFormation', formationId })
    if (active(tried)) return tried
  }
  return state
}

/** Vuốt ve mọi quái đang đòi vuốt ve (dưỡng dục). */
export function petRequests(data: GameData, state: GameState): GameState {
  for (const monster of [...state.party, ...state.storage]) {
    if (!isImprintRequested(monster, { kind: 'pet' })) continue
    state = simAct(data, state, { type: 'petMonster', monsterId: monster.id })
  }
  return state
}

/** Vật phẩm hồi máu / hồi sinh trong túi theo loại hiệu ứng. */
function healItems(data: GameData, state: GameState, effectType: string): string[] {
  return Object.entries(state.inventory.stacks).flatMap(([id, count]) => {
    const item = data.items[id]
    if (count <= 0 || item?.category !== 'consumable' || item.use === 'battle') return []
    return item.effects.some((effect) => effect.type === effectType) ? [id] : []
  })
}

/**
 * Hồi máu cả đội bằng vật phẩm (không hồi ở NPC được, như giữa các đợt thú triều): quái gục dùng vật
 * phẩm hồi sinh, quái còn dưới itemHealBelowPercent % máu dùng thuốc; thiếu thì mua thuốc / hồi sinh
 * cửa hàng đang bán (giá ≤ spendFraction tiền). Gọi thẳng gameReducer: dùng ngay trong lúc giải quyết
 * thú triều (simAct sẽ giải quyết thú triều lần nữa).
 */
export function healWithItems(data: GameData, state: GameState): GameState {
  for (const original of state.party) {
    const kind = isFainted(data, original) ? 'revive' : 'healPercent'
    for (let tries = 0; tries < 4; tries++) {
      const monster = state.party.find((m) => m.id === original.id)
      if (!monster) break
      const maxHp = getMaxHp(data, monster)
      const left = maxHp.minus(monster.damageTaken)
      const needs =
        kind === 'revive'
          ? isFainted(data, monster)
          : left.lt(maxHp.times(GROWTH_POLICY.itemHealBelowPercent).div(100))
      if (!needs) break
      let items = healItems(data, state, kind)
      if (items.length === 0) {
        for (const entry of shopStock(state)) {
          const item = entry.storage === 'stack' ? data.items[entry.itemId] : undefined
          if (item?.category !== 'consumable' || !item.effects.some((e) => e.type === kind))
            continue
          state = buyIfCheap(data, state, item.id, gameReducer)
        }
        items = healItems(data, state, kind)
      }
      const itemId = items[0]
      if (itemId === undefined || getItemCount(state.inventory, itemId) <= 0) break
      state = gameReducer(data, state, { type: 'useItem', itemId, monsterId: monster.id })
    }
  }
  return state
}
