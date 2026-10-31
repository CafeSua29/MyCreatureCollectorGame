// Dưỡng dục (docs/rules/imprinting.md): bắt đầu khi quái nở, sinh yêu cầu chăm sóc theo ngày, nhận
// khi việc tương ứng xảy ra, hết thời gian thì chốt buff vĩnh viễn. Buff % chỉ số là nguồn
// "imprint" của STAT_PERCENT_SOURCES (registries/statPercentSources.ts).

import { ageDaysAtPercent, changeAffinity, isFavoriteItem } from '../registries'
import { asObject, assertNever, checkInteger, pickWeighted, type RngState } from '../shared'
import {
  IMPRINT_REQUEST_KINDS,
  imprintPercent,
  type DayEvent,
  type GameData,
  type Imprint,
  type ImprintRequest,
  type ImprintRequestTask,
  type Monster
} from '../model'
import { addMilestone } from './history'

/** Số ngày dưỡng dục tính từ lúc nở: tới hết ấu niên, hoặc fallbackDays khi tắt thọ nguyên. */
function imprintDays(data: GameData, monster: Monster): number {
  if (!monster.aging) return data.config.imprint.fallbackDays
  const youngUntil = ageDaysAtPercent(data, monster, data.config.lifespan.youngBelowPercent)
  return Math.max(1, youngUntil - monster.ageDays)
}

/** Trọng số món ăn được đòi: món đúng khẩu vị của quái (race / hệ) × favoriteFoodWeight. */
function foodWeight(data: GameData, monster: Monster, itemId: string): number {
  const item = data.items[itemId]
  const favorite = item?.category === 'consumable' && isFavoriteItem(data, item, monster)
  return favorite ? data.config.imprint.favoriteFoodWeight : 1
}

/** Tung một yêu cầu sinh vào ngày `day`, hạn tới yêu cầu kế tiếp (không quá endDay). */
function rollRequest(
  data: GameData,
  rng: RngState,
  { monster, day, endDay }: { monster: Monster; day: number; endDay: number }
): [ImprintRequest, RngState] {
  const { requestWeights, foods, requestEveryDays } = data.config.imprint
  let kind: (typeof IMPRINT_REQUEST_KINDS)[number]
  ;[kind, rng] = pickWeighted(rng, IMPRINT_REQUEST_KINDS, (k) => requestWeights[k])
  let task: ImprintRequestTask
  switch (kind) {
    case 'feed': {
      let itemId: string
      ;[itemId, rng] = pickWeighted(rng, foods, (id) => foodWeight(data, monster, id))
      task = { kind, itemId }
      break
    }
    case 'battle':
    case 'rest':
    case 'pet':
      task = { kind }
      break
    default:
      return assertNever(kind, 'yêu cầu dưỡng dục')
  }
  const dueDay = Math.min(endDay, day + requestEveryDays)
  return [{ ...task, dueDay, done: false }, rng]
}

/**
 * Bắt đầu dưỡng dục cho quái vừa nở vào ngày `day` (kèm yêu cầu đầu tiên). Quái đã từng dưỡng
 * dục giữ nguyên (mỗi quái một lần trong đời).
 */
export function startImprint(
  data: GameData,
  rng: RngState,
  monster: Monster,
  day: number
): [Monster, RngState] {
  if (monster.imprint) return [monster, rng]
  const endDay = Math.min(Number.MAX_SAFE_INTEGER, day + imprintDays(data, monster))
  // Tính sẵn số yêu cầu dự kiến để làm hết là đúng 100%.
  const total = Math.ceil((endDay - day) / data.config.imprint.requestEveryDays)
  let request: ImprintRequest
  ;[request, rng] = rollRequest(data, rng, { monster, day, endDay })
  return [{ ...monster, imprint: { phase: 'active', completed: 0, total, endDay, request } }, rng]
}

const matchesTask = (request: ImprintRequest, task: ImprintRequestTask): boolean =>
  task.kind === 'feed'
    ? request.kind === 'feed' && request.itemId === task.itemId
    : request.kind === task.kind

/** Quái đang đòi đúng việc này (yêu cầu chưa làm). */
export function isImprintRequested(monster: Monster, task: ImprintRequestTask): boolean {
  const { imprint } = monster
  return imprint?.phase === 'active' && !imprint.request.done && matchesTask(imprint.request, task)
}

/** Làm xong yêu cầu nếu quái đang đòi đúng việc này; không thì trả lại chính quái. */
export function fulfillImprint(monster: Monster, task: ImprintRequestTask): Monster {
  const { imprint } = monster
  if (imprint?.phase !== 'active' || !isImprintRequested(monster, task)) return monster
  const request = { ...imprint.request, done: true }
  return { ...monster, imprint: { ...imprint, completed: imprint.completed + 1, request } }
}

