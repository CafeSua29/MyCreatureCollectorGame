// Phái quái đi thám hiểm (docs/rules/expeditions.md): phái đi (yêu cầu đội theo registry
// EXPEDITION_REQUIREMENTS ở registries/), phái đi (khóa quái bằng `assignment`), gọi về, việc theo ngày (thân mật mỗi
// ngày, đội về: độ thành công theo tổng chỉ số, thưởng, EXP, rủi ro trọng thương; làm mới bảng).

import { addItems } from '../inventory'
import { EXPEDITION_REQUIREMENTS, changeAffinity } from '../registries'
import { computeStats, gainExp, isFainted } from '../monster'
import { partnerMultiplier } from '../tamer'
import { biomeOfFloor } from '../world'
import { createExpeditionEgg } from './eggs'
import {
  ActionError,
  BIG_ZERO,
  asObject,
  bigToNumber,
  malformedAction,
  nextInt,
  pick,
  rollPercent,
  toBig,
  type Decimal,
  type RngState
} from '../shared'
import {
  STAT_NAMES,
  dayOf,
  type ActiveExpedition,
  type DayEvent,
  type Egg,
  type ExpeditionDef,
  type GameData,
  type GameState,
  type Monster
} from '../model'

/** Số đội thám hiểm cùng lúc: 1 + ⌊cảnh giới ngự thú sư / 2⌋ (docs/rules/tamer.md). */
export const expeditionSlots = (state: GameState): number => 1 + Math.floor(state.tamer.realm / 2)

/** Yêu cầu đầu tiên đội chưa đủ (type), null = đủ. */
export function unmetRequirement(
  data: GameData,
  def: ExpeditionDef,
  team: readonly Monster[]
): string | null {
  for (const requirement of def.requirements) {
    const params = asObject(requirement) ?? {}
    if (!EXPEDITION_REQUIREMENTS[requirement.type].isMet(params, team, data))
      return requirement.type
  }
  return null
}

/** Phái quái trong kho đi thám hiểm (thị trấn): rảnh, không gục, không trọng thương, đủ yêu cầu. */
export function startExpedition(
  data: GameData,
  state: GameState,
  { expeditionId, monsterIds }: { expeditionId: string; monsterIds: string[] }
): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
  if (!Array.isArray(monsterIds) || monsterIds.length === 0) {
    throw malformedAction('monsterIds phải là danh sách không rỗng')
  }
  if (new Set(monsterIds).size !== monsterIds.length) throw malformedAction('monsterIds bị lặp')
  if (!state.expeditions.board.includes(expeditionId)) {
    throw new ActionError('expeditionNotOffered', { expeditionId })
  }
  const slots = expeditionSlots(state)
  if (state.expeditions.active.length >= slots)
    throw new ActionError('expeditionSlotsFull', { slots })
  const team = monsterIds.map((monsterId) => {
    const monster = state.storage.find((m) => m.id === monsterId)
    if (!monster) throw new ActionError('monsterNotInStorage', { monsterId })
    if (monster.assignment) throw new ActionError('monsterBusy', { monsterId })
    if (isFainted(data, monster)) throw new ActionError('monsterFainted', { monsterId })
    if (monster.injuryBattlesLeft > 0) {
      throw new ActionError('injured', { monsterId, battlesLeft: monster.injuryBattlesLeft })
    }
    return monster
  })
  const def = data.expeditions[expeditionId]
  const requirement = unmetRequirement(data, def, team)
  if (requirement)
    throw new ActionError('expeditionRequirementUnmet', { expeditionId, requirement })
  const id = `x${state.expeditions.nextId}`
  const active: ActiveExpedition = {
    id,
    expeditionId,
    monsterIds: [...monsterIds],
    endDay: dayOf(state.time) + def.durationDays
  }
  const storage = state.storage.map((m) =>
    monsterIds.includes(m.id) ? { ...m, assignment: { kind: 'expedition' as const, id } } : m
  )
  return {
    ...state,
    storage,
    expeditions: {
      ...state.expeditions,
      active: [...state.expeditions.active, active],
      nextId: state.expeditions.nextId + 1
    }
  }
}

