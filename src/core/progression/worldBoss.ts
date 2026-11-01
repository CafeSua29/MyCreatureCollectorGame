// Boss thế giới theo ngày và nhận thưởng (docs/rules/world-boss.md): xuất hiện ở activeDays ngày cuối
// mỗi chu kỳ everyDays ngày (loài, tầng tham chiếu, seed boss tung lúc xuất hiện), hết thời gian thì
// kỷ lục đổi thành thưởng chờ nhận ở thị trấn. Trận ở battle/worldBoss.ts.

import { addBooks, addItems, learnsetSkillIds, rollSkillBooks } from '../inventory'
import { ActionError, BIG_ZERO, nextUint32, pickWeighted, rollPercent, toBig } from '../shared'
import {
  dayOf,
  type DayEvent,
  type GameData,
  type GameState,
  type WorldBossAppearance,
  type WorldBossReward
} from '../model'
import {
  generateWorldBoss,
  worldBossCandidates,
  worldBossHpUnit,
  worldBossLevel,
  worldBossTierOf,
  worldBossWindow
} from '../world'
import { createSpeciesEgg } from './eggs'

/** Lần xuất hiện mới ở chu kỳ của `day`: loài theo trọng số, tầng cao nhất, seed boss. */
function startAppearance(
  data: GameData,
  state: GameState,
  { cycle, endDay }: { cycle: number; endDay: number }
): GameState | null {
  const candidates = worldBossCandidates(data)
  if (candidates.length === 0 || state.highestFloor < 1) return null
  const [candidate, afterSpecies] = pickWeighted(state.rng, candidates, (entry) => entry.weight)
  const [seed, rng] = nextUint32(afterSpecies)
  const floor = state.highestFloor
  const source = { speciesId: candidate.speciesId, floor, level: worldBossLevel(data, floor), seed }
  const boss = generateWorldBoss(data, { source, id: 'worldBoss' })
  const current: WorldBossAppearance = {
    ...source,
    cycle,
    endDay,
    hpUnit: worldBossHpUnit(data, boss),
    bestDamage: BIG_ZERO,
    lastChallengeDay: null
  }
  return { ...state, rng, worldBoss: { ...state.worldBoss, current } }
}

/** Hết thời gian: kỷ lục đạt bậc thì thành thưởng chờ nhận; hết lần xuất hiện. */
function closeAppearance(
  data: GameData,
  state: GameState,
  { current, events }: { current: WorldBossAppearance; events: DayEvent[] }
): GameState {
  const tier = worldBossTierOf(data, current)
  events.push({ type: 'worldBossLeft', speciesId: current.speciesId, tierId: tier?.id ?? null })
  const reward: WorldBossReward | null = tier && {
    speciesId: current.speciesId,
    floor: current.floor,
    level: current.level,
    tierId: tier.id,
    bestDamage: current.bestDamage
  }
  const rewards = reward ? [...state.worldBoss.rewards, reward] : state.worldBoss.rewards
  return { ...state, worldBoss: { current: null, rewards } }
}

/**
 * Việc theo ngày: lần xuất hiện quá ngày cuối thì kết thúc (thưởng chờ nhận); chưa có boss mà ngày
 * nằm trong thời gian xuất hiện thì boss mới xuất hiện (cần đã mở ít nhất một tầng và có loài hợp lệ).
 */
export function worldBossDailyTask(
  data: GameData,
  state: GameState,
  events: DayEvent[],
  day: number
): GameState {
  let next = state
  const current = next.worldBoss.current
  if (current && day > current.endDay) next = closeAppearance(data, next, { current, events })
  const window = worldBossWindow(data, day)
  if (next.worldBoss.current !== null || !window.active) return next
  const started = startAppearance(data, next, window)
  if (!started?.worldBoss.current) return next
  const { speciesId, endDay } = started.worldBoss.current
  events.push({ type: 'worldBossAppeared', speciesId, endDay })
  return started
}

/** Thưởng của một lần xuất hiện: tiền, vật phẩm, sách kỹ năng của loài boss, trứng loài boss. */
function grantReward(data: GameData, state: GameState, reward: WorldBossReward): GameState {
  const tier = data.config.worldBoss.tiers.find((entry) => entry.id === reward.tierId)
  if (!tier) throw new Error(`Bậc thưởng boss thế giới không tồn tại: ${reward.tierId}`)
  const money = toBig(data.config.rewards.moneyPerLevel)
    .times(reward.level)
    .times(tier.moneyMultiple)
    .floor()
  let inventory = state.inventory
  for (const { itemId, count } of tier.items) inventory = addItems(inventory, itemId, count)
  const [books, afterBooks] = rollSkillBooks(data, state.rng, {
    skillIds: learnsetSkillIds(data, [reward.speciesId]),
    party: state.party,
    count: tier.skillBooks,
    reusableChance: data.config.skillBook.reusableDropChance
  })
  for (const book of books) inventory = addBooks(inventory, book, 1)
  const [hasEgg, afterEggRoll] = rollPercent(afterBooks, tier.eggChance)
  const next = { ...state, rng: afterEggRoll, inventory, money: state.money.plus(money) }
  if (!hasEgg) return next
  const [egg, rng] = createSpeciesEgg(data, afterEggRoll, {
    speciesId: reward.speciesId,
    floor: reward.floor,
    aging: state.options.lifespanEnabled,
    day: dayOf(state.time),
    id: `m${state.nextMonsterId}`,
    origin: { kind: 'bossEgg', bossSpeciesId: reward.speciesId }
  })
  return { ...next, rng, eggs: [...next.eggs, egg], nextMonsterId: next.nextMonsterId + 1 }
}

/** Nhận mọi thưởng boss thế giới đang chờ (ở thị trấn, ngoài trận). */
export function claimWorldBossRewards(data: GameData, state: GameState): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  if (state.worldBoss.rewards.length === 0) throw new ActionError('noWorldBossRewards')
  const granted = state.worldBoss.rewards.reduce(
    (next, reward) => grantReward(data, next, reward),
    state
  )
  return { ...granted, worldBoss: { ...granted.worldBoss, rewards: [] } }
}
