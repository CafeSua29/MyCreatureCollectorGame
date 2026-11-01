// Nghiên cứu loài (docs/rules/species-research.md): nhiệm vụ của loài (mẫu chung + nhiệm vụ riêng),
// điểm, cấp, lợi ích theo cấp. Điểm duy nhất cho các câu hỏi này; bộ đếm cộng qua recordResearch ở
// chỗ phát sinh (như bumpStat), đặt ở registries để battle / world / progression gọi được.

import { preEvolutionsOf } from '../inventory'
import type {
  BattleEvent,
  GameData,
  Monster,
  ResearchPercentType,
  ResearchRevealType,
  ResearchState,
  ResearchTask,
  ResearchTaskKind,
  ResearchTaskScope,
  Species
} from '../model'
import { dexSpeciesOf, isDexSpecies } from './dex'

/** Loài nào nhận mẫu nhiệm vụ theo phạm vi (thêm phạm vi = thêm mục). */
const RESEARCH_TASK_SCOPES: Record<
  ResearchTaskScope,
  (data: GameData, speciesId: string) => boolean
> = {
  all: () => true,
  // "Tiến hóa ra loài đó" chỉ cho loài có dạng trước (không phải dạng đầu).
  evolvedForm: (data, speciesId) => preEvolutionsOf(data, speciesId).length > 0
}

const tasksCache = new WeakMap<GameData['config'], Map<string, readonly ResearchTask[]>>()

/** Nhiệm vụ của loài: mẫu chung đúng phạm vi rồi nhiệm vụ riêng của loài. Loài ngoài Dex = rỗng. */
export function researchTasksOf(data: GameData, speciesId: string): readonly ResearchTask[] {
  let bySpecies = tasksCache.get(data.config)
  if (!bySpecies) {
    bySpecies = new Map()
    tasksCache.set(data.config, bySpecies)
  }
  const cached = bySpecies.get(speciesId)
  if (cached) return cached
  const { tasks, speciesTasks } = data.config.research
  const result = isDexSpecies(data.species[speciesId])
    ? [
        ...tasks.filter((task) => RESEARCH_TASK_SCOPES[task.scope ?? 'all'](data, speciesId)),
        ...(Object.hasOwn(speciesTasks, speciesId) ? speciesTasks[speciesId] : [])
      ]
    : []
  bySpecies.set(speciesId, result)
  return result
}

/** Bộ đếm `kind` của loài (chưa có = 0). */
export const researchCounter = (
  research: ResearchState,
  speciesId: string,
  kind: ResearchTaskKind
): number => (Object.hasOwn(research, speciesId) ? (research[speciesId].counters[kind] ?? 0) : 0)

/** Điểm nghiên cứu của loài: mỗi mốc nhiệm vụ đã đạt cho điểm của nhiệm vụ đó. */
export function researchPoints(data: GameData, research: ResearchState, speciesId: string): number {
  let points = 0
  for (const task of researchTasksOf(data, speciesId)) {
    const count = researchCounter(research, speciesId, task.kind)
    points += task.points * task.thresholds.filter((value) => value <= count).length
  }
  return points
}

/** Cấp cao nhất (= Hoàn thành). */
export const maxResearchLevel = (data: GameData): number => data.config.research.levelPoints.length

/** Cấp nghiên cứu của loài: số mốc levelPoints đã đạt (0 = chưa nghiên cứu). */
export function researchLevel(data: GameData, research: ResearchState, speciesId: string): number {
  const points = researchPoints(data, research, speciesId)
  return data.config.research.levelPoints.filter((need) => need <= points).length
}

/** Loài đã Hoàn thành nghiên cứu (cấp cao nhất). */
export const isResearchComplete = (
  data: GameData,
  research: ResearchState,
  speciesId: string
): boolean => researchLevel(data, research, speciesId) >= maxResearchLevel(data)

/** Số loài đã Hoàn thành nghiên cứu (điều kiện thành tựu, Bùa Lấp Lánh). */
export const researchCompletedCount = (data: GameData, research: ResearchState): number =>
  Object.keys(research).filter((speciesId) => isResearchComplete(data, research, speciesId)).length