/** Gỡ việc khỏi các quái của đội. */
const freeMonsters = (state: GameState, activeId: string): Monster[] =>
  state.storage.map((m) => (m.assignment?.id === activeId ? { ...m, assignment: null } : m))

/** Gọi đội về sớm (ngoài trận, ở đâu cũng được): không có thưởng. */
export function recallExpedition(state: GameState, expeditionActiveId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (!state.expeditions.active.some((x) => x.id === expeditionActiveId)) {
    throw new ActionError('expeditionNotFound', { expeditionActiveId })
  }
  return {
    ...state,
    storage: freeMonsters(state, expeditionActiveId),
    expeditions: {
      ...state.expeditions,
      active: state.expeditions.active.filter((x) => x.id !== expeditionActiveId)
    }
  }
}

/** Tổng mọi chỉ số cuối của đội (Decimal). */
function teamPower(data: GameData, team: readonly Monster[]): Decimal {
  return team.reduce((sum, monster) => {
    const { final } = computeStats(data, monster)
    return STAT_NAMES.reduce((acc, stat) => acc.plus(final[stat]), sum)
  }, BIG_ZERO)
}

/**
 * Độ thành công: tổng chỉ số ÷ (powerPerFloor × tầng cao nhất) × kỹ năng đồng hành
 * `expeditionPowerPercent`, kẹp [minSuccess, maxSuccess].
 */
export function expeditionSuccess(
  data: GameData,
  state: GameState,
  { def, team }: { def: ExpeditionDef; team: readonly Monster[] }
): number {
  const { minSuccess, maxSuccess } = data.config.expeditions
  const target = toBig(def.powerPerFloor).times(state.highestFloor)
  const ratio = target.lte(0)
    ? maxSuccess
    : bigToNumber(
        teamPower(data, team)
          .div(target)
          .clampedTo(0, maxSuccess * 10)
      )
  const boosted = ratio * partnerMultiplier(data, state.party, 'expeditionPowerPercent')
  return Math.min(maxSuccess, Math.max(minSuccess, boosted))
}

/**
 * Trứng hiếm của đội về: tung min(100, eggChance × độ thành công) % (0 thì không tốn RNG), trứng
 * loài boss của map tầng cao nhất (createExpeditionEgg).
 */
function rollExpeditionEgg(
  data: GameData,
  state: GameState,
  { def, success }: { def: ExpeditionDef; success: number }
): { egg: Egg | null; rng: RngState; nextMonsterId: number } {
  const { nextMonsterId } = state
  const [hit, afterRoll] = rollPercent(state.rng, Math.min(100, def.eggChance * success))
  if (!hit) return { egg: null, rng: afterRoll, nextMonsterId }
  const [egg, rng] = createExpeditionEgg(data, afterRoll, {
    expeditionId: def.id,
    biome: biomeOfFloor(data, state, state.highestFloor),
    id: `m${nextMonsterId}`,
    floor: state.highestFloor,
    aging: state.options.lifespanEnabled,
    day: dayOf(state.time)
  })
  return { egg, rng, nextMonsterId: egg ? nextMonsterId + 1 : nextMonsterId }
}

