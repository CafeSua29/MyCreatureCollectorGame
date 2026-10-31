// Bảng nhiệm vụ (docs/rules/quests.md): loại nhiệm vụ theo registry QUEST_TYPES (tung mục tiêu, khớp
// sự kiện), ra nhiệm vụ theo trọng số mẫu, bổ sung bảng, nhận / hủy / nhận thưởng, ghi tiến độ khi có
// sự kiện. Thêm loại nhiệm vụ = thêm một handler, nơi phát sự kiện gọi recordQuestEvent.

import { raceMatches } from '../registries'
import { addItems } from '../inventory'
import {
  ActionError,
  asObject,
  checkInteger,
  nextInt,
  pick,
  pickWeighted,
  toBig,
  type RngState
} from '../shared'
import type {
  ActiveQuest,
  GameData,
  GameState,
  QuestEvent,
  QuestInstance,
  QuestObjective,
  QuestState,
  QuestTemplate
} from '../model'

export interface QuestTypeHandler {
  validateParams(params: unknown, data: GameData): string[]
  /** Tung mục tiêu cụ thể của nhiệm vụ mới (tầng cao nhất lúc ra nhiệm vụ). */
  rollObjective(
    params: unknown,
    ctx: { data: GameData; rng: RngState; highestFloor: number }
  ): [QuestObjective, RngState]
  /** Sự kiện có tính cho mục tiêu này không. */
  matches(objective: QuestObjective, event: QuestEvent, data: GameData): boolean
}

const noParams = (params: unknown): string[] =>
  params === undefined || (asObject(params) && Object.keys(params as object).length === 0)
    ? []
    : ['params phải rỗng']

/** Nhiệm vụ loại `questType` chỉ cần đúng loại sự kiện `eventType` (không tham số). */
const byEventType = (questType: string, eventType: QuestEvent['type']): QuestTypeHandler => ({
  validateParams: noParams,
  rollObjective: (_params, { rng }) => [{ type: questType }, rng],
  matches: (_objective, event) => event.type === eventType
})

export const QUEST_TYPES: Readonly<Record<string, QuestTypeHandler>> = {
  // Bắt quái có hệ ngẫu nhiên (đều trên mọi hệ).
  catchElement: {
    validateParams: noParams,
    rollObjective(_params, { data, rng }) {
      let elementId: string
      ;[elementId, rng] = pick(rng, Object.keys(data.elements))
      return [{ type: 'catchElement', elementId }, rng]
    },
    matches: (objective, event) =>
      event.type === 'caught' && event.elementIds.includes(objective.elementId as string)
  },
  // Bắt quái thuộc một nhóm race ngẫu nhiên (đều trên mọi nhóm; khớp mọi race trong nhóm).
  catchRace: {
    validateParams: noParams,
    rollObjective(_params, { data, rng }) {
      let raceId: string
      ;[raceId, rng] = pick(rng, Object.keys(data.raceGroups))
      return [{ type: 'catchRace', raceId }, rng]
    },
    matches: (objective, event, data) =>
      event.type === 'caught' && raceMatches(data, event.raceId, objective.raceId as string)
  },
  // Hạ quái ở tầng ≥ tầng cao nhất − floorOffset (tối thiểu 1).
  defeat: {
    validateParams(params) {
      const obj = asObject(params)
      return obj ? checkInteger(obj.floorOffset, 'floorOffset', 0) : ['params phải là object']
    },
    rollObjective(params, { rng, highestFloor }) {
      const { floorOffset } = params as { floorOffset: number }
      return [{ type: 'defeat', minFloor: Math.max(1, highestFloor - floorOffset) }, rng]
    },
    matches: (objective, event) =>
      event.type === 'defeated' && event.floor >= (objective.minFloor as number)
  },
  defeatFloorBoss: byEventType('defeatFloorBoss', 'floorBossDefeated'),
  hatch: byEventType('hatch', 'hatched'),
  fuse: byEventType('fuse', 'fused'),
  breed: byEventType('breed', 'bred')
}

