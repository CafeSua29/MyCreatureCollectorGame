// Dấu ấn trên quái (docs/rules/marks.md): nhận / lên cấp / mất dấu, bộ đếm (thích nghi, ám ảnh,
// chiến tích theo race), chọn dấu theo bộ phận, lý lịch, kiểm tra save. Hàm thuần, trả quái mới
// kèm thay đổi (log / lý lịch do nơi gọi ghi qua noteMarkChanges).

import {
  MARK_SOURCES,
  type AdaptationMarkDef,
  type GameData,
  type MarkChange,
  type MarkDef,
  type MarkInstance,
  type MarkLogEntry,
  type MarkOrigin,
  type MarkRemoval,
  type Monster,
  type MutationMarkDef,
  type ScarMarkDef,
  type TrophyMarkDef
} from '../model'
import {
  asObject,
  assertNever,
  checkInteger,
  pickWeighted,
  rollPercent,
  type RngState
} from '../shared'
import {
  findMark,
  findMarkDef,
  hasMarkData,
  isMarkTarget,
  markAcceptsTarget,
  markCounterKey,
  markDefsOfKind,
  markOnPart,
  markPartId,
  markTargetKind,
  monsterBodyPlan
} from '../registries'
import { addMilestone } from './history'

/** Một lần nhận dấu. */
export interface MarkGain {
  markId: string
  targetId?: string
  origin: MarkOrigin
}

/** Quái sau một thao tác dấu và các thay đổi (rỗng = không đổi gì). */
export interface MarkResult {
  monster: Monster
  changes: MarkChange[]
}

const unchanged = (monster: Monster): MarkResult => ({ monster, changes: [] })

/** Cấp tối đa của mục; không trần = Infinity. */
const maxLevelOf = (def: MarkDef): number => def.maxLevel ?? Infinity

/**
 * Nhận dấu `gain`: đã có cùng id + đối tượng thì lên cấp (chưa tới maxLevel); sẹo / đột biến mà bộ
 * phận đã có dấu cùng loại khác id thì không ra (giữ cái cũ); bộ phận / đối tượng không hợp thì
 * không đổi.
 */
export function gainMark(data: GameData, monster: Monster, gain: MarkGain): MarkResult {
  const def = findMarkDef(data, gain.markId)
  if (!def) return unchanged(monster)
  const targetKind = markTargetKind(def)
  if ((targetKind === undefined) !== (gain.targetId === undefined)) return unchanged(monster)
  if (gain.targetId !== undefined && !markAcceptsTarget(data, def, gain.targetId)) {
    return unchanged(monster)
  }
  const existing = findMark(monster, def.id, gain.targetId)
  if (existing) return levelUp(def, monster, existing, gain.origin)
  if ((def.kind === 'scar' || def.kind === 'mutation') && markOnPart(data, monster, def)) {
    return unchanged(monster)
  }
  const mark: MarkInstance = {
    markId: def.id,
    ...(gain.targetId === undefined ? {} : { targetId: gain.targetId }),
    level: 1,
    origin: gain.origin
  }
  return {
    monster: { ...monster, marks: [...monster.marks, mark] },
    changes: [
      { kind: 'gained', markId: def.id, targetId: gain.targetId, level: 1, origin: gain.origin }
    ]
  }
}

function levelUp(
  def: MarkDef,
  monster: Monster,
  existing: MarkInstance,
  origin: MarkOrigin
): MarkResult {
  if (existing.level >= maxLevelOf(def)) return unchanged(monster)
  const level = existing.level + 1
  return {
    monster: {
      ...monster,
      marks: monster.marks.map((mark) => (mark === existing ? { ...mark, level } : mark))
    },
    changes: [{ kind: 'gained', markId: def.id, targetId: existing.targetId, level, origin }]
  }
}