/** Đội về: thưởng × độ thành công, EXP, rủi ro trọng thương, gỡ việc; ghi sự kiện. */
function returnExpedition(
  data: GameData,
  state: GameState,
  { expedition, events }: { expedition: ActiveExpedition; events: DayEvent[] }
): GameState {
  const config = data.config.expeditions
  const def = data.expeditions[expedition.expeditionId]
  // Quái tọa hóa khi đang đi đã rời kho: đội chỉ còn quái còn sống.
  const team = state.storage.filter((m) => expedition.monsterIds.includes(m.id))
  let { rng, inventory } = state
  let money = state.money
  const injuredIds: string[] = []
  let storage = freeMonsters(state, expedition.id)
  let successPercent = 0
  let { eggs, nextMonsterId } = state
  let eggId: string | null = null
  if (team.length > 0) {
    const success = expeditionSuccess(data, state, { def, team })
    successPercent = Math.round(success * 100)
    money = money.plus(toBig(def.moneyPerFloor).times(state.highestFloor).times(success).floor())
    for (const drop of def.drops) {
      let hit: boolean
      ;[hit, rng] = rollPercent(rng, drop.chance)
      if (!hit) continue
      let count: number
      ;[count, rng] = nextInt(rng, drop.min, drop.max)
      const scaled = Math.max(1, Math.floor(count * success))
      inventory = addItems(inventory, drop.itemId, scaled)
    }
    const exp = toBig(config.expPerDayPerFloor).times(def.durationDays).times(state.highestFloor)
    storage = storage.map((monster) => {
      if (!expedition.monsterIds.includes(monster.id)) return monster
      const grown = gainExp(data, monster, exp).monster
      return grown
    })
    const egg = rollExpeditionEgg(data, { ...state, rng }, { def, success })
    rng = egg.rng
    eggs = egg.egg ? [...eggs, egg.egg] : eggs
    nextMonsterId = egg.nextMonsterId
    eggId = egg.egg?.id ?? null
    for (const monster of team) {
      let injured: boolean
      ;[injured, rng] = rollPercent(rng, config.injuryChance)
      if (!injured) continue
      injuredIds.push(monster.id)
      storage = storage.map((m) =>
        m.id === monster.id ? { ...m, injuryBattlesLeft: data.config.awakening.injuryBattles } : m
      )
    }
  }
  events.push({
    type: 'expeditionReturned',
    activeId: expedition.id,
    expeditionId: expedition.expeditionId,
    successPercent,
    injuredIds,
    eggId
  })
  return {
    ...state,
    rng,
    eggs,
    nextMonsterId,
    money,
    inventory,
    storage,
    expeditions: {
      ...state.expeditions,
      active: state.expeditions.active.filter((x) => x.id !== expedition.id)
    }
  }
}

/** Bảng thám hiểm mới: số mẫu random trong [boardMin, boardMax], không lặp, chọn đều. */
export function rollExpeditionBoard(data: GameData, rng: RngState): [string[], RngState] {
  const { boardMin, boardMax } = data.config.expeditions
  const pool = Object.keys(data.expeditions)
  let size: number
  ;[size, rng] = nextInt(rng, boardMin, boardMax)
  const board: string[] = []
  while (board.length < Math.min(size, pool.length)) {
    let id: string
    ;[id, rng] = pick(
      rng,
      pool.filter((entry) => !board.includes(entry))
    )
    board.push(id)
  }
  return [board, rng]
}

/**
 * Việc theo ngày (DAILY_TASKS): quái đang đi + thân mật; đội tới ngày về thì về; tới ngày làm mới
 * thì bảng mới.
 */
export function expeditionDailyTask(
  data: GameData,
  state: GameState,
  events: DayEvent[],
  day: number
): GameState {
  const config = data.config.expeditions
  let next: GameState = {
    ...state,
    storage: state.storage.map((m) =>
      m.assignment?.kind === 'expedition' ? changeAffinity(data, m, config.affinityPerDay) : m
    )
  }
  for (const expedition of state.expeditions.active) {
    if (expedition.endDay <= day) next = returnExpedition(data, next, { expedition, events })
  }
  if (day >= next.expeditions.refreshDay) {
    const [board, rng] = rollExpeditionBoard(data, next.rng)
    next = {
      ...next,
      rng,
      expeditions: { ...next.expeditions, board, refreshDay: day + config.refreshDays }
    }
  }
  return next
}
