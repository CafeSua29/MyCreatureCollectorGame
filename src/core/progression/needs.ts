// Đói, tinh thần, bệnh (docs/rules/dwelling.md mục "Đói và tinh thần", "Bệnh và chấn thương"; như
// Hunger / SAN / Feed Box / ailment của Palworld): hộp thức ăn của động phủ, mỗi ngày quái làm việc
// đói / mệt theo trait, tự ăn khi đói, Ôn tuyền hồi tinh thần, mắc bệnh khi tinh thần thấp / đói lả;
// quái không làm ở động phủ hồi dần, nghỉ đủ ngày thì khỏi bệnh.

import { addItems, removeItems } from '../inventory'
import { needDrainMultipliers } from '../registries'
import { ActionError, malformedAction, pickWeighted, rollPercent, type RngState } from '../shared'
import type {
  AilmentCause,
  AilmentDef,
  DwellingState,
  GameData,
  GameState,
  Monster,
  MonsterAilment
} from '../model'
import { requireTown } from './town'

function requireFood(data: GameData, itemId: string): void {
  if (!Object.hasOwn(data.config.dwelling.foods, itemId)) {
    throw new ActionError('notFood', { itemId })
  }
}

function requireCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw malformedAction(`số lượng không hợp lệ: ${String(count)}`)
  }
}

/** Bỏ món ăn từ túi vào hộp thức ăn (thị trấn). */
export function stockFeedBox(
  data: GameData,
  state: GameState,
  { itemId, count }: { itemId: string; count: number }
): GameState {
  requireTown(state)
  requireCount(count)
  requireFood(data, itemId)
  return {
    ...state,
    inventory: removeItems(state.inventory, itemId, count),
    dwelling: { ...state.dwelling, feedBox: addFeed(state.dwelling.feedBox, itemId, count) }
  }
}

/** Lấy món ăn từ hộp thức ăn về túi (thị trấn). */
export function takeFeedBox(
  state: GameState,
  { itemId, count }: { itemId: string; count: number }
): GameState {
  requireTown(state)
  requireCount(count)
  const { stacks } = removeItems({ stacks: state.dwelling.feedBox }, itemId, count)
  return {
    ...state,
    inventory: addItems(state.inventory, itemId, count),
    dwelling: { ...state.dwelling, feedBox: stacks }
  }
}

const addFeed = (
  feedBox: Readonly<Record<string, number>>,
  itemId: string,
  count: number
): Record<string, number> => addItems({ stacks: feedBox }, itemId, count).stacks

const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value))

/**
 * Quái ăn từ hộp thức ăn khi no dưới eatBelow: mỗi lần một món (theo thứ tự `foods` trong config)
 * tới khi đủ eatBelow hoặc hết món. Trả quái và hộp sau khi ăn.
 */
function eatFromBox(
  data: GameData,
  { monster, feedBox }: { monster: Monster; feedBox: Record<string, number> }
): { monster: Monster; feedBox: Record<string, number> } {
  const { foods, needs } = data.config.dwelling
  let { fullness, sanity } = monster
  let box = feedBox
  for (const [itemId, food] of Object.entries(foods)) {
    while (fullness < needs.eatBelow && (box[itemId] ?? 0) > 0) {
      box = removeItems({ stacks: box }, itemId, 1).stacks
      fullness = clamp(fullness + food.fullness, needs.max)
      sanity = clamp(sanity + food.sanity, needs.max)
    }
  }
  return { monster: { ...monster, fullness, sanity }, feedBox: box }
}

/**
 * Một ngày làm việc của quái: − no / tinh thần (× hệ số trait, cú đêm), ăn khi đói, đói lả thì −
 * thêm tinh thần, + tinh thần nghỉ ngơi (Ôn tuyền).
 */
function workerDay(
  data: GameData,
  {
    monster,
    feedBox,
    restSanity
  }: { monster: Monster; feedBox: Record<string, number>; restSanity: number }
): { monster: Monster; feedBox: Record<string, number> } {
  const { needs } = data.config.dwelling
  const drain = needDrainMultipliers(data, monster)
  const tired: Monster = {
    ...monster,
    fullness: clamp(monster.fullness - needs.hungerPerDay * drain.hunger, needs.max),
    sanity: clamp(monster.sanity - needs.sanityPerDay * drain.sanity, needs.max)
  }
  const fed = eatFromBox(data, { monster: tired, feedBox })
  const starving = fed.monster.fullness <= 0 ? needs.starvingSanityPerDay : 0
  const sanity = clamp(fed.monster.sanity - starving + restSanity, needs.max)
  return { monster: { ...fed.monster, sanity }, feedBox: fed.feedBox }
}

/**
 * Quái không làm ở động phủ hồi idleRecoveryPerDay no và tinh thần; đang bệnh thì thêm một ngày
 * nghỉ, đủ idleCureDays ngày thì khỏi.
 */