/** Bỏ dấu (id + đối tượng); không có thì không đổi. */
export function removeMark(
  monster: Monster,
  { markId, targetId }: { markId: string; targetId?: string },
  reason: MarkRemoval
): MarkResult {
  const mark = findMark(monster, markId, targetId)
  if (!mark) return unchanged(monster)
  return {
    monster: { ...monster, marks: monster.marks.filter((each) => each !== mark) },
    changes: [{ kind: 'removed', markId, targetId, reason }]
  }
}

/** Gộp kết quả của thao tác tiếp theo vào kết quả đang có. */
export function chainMarks(result: MarkResult, next: (monster: Monster) => MarkResult): MarkResult {
  const after = next(result.monster)
  return { monster: after.monster, changes: [...result.changes, ...after.changes] }
}

/** Dấu loại `kind` của quái kèm mục dữ liệu (dấu không còn mục bị bỏ qua). */
export function marksOfKind<K extends MarkDef['kind']>(
  data: GameData,
  monster: Monster,
  kind: K
): { mark: MarkInstance; def: Extract<MarkDef, { kind: K }> }[] {
  const result: { mark: MarkInstance; def: Extract<MarkDef, { kind: K }> }[] = []
  for (const mark of monster.marks) {
    const def = findMarkDef(data, mark.markId)
    // Ép kiểu vì vừa so kind.
    if (def?.kind === kind) result.push({ mark, def: def as Extract<MarkDef, { kind: K }> })
  }
  return result
}

/**
 * Nhận / lên cấp `times` lần mọi chiến tích có cách nhận `trigger` (cách nhận không theo đối tượng:
 * hạ boss, boss thế giới, độ kiếp).
 */
export function grantTriggerTrophies(
  data: GameData,
  monster: Monster,
  {
    trigger,
    times,
    origin
  }: { trigger: 'bossKill' | 'worldBoss' | 'tribulation'; times: number; origin: MarkOrigin }
): MarkResult {
  let result = unchanged(monster)
  for (const def of markDefsOfKind(data, 'trophy')) {
    if (def.trigger !== trigger) continue
    for (let i = 0; i < times; i++) {
      result = chainMarks(result, (current) => gainMark(data, current, { markId: def.id, origin }))
    }
  }
  return result
}

// ---------- Chọn dấu theo bộ phận ----------

/** Bộ lọc sẹo: sẹo vết thương (không trạng thái) hoặc sẹo của một trạng thái. */
export type ScarFilter = { wound: true } | { statusId: string }

const matchesScar = (def: ScarMarkDef, filter: ScarFilter): boolean =>
  'statusId' in filter ? (def.statusIds?.includes(filter.statusId) ?? false) : !def.statusIds

/** Chọn sẹo / đột biến: loại, bộ phận (bỏ trống = mọi bộ phận quái có), loại sẹo. */
export interface PartMarkQuery {
  monster: Monster
  kind: 'scar' | 'mutation'
  partId?: string
  scar?: ScarFilter
}

/**
 * Sẹo / đột biến có thể ra: mục cùng loại ở bộ phận quái có, bỏ bộ phận đã có dấu cùng loại khác id
 * (vì sẽ không ra).
 */
export function partMarkCandidates(
  data: GameData,
  { monster, kind, partId, scar = { wound: true } }: PartMarkQuery
): (ScarMarkDef | MutationMarkDef)[] {
  const parts = monsterBodyPlan(data, monster).parts
  const defs: (ScarMarkDef | MutationMarkDef)[] =
    kind === 'scar'
      ? markDefsOfKind(data, 'scar').filter((def) => matchesScar(def, scar))
      : markDefsOfKind(data, 'mutation')
  return defs.filter((def) => {
    if (!parts.includes(def.partId) || (partId !== undefined && def.partId !== partId)) return false
    const current = markOnPart(data, monster, { kind, partId: def.partId })
    return !current || current.markId === def.id
  })
}

/**
 * Tung `chance` % rồi chọn theo trọng số và nhận một sẹo / đột biến trong partMarkCandidates. Không
 * có mục nào hợp hoặc tỉ lệ 0 thì không tung (không tốn RNG).
 */