/** Ra một nhiệm vụ mới theo trọng số mẫu; mục tiêu, số lần và thưởng tung sẵn. */
export function rollQuest(
  data: GameData,
  { rng, highestFloor, id }: { rng: RngState; highestFloor: number; id: string }
): [QuestInstance, RngState] {
  let template: QuestTemplate
  ;[template, rng] = pickWeighted(rng, Object.values(data.quests), (t) => t.weight)
  let objective: QuestObjective
  ;[objective, rng] = QUEST_TYPES[template.type].rollObjective(template.params, {
    data,
    rng,
    highestFloor
  })
  let target: number
  ;[target, rng] = nextInt(rng, template.countMin, template.countMax)
  const reward = {
    money: toBig(template.reward.moneyPerFloor).times(highestFloor),
    items: template.reward.items.map((item) => ({ ...item }))
  }
  return [{ id, templateId: template.id, objective, target, reward }, rng]
}

/** Bổ sung bảng cho đủ boardSize nhiệm vụ (không có mẫu nào thì để nguyên). */
export function refillQuestBoard(data: GameData, state: GameState): GameState {
  if (Object.keys(data.quests).length === 0) return state
  let { rng } = state
  let { nextQuestId } = state.quests
  const board = [...state.quests.board]
  while (board.length < data.config.quests.boardSize) {
    let quest: QuestInstance
    ;[quest, rng] = rollQuest(data, {
      rng,
      highestFloor: state.highestFloor,
      id: `q${nextQuestId}`
    })
    nextQuestId++
    board.push(quest)
  }
  if (board.length === state.quests.board.length) return state
  return { ...state, rng, quests: { ...state.quests, board, nextQuestId } }
}

const requireTown = (state: GameState): void => {
  if (state.battle) throw new ActionError('inBattle')
  if (state.location.type !== 'town') throw new ActionError('notInTown')
}

/** Nhận nhiệm vụ trên bảng (thị trấn, tối đa maxActive); bảng bổ sung nhiệm vụ mới. */
export function acceptQuest(data: GameData, state: GameState, questId: string): GameState {
  requireTown(state)
  const quest = state.quests.board.find((q) => q.id === questId)
  if (!quest) throw new ActionError('questNotFound', { questId })
  const { maxActive } = data.config.quests
  if (state.quests.active.length >= maxActive) throw new ActionError('tooManyQuests', { maxActive })
  const quests: QuestState = {
    ...state.quests,
    board: state.quests.board.filter((q) => q.id !== questId),
    active: [...state.quests.active, { ...quest, progress: 0 }]
  }
  return refillQuestBoard(data, { ...state, quests })
}

/** Hủy nhiệm vụ đang nhận (không mất gì; ngoài trận, ở đâu cũng được). */
export function abandonQuest(state: GameState, questId: string): GameState {
  if (state.battle) throw new ActionError('inBattle')
  if (!state.quests.active.some((q) => q.id === questId)) {
    throw new ActionError('questNotFound', { questId })
  }
  const active = state.quests.active.filter((q) => q.id !== questId)
  return { ...state, quests: { ...state.quests, active } }
}

/** Nhận thưởng nhiệm vụ đã hoàn thành (về thị trấn). */
export function claimQuest(state: GameState, questId: string): GameState {
  requireTown(state)
  const quest = state.quests.active.find((q) => q.id === questId)
  if (!quest) throw new ActionError('questNotFound', { questId })
  if (quest.progress < quest.target) {
    throw new ActionError('questNotComplete', {
      questId,
      progress: quest.progress,
      target: quest.target
    })
  }
  const inventory = quest.reward.items.reduce(
    (bag, item) => addItems(bag, item.itemId, item.count),
    state.inventory
  )
  const active = state.quests.active.filter((q) => q.id !== questId)
  return {
    ...state,
    money: state.money.plus(quest.reward.money),
    inventory,
    quests: { ...state.quests, active }
  }
}

/** Ghi tiến độ: mỗi nhiệm vụ đang nhận khớp sự kiện + 1 (không vượt target). */
export function recordQuestEvent(
  data: GameData,
  quests: QuestState,
  event: QuestEvent
): QuestState {
  let changed = false
  const active = quests.active.map((quest): ActiveQuest => {
    if (quest.progress >= quest.target) return quest
    if (!QUEST_TYPES[quest.objective.type].matches(quest.objective, event, data)) return quest
    changed = true
    return { ...quest, progress: quest.progress + 1 }
  })
  return changed ? { ...quests, active } : quests
}