function recover(data: GameData, monster: Monster): Monster {
  const { max, idleRecoveryPerDay, idleCureDays } = data.config.dwelling.needs
  const ailment = monster.ailment
  const rested =
    ailment === null
      ? null
      : ailment.restDays + 1 >= idleCureDays
        ? null
        : { ...ailment, restDays: ailment.restDays + 1 }
  if (monster.fullness >= max && monster.sanity >= max && ailment === null) return monster
  return {
    ...monster,
    fullness: clamp(monster.fullness + idleRecoveryPerDay, max),
    sanity: clamp(monster.sanity + idleRecoveryPerDay, max),
    ailment: rested
  }
}

/**
 * Quái làm việc chưa bệnh: tinh thần dưới sickSanity thì tung sickChanceMax × (sickSanity − tinh
 * thần) / sickSanity %, đói lả thêm starvingSickChance %; mắc thì chọn bệnh theo trọng số. Không
 * có bệnh nào trong dữ liệu / tỉ lệ 0 thì không tốn RNG.
 */
function rollAilment(
  data: GameData,
  rng: RngState,
  monster: Monster
): [Monster['ailment'], RngState] {
  if (monster.ailment !== null) return [monster.ailment, rng]
  const { sickSanity, sickChanceMax, starvingSickChance } = data.config.dwelling.needs
  const low = sickSanity > 0 ? Math.max(0, (sickSanity - monster.sanity) / sickSanity) : 0
  const chance = sickChanceMax * low + (monster.fullness <= 0 ? starvingSickChance : 0)
  return rollAilmentOf(data, rng, { cause: 'work', chance })
}

/**
 * Bệnh có thể mắc của nguồn `cause`: có bộ phận bị trúng (`parts`) thì bệnh gắn với một trong các bộ
 * phận đó (không có thì bệnh chung); không có bộ phận nào thì bệnh chung (không có thì mọi bệnh của
 * nguồn). Bệnh nguồn làm việc không xét bộ phận.
 */
function ailmentPool(
  data: GameData,
  { cause, parts }: { cause: AilmentCause; parts: readonly string[] }
): AilmentDef[] {
  const all = Object.values(data.ailments).filter(
    (def) => def.weight > 0 && def.causes.includes(cause)
  )
  if (cause !== 'battle') return all
  const general = all.filter((def) => !def.bodyParts || def.bodyParts.length === 0)
  const located = all.filter((def) => def.bodyParts?.some((part) => parts.includes(part)))
  if (located.length > 0) return located
  return general.length > 0 ? general : all
}

/**
 * Tung mắc bệnh `chance` % rồi chọn bệnh có nguồn `cause` (theo bộ phận bị trúng nếu là chấn thương
 * trận) theo trọng số. Không có bệnh nào hợp hoặc tỉ lệ 0 thì không tốn RNG.
 */
export function rollAilmentOf(
  data: GameData,
  rng: RngState,
  { cause, chance, parts = [] }: { cause: AilmentCause; chance: number; parts?: readonly string[] }
): [MonsterAilment | null, RngState] {
  const pool = ailmentPool(data, { cause, parts })
  if (pool.length === 0 || chance <= 0) return [null, rng]
  let sick: boolean
  ;[sick, rng] = rollPercent(rng, chance)
  if (!sick) return [null, rng]
  const [def, next] = pickWeighted(rng, pool, (entry) => entry.weight)
  return [{ id: def.id, restDays: 0 }, next]
}

/** Tinh thần hồi mỗi ngày cho quái làm việc từ công trình `rest` (cấp × sanityPerLevel). */
function restSanityOf(data: GameData, dwelling: DwellingState): number {
  return Object.entries(dwelling.buildings).reduce((sum, [id, building]) => {
    const effect = data.buildings[id]?.effect
    return effect?.type === 'rest' ? sum + building.level * effect.sanityPerLevel : sum
  }, 0)
}

/**
 * Việc trong ngày của đói / tinh thần (gọi từ việc theo ngày của động phủ, sau khi công trình đã làm
 * việc theo tình trạng đầu ngày): quái làm việc đói / mệt / ăn, quái khác (đội, kho) hồi dần.
 */
export function needsDay(data: GameData, state: GameState): GameState {
  const restSanity = restSanityOf(data, state.dwelling)
  let feedBox = state.dwelling.feedBox
  let rng = state.rng
  const storage = state.storage.map((monster) => {
    if (monster.assignment?.kind !== 'dwelling') return recover(data, monster)
    const result = workerDay(data, { monster, feedBox, restSanity })
    feedBox = result.feedBox
    let ailment: Monster['ailment']
    ;[ailment, rng] = rollAilment(data, rng, result.monster)
    return ailment === result.monster.ailment ? result.monster : { ...result.monster, ailment }
  })
  return {
    ...state,
    rng,
    party: state.party.map((monster) => recover(data, monster)),
    storage,
    dwelling: { ...state.dwelling, feedBox }
  }
}