export function rollPartMarkGain(
  data: GameData,
  rng: RngState,
  query: PartMarkQuery & { chance: number; origin: MarkOrigin }
): [MarkResult, RngState] {
  const { monster, chance, origin } = query
  const candidates = partMarkCandidates(data, query)
  if (candidates.length === 0 || chance <= 0) return [unchanged(monster), rng]
  let hit: boolean
  ;[hit, rng] = rollPercent(rng, chance)
  if (!hit) return [unchanged(monster), rng]
  let def: MarkDef
  ;[def, rng] = pickWeighted(rng, candidates, (each) => each.weight)
  return [gainMark(data, monster, { markId: def.id, origin }), rng]
}

// ---------- Bộ đếm ----------

/** Quái với bộ đếm `key` cộng `amount` (về ≤ 0 thì bỏ khóa). */
export function addMarkCounter(monster: Monster, key: string, amount: number): Monster {
  const value = (monster.markCounters[key] ?? 0) + amount
  return value > 0
    ? { ...monster, markCounters: { ...monster.markCounters, [key]: value } }
    : clearMarkCounter(monster, key)
}

/** Quái bỏ bộ đếm `key`. */
export function clearMarkCounter(monster: Monster, key: string): Monster {
  if (!Object.hasOwn(monster.markCounters, key)) return monster
  const { [key]: _old, ...rest } = monster.markCounters
  return { ...monster, markCounters: rest }
}

/** Dấu tính theo bộ đếm có ngưỡng tăng dần: thích nghi, chiến tích theo race. */
type CountedMarkDef = AdaptationMarkDef | (TrophyMarkDef & { threshold: number })

/**
 * Cộng `amount` vào bộ đếm của dấu `def` với đối tượng `targetId`; đủ threshold × (cấp hiện tại + 1)
 * thì nhận / lên cấp và trừ phần đã dùng (ngưỡng tăng dần, không trần; tới maxLevel thì thôi đếm).
 */
export function advanceCountedMark(
  data: GameData,
  monster: Monster,
  {
    def,
    targetId,
    amount,
    origin
  }: { def: CountedMarkDef; targetId: string; amount: number; origin: MarkOrigin }
): MarkResult {
  if (amount <= 0 || !markAcceptsTarget(data, def, targetId)) return unchanged(monster)
  const key = markCounterKey(def.id, targetId)
  let result: MarkResult = { monster: addMarkCounter(monster, key, amount), changes: [] }
  for (;;) {
    const level = findMark(result.monster, def.id, targetId)?.level ?? 0
    // Đã tối đa: bộ đếm không còn tác dụng, bỏ khóa cho save gọn.
    if (level >= maxLevelOf(def))
      return { ...result, monster: clearMarkCounter(result.monster, key) }
    const need = def.threshold * (level + 1)
    if ((result.monster.markCounters[key] ?? 0) < need) return result
    const next = gainMark(data, addMarkCounter(result.monster, key, -need), {
      markId: def.id,
      targetId,
      origin
    })
    if (next.changes.length === 0) return result
    result = { monster: next.monster, changes: [...result.changes, ...next.changes] }
  }
}

// ---------- Lý lịch ----------

/** Ghi mốc lý lịch cho các thay đổi dấu (markGained / markRemoved). */
export function noteMarkChanges(
  data: GameData,
  monster: Monster,
  changes: readonly MarkChange[],
  day: number
): Monster {
  let result = monster
  for (const change of changes) {
    const target = change.targetId === undefined ? {} : { targetId: change.targetId }
    if (change.kind === 'removed') {
      result = addMilestone(data, result, {
        day,
        kind: 'markRemoved',
        markId: change.markId,
        ...target,
        reason: change.reason
      })
      continue
    }
    const { source, floor, opponentSpeciesId } = change.origin
    result = addMilestone(data, result, {
      day,
      kind: 'markGained',
      markId: change.markId,
      ...target,
      level: change.level,
      source,
      ...(floor === null ? {} : { floor }),
      ...(opponentSpeciesId === undefined ? {} : { opponentSpeciesId })
    })
  }
  return result
}