/** Hết thời gian dưỡng dục: chốt buff, thân mật + percent / 2, đạt 100% thì thêm mốc lý lịch. */
function finishImprint(
  data: GameData,
  monster: Monster,
  { day, events }: { day: number; events: DayEvent[] }
): Monster {
  if (monster.imprint?.phase !== 'active') return monster
  const { completed, total } = monster.imprint
  const imprint: Imprint = { phase: 'done', completed, total }
  const percent = imprintPercent(imprint)
  let finished = changeAffinity(data, { ...monster, imprint }, Math.floor(percent / 2))
  if (completed === total)
    finished = addMilestone(data, finished, { day, kind: 'imprintPerfected' })
  events.push({ type: 'imprintFinished', monsterId: monster.id, percent })
  return finished
}

/**
 * Ngày `day` của quái đang dưỡng dục: tới hạn thì yêu cầu cũ hết (chưa làm thì mất phần đó) và
 * sinh yêu cầu mới; hết thời gian thì chốt buff. Thời gian nhảy nhiều ngày thì sinh lần lượt các
 * yêu cầu đã tới ngày (lịch yêu cầu cố định từ lúc nở).
 */
export function advanceImprint(
  data: GameData,
  rng: RngState,
  { monster, day, events }: { monster: Monster; day: number; events: DayEvent[] }
): [Monster, RngState] {
  let current = monster
  while (current.imprint?.phase === 'active' && day >= current.imprint.request.dueDay) {
    const imprint = current.imprint
    if (imprint.request.dueDay >= imprint.endDay) {
      return [finishImprint(data, current, { day, events }), rng]
    }
    let request: ImprintRequest
    ;[request, rng] = rollRequest(data, rng, {
      monster: current,
      day: imprint.request.dueDay,
      endDay: imprint.endDay
    })
    current = { ...current, imprint: { ...imprint, request } }
    events.push({ type: 'imprintRequest', monsterId: current.id, request })
  }
  return [current, rng]
}

// ---------- Kiểm tra save ----------

const REQUEST_FIELDS = ['kind', 'dueDay', 'done']

function checkRequest(data: GameData, value: unknown, where: string, endDay: number): string[] {
  const request = asObject(value)
  if (!request) return [`${where} phải là object`]
  const kind = IMPRINT_REQUEST_KINDS.find((k) => k === request.kind)
  if (!kind) return [`${where}.kind không hợp lệ "${String(request.kind)}"`]
  const issues = [...checkInteger(request.dueDay, `${where}.dueDay`, 0)]
  if (typeof request.dueDay === 'number' && request.dueDay > endDay) {
    issues.push(`${where}.dueDay không được sau endDay (${endDay})`)
  }
  if (typeof request.done !== 'boolean') issues.push(`${where}.done phải là boolean`)
  const allowed = kind === 'feed' ? [...REQUEST_FIELDS, 'itemId'] : REQUEST_FIELDS
  const food = data.items[String(request.itemId)]
  if (kind === 'feed' && food?.category !== 'consumable' && food?.category !== 'dish') {
    issues.push(`${where}.itemId: món ăn không hợp lệ "${String(request.itemId)}"`)
  }
  for (const key of Object.keys(request)) {
    if (!allowed.includes(key)) issues.push(`${where}: trường lạ "${key}"`)
  }
  return issues
}

/** Kiểm tra trường imprint của quái (null hợp lệ; quái nào phải null do validateGameState quyết). */
export function validateImprint(data: GameData, value: unknown, where: string): string[] {
  if (value === null) return []
  const imprint = asObject(value)
  if (!imprint) return [`${where} phải là object hoặc null`]
  const issues = [
    ...checkInteger(imprint.completed, `${where}.completed`, 0),
    ...checkInteger(imprint.total, `${where}.total`, 1)
  ]
  const { completed, total } = imprint
  if (typeof completed === 'number' && typeof total === 'number' && completed > total) {
    issues.push(`${where}.completed (${completed}) không được vượt total (${total})`)
  }
  let allowed = ['phase', 'completed', 'total']
  if (imprint.phase === 'active') {
    allowed = [...allowed, 'endDay', 'request']
    issues.push(...checkInteger(imprint.endDay, `${where}.endDay`, 0))
    const endDay = typeof imprint.endDay === 'number' ? imprint.endDay : Infinity
    issues.push(...checkRequest(data, imprint.request, `${where}.request`, endDay))
  } else if (imprint.phase !== 'done') {
    issues.push(`${where}.phase không hợp lệ "${String(imprint.phase)}"`)
  }
  for (const key of Object.keys(imprint)) {
    if (!allowed.includes(key)) issues.push(`${where}: trường lạ "${key}"`)
  }
  return issues
}