/** Loài đã mở thông tin `type` (cấp ≥ cấp của lợi ích đó). */
export function hasResearchReveal(
  data: GameData,
  research: ResearchState,
  speciesId: string,
  type: ResearchRevealType
): boolean {
  const level = researchLevel(data, research, speciesId)
  return data.config.research.benefits.some((b) => b.type === type && b.level <= level)
}

/** Tổng % của kênh `type` từ các lợi ích loài đã đạt (cộng như mọi nguồn cùng kênh). */
export function researchPercent(
  data: GameData,
  research: ResearchState,
  speciesId: string,
  type: ResearchPercentType
): number {
  if (!Object.hasOwn(research, speciesId)) return 0
  const level = researchLevel(data, research, speciesId)
  let percent = 0
  for (const benefit of data.config.research.benefits) {
    if (benefit.type === type && benefit.level <= level) percent += benefit.percent
  }
  return percent
}

/** Hệ số nhân của kênh `type` cho loài (1 + % / 100, không âm). */
export const researchMultiplier = (
  data: GameData,
  research: ResearchState,
  speciesId: string,
  type: ResearchPercentType
): number => Math.max(0, 1 + researchPercent(data, research, speciesId, type) / 100)

/**
 * Cộng `amount` (nguyên ≥ 0) vào bộ đếm `kind` của các loài (chỉ loài thuộc Dex, mỗi loài một lần).
 * 0 hoặc không có loài nào thì trả state cũ. Dừng ở MAX_SAFE_INTEGER.
 */
export function recordResearch(
  data: GameData,
  research: ResearchState,
  {
    speciesIds,
    kind,
    amount = 1
  }: { speciesIds: readonly string[]; kind: ResearchTaskKind; amount?: number }
): ResearchState {
  if (amount <= 0) return research
  let next = research
  speciesIds.forEach((speciesId, i) => {
    if (speciesIds.indexOf(speciesId) !== i || !isDexSpecies(data.species[speciesId])) return
    const entry = Object.hasOwn(next, speciesId)
      ? next[speciesId]
      : { counters: {}, claimedLevel: 0 }
    const count = Math.min(Number.MAX_SAFE_INTEGER, (entry.counters[kind] ?? 0) + amount)
    next = { ...next, [speciesId]: { ...entry, counters: { ...entry.counters, [kind]: count } } }
  })
  return next
}

/** Cộng bộ đếm `kind` cho loài của từng quái (loài hiện tại và loài gốc, như Dex). */
export const recordMonsterResearch = (
  data: GameData,
  research: ResearchState,
  monsters: readonly Pick<Monster, 'speciesId' | 'baseSpeciesId'>[],
  kind: ResearchTaskKind
): ResearchState =>
  monsters.reduce(
    (next, monster) =>
      recordResearch(data, next, { speciesIds: dexSpeciesOf(data, monster), kind }),
    research
  )

/** Quái về tay người chơi bằng bắt / Thị Uy / thu phục / khu bảo tồn: + bắt, quái shiny + bắt shiny. */
export const recordCaughtResearch = (
  data: GameData,
  research: ResearchState,
  monsters: readonly Pick<Monster, 'speciesId' | 'baseSpeciesId' | 'shinyStacks'>[]
): ResearchState =>
  recordMonsterResearch(
    data,
    recordMonsterResearch(data, research, monsters, 'caught'),
    monsters.filter((monster) => monster.shinyStacks > 0),
    'caughtShiny'
  )

/** Tiến hóa (cả dị biến) theo log của kết quả tiến hóa: + "tiến hóa ra" cho loài mới. */
export function recordEvolutionResearch(
  data: GameData,
  research: ResearchState,
  events: readonly BattleEvent[]
): ResearchState {
  let next = research
  for (const event of events) {
    if (event.type !== 'evolve' && event.type !== 'mutatedEvolution') continue
    next = recordResearch(data, next, { speciesIds: [event.toSpeciesId], kind: 'evolvedInto' })
  }
  return next
}

/** Hệ chính của loài (hệ đầu tiên) cho nhiệm vụ "thấy loài đó dùng skill hệ chính". */
export const mainElementOf = (species: Species): string | null =>
  species.kind === 'normal' ? (species.elementIds[0] ?? null) : null