// ---------- Kiểm tra save ----------

const isMarkSource = (value: unknown): boolean => MARK_SOURCES.some((source) => source === value)

function checkOrigin(data: GameData, value: unknown, where: string): string[] {
  const origin = asObject(value)
  if (!origin) return [`${where} phải là object`]
  const issues: string[] = []
  if (!isMarkSource(origin.source))
    issues.push(`${where}.source không hợp lệ "${String(origin.source)}"`)
  if (origin.floor !== null) issues.push(...checkInteger(origin.floor, `${where}.floor`, 1))
  const opponent = origin.opponentSpeciesId
  if (
    opponent !== undefined &&
    (typeof opponent !== 'string' || !isMarkTarget(data, 'species', opponent))
  ) {
    issues.push(`${where}.opponentSpeciesId: loài không hợp lệ "${String(opponent)}"`)
  }
  for (const key of Object.keys(origin)) {
    if (!['source', 'floor', 'opponentSpeciesId'].includes(key)) {
      issues.push(`${where}: trường lạ "${key}"`)
    }
  }
  return issues
}

const MARK_FIELDS = ['markId', 'targetId', 'level', 'origin', 'winBattles', 'resolveCount']

function checkMark(data: GameData, value: unknown, where: string): string[] {
  const mark = asObject(value)
  if (!mark) return [`${where} phải là object`]
  const def = typeof mark.markId === 'string' ? findMarkDef(data, mark.markId) : undefined
  if (!def) return [`${where}.markId: dấu không tồn tại "${String(mark.markId)}"`]
  const issues = [
    ...checkInteger(mark.level, `${where}.level`, 1),
    ...checkOrigin(data, mark.origin, `${where}.origin`)
  ]
  if (typeof mark.level === 'number' && mark.level > maxLevelOf(def)) {
    issues.push(`${where}.level vượt maxLevel ${String(def.maxLevel)}`)
  }
  const kind = markTargetKind(def)
  if (kind === undefined && mark.targetId !== undefined)
    issues.push(`${where}: dấu không có targetId`)
  if (
    kind !== undefined &&
    (typeof mark.targetId !== 'string' || !markAcceptsTarget(data, def, mark.targetId))
  ) {
    issues.push(
      `${where}.targetId: không phải đối tượng ${kind} của dấu "${String(mark.targetId)}"`
    )
  }
  if (mark.winBattles !== undefined) {
    if (def.kind !== 'scar') issues.push(`${where}: chỉ sẹo có winBattles`)
    issues.push(...checkInteger(mark.winBattles, `${where}.winBattles`, 1))
  }
  if (mark.resolveCount !== undefined) {
    if (def.kind !== 'trauma') issues.push(`${where}: chỉ ám ảnh có resolveCount`)
    issues.push(...checkInteger(mark.resolveCount, `${where}.resolveCount`, 1))
  }
  for (const key of Object.keys(mark)) {
    if (!MARK_FIELDS.includes(key)) issues.push(`${where}: trường lạ "${key}"`)
  }
  return issues
}

/**
 * Kiểm tra dấu ấn trong save: mục tồn tại, đối tượng hợp lệ, cấp ≤ maxLevel, không trùng cặp id +
 * đối tượng, mỗi bộ phận tối đa một sẹo và một đột biến; bộ đếm nguyên ≥ 1.
 */
export function checkMonsterMarks(
  data: GameData,
  { marks, counters }: { marks: unknown; counters: unknown },
  where: { marks: string; counters: string }
): string[] {
  if (!Array.isArray(marks)) return [`${where.marks} phải là danh sách`]
  const issues = marks.flatMap((mark, i) => checkMark(data, mark, `${where.marks}[${i}]`))
  if (issues.length === 0) issues.push(...checkUnique(data, marks as MarkInstance[], where.marks))
  const table = asObject(counters)
  if (!table) return [...issues, `${where.counters} phải là object`]
  for (const [key, count] of Object.entries(table)) {
    issues.push(...checkInteger(count, `${where.counters}.${key}`, 1))
  }
  return issues
}

/** Không trùng cặp id + đối tượng; mỗi bộ phận tối đa một sẹo, một đột biến. */
function checkUnique(data: GameData, marks: readonly MarkInstance[], where: string): string[] {
  const issues: string[] = []
  const seen = new Set<string>()
  const parts = new Set<string>()
  for (const mark of marks) {
    const key = markCounterKey(mark.markId, mark.targetId ?? '')
    if (seen.has(key)) issues.push(`${where}: trùng dấu "${key}"`)
    seen.add(key)
    const def = findMarkDef(data, mark.markId)
    const partId = def && markPartId(def)
    if (!def || partId === undefined || (def.kind !== 'scar' && def.kind !== 'mutation')) continue
    const partKey = `${def.kind}:${partId}`
    if (parts.has(partKey)) issues.push(`${where}: bộ phận "${partId}" có hơn một ${def.kind}`)
    parts.add(partKey)
  }
  return issues
}

/** Dòng log (trận, ngoài trận hoặc event, cùng dạng) cho một thay đổi dấu của quái. */
export function markLogEntry(monsterId: string, change: MarkChange): MarkLogEntry {
  const target = change.targetId === undefined ? {} : { targetId: change.targetId }
  return change.kind === 'gained'
    ? {
        type: 'markGained',
        monsterId,
        markId: change.markId,
        ...target,
        level: change.level,
        source: change.origin.source
      }
    : { type: 'markRemoved', monsterId, markId: change.markId, ...target, reason: change.reason }
}

// ---------- Nguồn ngoài trận ----------

/**
 * Quái hoang / boss sinh ra (tung sau cùng): wildMarkPercent % mang sẵn một dấu, trong đó
 * wildMutationShare % là đột biến, còn lại là sẹo vết thương (để bắt được quái có dấu sẵn).
 */
export function rollSpawnMarks(
  data: GameData,
  rng: RngState,
  { monster, floor }: { monster: Monster; floor: number }
): [Monster, RngState] {
  const { wildMarkPercent, wildMutationShare } = data.config.marks
  if (!hasMarkData(data) || wildMarkPercent <= 0) return [monster, rng]
  let hit: boolean
  ;[hit, rng] = rollPercent(rng, wildMarkPercent)
  if (!hit) return [monster, rng]
  let mutation: boolean
  ;[mutation, rng] = rollPercent(rng, wildMutationShare)
  let result: MarkResult
  ;[result, rng] = rollPartMarkGain(data, rng, {
    monster,
    kind: mutation ? 'mutation' : 'scar',
    chance: 100,
    origin: { source: 'wild', floor: floor >= 1 ? floor : null }
  })
  return [result.monster, rng]
}

/** % truyền của một dấu khi breeding; dấu không di truyền = 0. */
function inheritPercentOf(data: GameData, def: MarkDef): number {
  const { mutationInheritPercent, adaptationInheritPercent } = data.config.marks
  switch (def.kind) {
    case 'mutation':
      return def.inheritPercent ?? mutationInheritPercent
    case 'adaptation':
      return def.inheritPercent ?? adaptationInheritPercent
    case 'scar':
    case 'trauma':
    case 'trophy':
      return 0
    default:
      return assertNever(def, 'loại dấu')
  }
}

/**
 * Con breeding nhận dấu của bố mẹ (tung sau các bước breeding cũ): lần lượt mẹ rồi bố, mỗi đột biến
 * / thích nghi tung % truyền của mục, giữ cấp của bố / mẹ; đột biến chỉ khi con có bộ phận đó và bộ
 * phận chưa có đột biến (mẹ trước). Sẹo / ám ảnh / chiến tích không truyền. Sau đó tung
 * birthMutationPercent % một đột biến mới bẩm sinh.
 */
export function rollChildMarks(
  data: GameData,
  rng: RngState,
  { child, parents }: { child: Monster; parents: readonly Monster[] }
): [Monster, RngState] {
  if (!hasMarkData(data)) return [child, rng]
  let result = child
  const origin: MarkOrigin = { source: 'inherited', floor: null }
  for (const parent of parents) {
    for (const mark of parent.marks) {
      const def = findMarkDef(data, mark.markId)
      const percent = def ? inheritPercentOf(data, def) : 0
      if (!def || percent <= 0 || !canInherit(data, result, def, mark)) continue
      let inherited: boolean
      ;[inherited, rng] = rollPercent(rng, percent)
      if (!inherited) continue
      const copy: MarkInstance = {
        markId: mark.markId,
        ...(mark.targetId === undefined ? {} : { targetId: mark.targetId }),
        level: Math.min(mark.level, maxLevelOf(def)),
        origin
      }
      result = { ...result, marks: [...result.marks, copy] }
    }
  }
  let born: MarkResult
  ;[born, rng] = rollPartMarkGain(data, rng, {
    monster: result,
    kind: 'mutation',
    chance: data.config.marks.birthMutationPercent,
    origin: { source: 'birth', floor: null }
  })
  return [born.monster, rng]
}

/** Con nhận được dấu này không (chưa có cùng id + đối tượng; đột biến: có bộ phận, bộ phận trống). */
function canInherit(data: GameData, child: Monster, def: MarkDef, mark: MarkInstance): boolean {
  if (findMark(child, mark.markId, mark.targetId)) return false
  if (def.kind !== 'mutation') return true
  return (
    monsterBodyPlan(data, child).parts.includes(def.partId) &&
    !markOnPart(data, child, { kind: 'mutation', partId: def.partId })
  )
}

/**
 * Luân hồi (thân xác mới, rebirth.md): xóa mọi sẹo và ám ảnh (kèm bộ đếm ám ảnh), giữ đột biến,
 * thích nghi, chiến tích.
 */
export function clearRebirthMarks(data: GameData, monster: Monster): MarkResult {
  let result = unchanged(monster)
  for (const { mark } of [
    ...marksOfKind(data, monster, 'scar'),
    ...marksOfKind(data, monster, 'trauma')
  ]) {
    result = chainMarks(result, (current) => removeMark(current, mark, 'rebirth'))
  }
  const traumaIds = markDefsOfKind(data, 'trauma').map((def) => `${def.id}:`)
  let cleared = result.monster
  for (const key of Object.keys(cleared.markCounters)) {
    if (traumaIds.some((prefix) => key.startsWith(prefix))) cleared = clearMarkCounter(cleared, key)
  }
  return { ...result, monster: cleared }
}

/** Ghi log ngoài trận cho các thay đổi dấu của quái. */
export function markLogEntries(monsterId: string, changes: readonly MarkChange[]): MarkLogEntry[] {
  return changes.map((change) => markLogEntry(monsterId, change))
}

/**
 * Thay đổi dấu giữa hai trạng thái của cùng một quái (dấu mới / lên cấp = gained với `origin`, dấu
 * mất = removed với `reason`); dùng khi thao tác không trả thay đổi (hiệu ứng vật phẩm).
 */
export function markChangesBetween(
  before: Pick<Monster, 'marks'>,
  after: Pick<Monster, 'marks'>,
  { origin, reason }: { origin: MarkOrigin; reason: MarkRemoval }
): MarkChange[] {
  const changes: MarkChange[] = []
  for (const mark of after.marks) {
    const old = findMark(before, mark.markId, mark.targetId)
    if (old && old.level >= mark.level) continue
    changes.push({
      kind: 'gained',
      markId: mark.markId,
      targetId: mark.targetId,
      level: mark.level,
      origin
    })
  }
  for (const mark of before.marks) {
    if (findMark(after, mark.markId, mark.targetId)) continue
    changes.push({ kind: 'removed', markId: mark.markId, targetId: mark.targetId, reason })
  }
  return changes
}
